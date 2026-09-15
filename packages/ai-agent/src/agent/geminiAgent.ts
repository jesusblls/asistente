import { GoogleGenAI, Type, FunctionDeclaration, type Content, type Part } from '@google/genai';
import {
  db,
  diffChanges,
  recordAudit,
  type AuditActor,
  type AuditEntry,
  type Doctor,
  type Service,
  type Tenant,
  type Appointment,
} from '@asistente/database';
import { createLogger } from '@asistente/observability';
import { SchedulerService } from '../calendar/scheduler.js';
import { evaluateTriage, type TriageResult } from '../triage/triageEngine.js';
import { normalizeMexicanPhone } from '../utils/phone.js';

const logger = createLogger('ai-agent');

/**
 * Actor de auditoría para lo que el agente hace por su cuenta: agendar,
 * confirmar, cancelar o revelar una cita por el canal.
 */
const AGENT_AUDIT_ACTOR: AuditActor = { type: 'AI_AGENT', id: 'omnichannel-agent' };

function agentAuditMetadata(context: AgentContext, tool: string): Record<string, unknown> {
  return { tool, channel: context.channel, conversationId: context.conversationId ?? null };
}

function auditAgentAction(
  context: AgentContext,
  tool: string,
  entry: Pick<AuditEntry, 'action' | 'entityType' | 'entityId' | 'patientId' | 'changes'>,
  writer?: Parameters<typeof recordAudit>[1]
): Promise<void> {
  return recordAudit(
    {
      ...entry,
      tenantId: context.tenantId,
      actor: AGENT_AUDIT_ACTOR,
      metadata: agentAuditMetadata(context, tool),
    },
    writer
  );
}

export interface AgentTenant extends Tenant {
  doctors: Doctor[];
  services: Service[];
}

interface FunctionCallPart {
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
  text?: string;
}

export interface AgentContext {
  tenantId: string;
  patientPhone: string;
  patientName?: string;
  channel: 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'PHONE_CALL' | 'WEBCHAT';
  conversationId?: string;
}

export interface AgentResponse {
  replyText: string;
  appointmentBooked?: Appointment | null;
  triageAlert?: TriageResult | null;
  paymentLinkGenerated?: string;
  requiresHumanHandover?: boolean;
}

/**
 * Devuelve la fecha (YYYY-MM-DD) en huso de CDMX, nunca en UTC del servidor.
 */
function cdmxDateStr(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(date);
}

// Declaraciones de herramientas para Gemini 2.5 Flash
export const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'consultar_disponibilidad',
    description: 'Consulta los horarios disponibles de los doctores para una fecha determinada en formato YYYY-MM-DD.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        fecha: {
          type: Type.STRING,
          description: 'Fecha a consultar en formato YYYY-MM-DD (ejemplo: 2026-09-10).',
        },
        servicioId: {
          type: Type.STRING,
          description: 'ID del servicio dental/médico solicitado (opcional).',
        },
        doctorId: {
          type: Type.STRING,
          description: 'ID del doctor preferido (opcional).',
        },
        preferenciaTurno: {
          type: Type.STRING,
          enum: ['morning', 'afternoon', 'any'],
          description: 'Preferencia de horario: "morning" (mañana), "afternoon" (tarde) o "any" (cualquiera).',
        },
      },
      required: ['fecha'],
    },
  },
  {
    name: 'agendar_cita',
    description: 'Confirma y agenda formalmente una cita médica o dental en el sistema.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        nombrePaciente: {
          type: Type.STRING,
          description: 'Nombre completo del paciente.',
        },
        telefonoPaciente: {
          type: Type.STRING,
          description:
            'Solo para llamadas con número oculto, donde el canal no aporta el teléfono. En WhatsApp y en llamadas con identificador, omítelo: el sistema usa el número desde el que escribe o llama el paciente.',
        },
        servicioId: {
          type: Type.STRING,
          description: 'ID del servicio a realizar.',
        },
        doctorId: {
          type: Type.STRING,
          description: 'ID del doctor que atenderá la consulta.',
        },
        horarioInicioIso: {
          type: Type.STRING,
          description: 'Fecha y hora de inicio de la cita en formato ISO 8601 (obtenido de consultar_disponibilidad).',
        },
        sintomas: {
          type: Type.STRING,
          description: 'Descripción breve del motivo de consulta o síntomas del paciente.',
        },
      },
      required: ['nombrePaciente', 'servicioId', 'doctorId', 'horarioInicioIso'],
    },
  },
  {
    name: 'evaluar_urgencia_sintomas',
    description: 'Evalúa la gravedad de los síntomas del paciente (dolor, traumatismo, hemorragia) para triaje médico o dental.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sintomas: {
          type: Type.STRING,
          description: 'Descripción detallada de los síntomas que manifiesta el paciente.',
        },
        nivelDolor: {
          type: Type.NUMBER,
          description: 'Nivel de dolor en escala del 1 al 10 (opcional).',
        },
      },
      required: ['sintomas'],
    },
  },
  {
    name: 'consultar_faq_clinica',
    description: 'Busca respuestas oficiales sobre ubicación, seguros médicos, formas de pago, estacionamiento y cuidados clínicos.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        consulta: {
          type: Type.STRING,
          description: 'Pregunta o tema que desea saber el paciente.',
        },
      },
      required: ['consulta'],
    },
  },
  {
    name: 'confirmar_asistencia_cita',
    description:
      'Confirma la asistencia formal del paciente a su próxima cita. Siempre opera sobre el paciente que escribe o llama; no recibe teléfono.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'consultar_citas_paciente',
    description:
      'Consulta los datos de la próxima cita del paciente que escribe o llama (fecha, hora, doctor, servicio). No recibe teléfono: nunca consulta citas de terceros.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'cancelar_cita_paciente',
    description:
      'Cancela la próxima cita del paciente que escribe o llama, sin penalización. No recibe teléfono: nunca cancela citas de terceros.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        motivo: {
          type: Type.STRING,
          description: 'Motivo de la cancelación.',
        },
      },
    },
  },
  {
    name: 'transferir_a_recepcionista_humano',
    description: 'Transfiere la conversación a un recepcionista humano cuando el paciente lo exige o hay una situación compleja.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        motivo: {
          type: Type.STRING,
          description: 'Razón por la que se transfiere a un humano.',
        },
        resumen: {
          type: Type.STRING,
          description: 'Resumen conciso del caso para el personal de recepción.',
        },
      },
      required: ['motivo', 'resumen'],
    },
  },
];

/**
 * Teléfono del paciente tal como lo autenticó el canal (remitente de WhatsApp,
 * caller ID de Twilio). Es la única identidad en la que se puede confiar: el
 * modelo deriva sus argumentos del texto del paciente, así que un tercero podría
 * dictar el número de otra persona para leer o cancelar sus citas.
 */
function channelAuthenticatedPhone(context: AgentContext): string | null {
  const normalized = normalizeMexicanPhone(context.patientPhone || '');
  return /^\+52\d{10}$/.test(normalized) ? normalized : null;
}

/**
 * Próxima cita del paciente. Se ordena ascendente y se descartan las que ya
 * terminaron: "¿a qué hora es mi cita?" debe responder la siguiente, no la más
 * lejana del calendario ni una del mes pasado. El corte es por `endTime` para
 * que una cita en curso siga contando mientras el paciente está en la clínica.
 */
async function findNextAppointment(tenantId: string, phoneE164: string) {
  return db.appointment.findFirst({
    where: {
      tenantId,
      status: { not: 'CANCELLED' },
      endTime: { gte: new Date() },
      patient: { tenantId, phoneE164 },
    },
    include: { doctor: true, service: true },
    orderBy: { startTime: 'asc' },
  });
}

export class OmnichannelAgent {
  private ai?: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  /**
   * Procesa un mensaje entrante de cualquier canal (Voz, WhatsApp, IG, FB)
   */
  async processMessage(
    incomingText: string,
    context: AgentContext,
    conversationHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = []
  ): Promise<AgentResponse> {
    const tenant = await db.tenant.findUnique({
      where: { id: context.tenantId },
      include: {
        doctors: { where: { isActive: true } },
        services: { where: { isActive: true } },
      },
    });

    if (!tenant) {
      return {
        replyText: 'Error: Clínica no encontrada en el sistema.',
      };
    }

    // Si el mensaje es una emergencia médica evidente, activar triaje inmediato
    const triage = evaluateTriage(incomingText);
    if (triage.level === 'CRITICAL_EMERGENCY') {
      return {
        replyText: `🚨 ATENCIÓN MÉDICA INMEDIATA:\n\n${triage.adviceForPatient}\n\nUbicación de la clínica para traslados: ${tenant.address || 'Consulta en recepción'}. Si necesitas auxilio urgente, por favor comunícate al 911 de inmediato.`,
        triageAlert: triage,
        requiresHumanHandover: true,
      };
    }

    // Si no hay API key de Gemini configurada en el entorno, usar motor de simulación inteligente
    if (!this.ai || !process.env.GEMINI_API_KEY) {
      return this.handleFallbackProcessing(incomingText, context, tenant, triage, conversationHistory);
    }

    // Construcción del System Prompt adaptado a la clínica en México
    const systemInstruction = `
Eres la recepcionista y asistente virtual de "${tenant.name}", ubicada en ${tenant.address || 'Ciudad de México'}.
Tu objetivo es brindar atención cálida, educada, empática y profesional con acento y cortesía mexicana (ej. "con mucho gusto", "un momento por favor", "para servirle").
Respondes por el canal: ${context.channel}.

INFORMACIÓN DE LA CLÍNICA:
- Horario y zona horaria: ${tenant.timezone}
- Teléfono: ${tenant.phoneE164}
- Instrucciones de emergencia: ${tenant.emergencyInstructions || 'Llamar al 911 o acudir a urgencias'}

DOCTORES DISPONIBLES:
${tenant.doctors.map((d) => `- ${d.name} (${d.specialty}) [ID: ${d.id}]`).join('\n')}

SERVICIOS Y PRECIOS (Pesos Mexicanos MXN):
${tenant.services.map((s) => `- ${s.name}: $${s.priceMxn} MXN (${s.durationMinutes} min, anticipo requerido: $${s.requiredDepositMxn} MXN) [ID: ${s.id}]`).join('\n')}

REGLAS DE OPERACIÓN:
1. Para consultar disponibilidad, debes usar la herramienta 'consultar_disponibilidad' indicando la fecha en YYYY-MM-DD.
2. Si el paciente confirma fecha, hora y servicio, solicita su nombre completo y ejecuta 'agendar_cita'. El teléfono ya lo aporta el canal (${context.patientPhone}); no lo pidas ni lo cambies.
3. Si el paciente pregunta precios, ubicación, seguros o estacionamiento, usa 'consultar_faq_clinica' o responde según los datos oficiales.
4. Si el paciente tiene dolor muy fuerte o urgencia dental, evalúa la gravedad con 'evaluar_urgencia_sintomas' y prioriza el mismo día.
5. Mantén respuestas concisas, amables y claras, ideales para leer en WhatsApp o escuchar en una llamada telefónica.
6. Consultar, confirmar y cancelar operan SIEMPRE sobre quien escribe o llama. Si te piden ver o cancelar la cita de otra persona, explica con amabilidad que por privacidad esa persona debe hacerlo desde su propio número, o transfiere a recepción.
Fecha y hora actual: ${new Date().toISOString()}.
`.trim();

    try {
      const contents: Content[] = [
        ...conversationHistory,
        {
          role: 'user',
          parts: [{ text: incomingText }],
        },
      ];

      let turns = 0;
      let lastResponseText = '';
      let bookedAppointment: Appointment | null = null;
      let requiresHandover = false;

      // Bucle de resolución de Tool Calling (hasta 5 iteraciones)
      while (turns < 5) {
        turns++;

        const modelResponse = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: toolDeclarations }],
            temperature: 0.3,
          },
        });

        const candidate = modelResponse.candidates?.[0];
        if (!candidate || !candidate.content) {
          break;
        }

        const candidateParts = candidate.content.parts as FunctionCallPart[] | undefined;
        const functionCalls = candidateParts?.filter((p) => p.functionCall) || [];

        if (functionCalls.length === 0) {
          // No hubo llamadas a herramientas, respuesta de texto final
          lastResponseText = candidateParts?.map((p) => p.text || '').join('') || '';
          break;
        }

        // Ejecutar las herramientas solicitadas por Gemini
        contents.push({
          role: 'model',
          parts: candidate.content.parts,
        });

        const toolResponsesParts: Part[] = [];

        for (const part of functionCalls) {
          const call = part.functionCall!;
          const { name } = call;
          const args = (call.args || {}) as Record<string, any>;
          let toolResult: unknown;

          if (name === 'consultar_disponibilidad') {
            toolResult = await SchedulerService.getAvailableSlots({
              tenantId: context.tenantId,
              targetDateStr: args.fecha,
              doctorId: args.doctorId,
              serviceId: args.servicioId,
              timePreference: args.preferenciaTurno,
            });
          } else if (name === 'agendar_cita') {
            // El teléfono del canal manda. El que propone el modelo solo se usa
            // cuando no hay identidad autenticada (llamada con número oculto),
            // para no dejar que un tercero sobrescriba el expediente de otro.
            const normalizedPhone =
              channelAuthenticatedPhone(context) ??
              normalizeMexicanPhone(args.telefonoPaciente || '');
            const appt = await SchedulerService.bookAppointment({
              tenantId: context.tenantId,
              patientFullName: args.nombrePaciente,
              patientPhone: normalizedPhone,
              doctorId: args.doctorId,
              serviceId: args.servicioId,
              startTimeIso: args.horarioInicioIso,
              symptoms: args.sintomas,
              channelOrigin: context.channel,
              auditActor: AGENT_AUDIT_ACTOR,
              auditMetadata: agentAuditMetadata(context, name),
            });
            bookedAppointment = appt;
            toolResult = {
              status: 'CONFIRMED',
              appointmentId: appt.id,
              doctor: appt.doctor.name,
              service: appt.service.name,
              startTime: appt.startTime.toISOString(),
              depositRequired: appt.service.requiredDepositMxn,
            };
          } else if (name === 'confirmar_asistencia_cita') {
            const callerPhone = channelAuthenticatedPhone(context);
            const appt = callerPhone
              ? await findNextAppointment(context.tenantId, callerPhone)
              : null;
            if (appt) {
              await db.$transaction(async (tx) => {
                await tx.appointment.update({
                  where: { id: appt.id },
                  data: {
                    status: 'CONFIRMED',
                    notes: ((appt.notes || '') + ' | Asistencia confirmada vía WhatsApp').trim(),
                  },
                });
                await auditAgentAction(
                  context,
                  name,
                  {
                    action: 'UPDATE',
                    entityType: 'APPOINTMENT',
                    entityId: appt.id,
                    patientId: appt.patientId,
                    changes: diffChanges({ status: appt.status }, { status: 'CONFIRMED' }),
                  },
                  tx
                );
              });
              toolResult = {
                confirmed: true,
                appointmentId: appt.id,
                doctor: appt.doctor.name,
                service: appt.service.name,
                startTime: appt.startTime.toISOString(),
              };
            } else {
              toolResult = { confirmed: false, message: 'No se encontró cita activa para este paciente.' };
            }
          } else if (name === 'consultar_citas_paciente') {
            const callerPhone = channelAuthenticatedPhone(context);
            const appt = callerPhone
              ? await findNextAppointment(context.tenantId, callerPhone)
              : null;
            if (appt) {
              // Revelar la cita por el canal es un acceso al expediente.
              await auditAgentAction(context, name, {
                action: 'READ',
                entityType: 'APPOINTMENT',
                entityId: appt.id,
                patientId: appt.patientId,
              });
            }
            toolResult = appt
              ? {
                  doctor: appt.doctor.name,
                  service: appt.service.name,
                  startTime: appt.startTime.toISOString(),
                  status: appt.status,
                }
              : { message: 'No hay citas activas registradas.' };
          } else if (name === 'cancelar_cita_paciente') {
            const callerPhone = channelAuthenticatedPhone(context);
            const appt = callerPhone
              ? await findNextAppointment(context.tenantId, callerPhone)
              : null;
            if (appt) {
              await db.$transaction(async (tx) => {
                await tx.appointment.update({
                  where: { id: appt.id },
                  data: {
                    status: 'CANCELLED',
                    slotKey: null,
                    notes: ((appt.notes || '') + ' | Cancelada por el paciente').trim(),
                  },
                });
                await auditAgentAction(
                  context,
                  name,
                  {
                    action: 'UPDATE',
                    entityType: 'APPOINTMENT',
                    entityId: appt.id,
                    patientId: appt.patientId,
                    changes: diffChanges({ status: appt.status }, { status: 'CANCELLED' }),
                  },
                  tx
                );
              });
              toolResult = { cancelled: true, message: 'Cita cancelada con éxito.' };
            } else {
              toolResult = { cancelled: false, message: 'No se encontró cita para cancelar.' };
            }
          } else if (name === 'evaluar_urgencia_sintomas') {
            toolResult = evaluateTriage(args.sintomas, args.nivelDolor);
          } else if (name === 'consultar_faq_clinica') {
            const items = await db.faqItem.findMany({
              where: { tenantId: context.tenantId },
            });
            toolResult = items;
          } else if (name === 'transferir_a_recepcionista_humano') {
            requiresHandover = true;
            toolResult = { success: true, message: 'Transferencia realizada al recepcionista.' };
          } else {
            toolResult = { error: `Herramienta ${name} no soportada.` };
          }

          toolResponsesParts.push({
            functionResponse: {
              name,
              response: { result: toolResult },
            },
          });
        }

        contents.push({
          role: 'user',
          parts: toolResponsesParts,
        });
      }

      return {
        replyText: lastResponseText || 'Con mucho gusto te atiendo. ¿En qué horario te gustaría tu cita?',
        appointmentBooked: bookedAppointment,
        triageAlert: triage,
        requiresHumanHandover: requiresHandover,
      };
    } catch (err: unknown) {
      logger.error('Error invocando Gemini 2.5 Flash', err);
      // En caso de error de red o cuota, degradación elegante con motor local
      return this.handleFallbackProcessing(incomingText, context, tenant, triage, conversationHistory);
    }
  }

  /**
   * Motor de procesamiento heurístico y funcional de respaldo cuando no hay conexión a API externa
   */
  private async handleFallbackProcessing(
    incomingText: string,
    context: AgentContext,
    tenant: AgentTenant,
    triage: TriageResult,
    conversationHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = []
  ): Promise<AgentResponse> {
    const textLower = incomingText.trim().toLowerCase();

    // 0. Cargar paciente y citas activas desde la base de datos
    const normalizedPhone = normalizeMexicanPhone(context.patientPhone);
    const patient = await db.patient.findFirst({
      where: {
        tenantId: context.tenantId,
        phoneE164: normalizedPhone,
      },
      include: {
        appointments: {
          where: {
            status: { not: 'CANCELLED' },
            endTime: { gte: new Date() },
          },
          include: {
            doctor: true,
            service: true,
          },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    const activeAppointment = patient?.appointments?.[0];
    const patientName =
      patient?.fullName && patient.fullName !== 'Paciente'
        ? patient.fullName
        : context.patientName && context.patientName !== 'Paciente'
        ? context.patientName
        : 'estimado paciente';

    // Obtener datos formateados de la cita en horario de México
    let appointmentDateFormatted = '';
    let appointmentTimeFormatted = '';
    let isTomorrowAppointment = false;
    let isTodayAppointment = false;

    if (activeAppointment) {
      const apptDate = new Date(activeAppointment.startTime);
      appointmentDateFormatted = apptDate.toLocaleDateString('es-MX', {
        timeZone: tenant.timezone || 'America/Mexico_City',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      // Capitalizar día de la semana
      appointmentDateFormatted =
        appointmentDateFormatted.charAt(0).toUpperCase() + appointmentDateFormatted.slice(1);

      appointmentTimeFormatted = apptDate.toLocaleTimeString('es-MX', {
        timeZone: tenant.timezone || 'America/Mexico_City',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      const nowDayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: tenant.timezone || 'America/Mexico_City',
      }).format(new Date());
      const apptDayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: tenant.timezone || 'America/Mexico_City',
      }).format(apptDate);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: tenant.timezone || 'America/Mexico_City',
      }).format(tomorrow);

      isTodayAppointment = nowDayStr === apptDayStr;
      isTomorrowAppointment = tomorrowDayStr === apptDayStr;
    }

    // Obtener el último mensaje del asistente para mantener contexto
    const lastModelMessage =
      [...conversationHistory]
        .reverse()
        .find((m) => m.role === 'model')
        ?.parts?.[0]?.text?.toLowerCase() || '';

    // =========================================================================
    // INTENCIÓN 0: URGENCIAS DENTALES AGUDAS (Dolor agudo / Infección / Especialista)
    // =========================================================================
    if (triage.level === 'URGENT_DENTAL') {
      const specialist =
        tenant.doctors?.find((d: Doctor) =>
          d.specialty.toLowerCase().includes('cirug') ||
          d.specialty.toLowerCase().includes('endo') ||
          d.specialty.toLowerCase().includes('maxilo')
        ) || tenant.doctors?.[0];

      const docInfo = specialist
        ? `${specialist.name} (${specialist.specialty})`
        : 'nuestro especialista en Endodoncia y Cirugía Maxilofacial';

      return {
        replyText: `⚠️ ATENCIÓN PRIORITARIA POR DOLOR AGUDO DENTAL:\n\n${triage.adviceForPatient}\n\nTe canalizamos prioritariamente con ${docInfo}. Contamos con espacios de urgencia reservados el día de hoy para atenderte de inmediato. ¿Deseas que te reservemos el espacio prioritario de hoy?`,
        triageAlert: triage,
        requiresHumanHandover: true,
      };
    }

    // =========================================================================
    // INTENCIÓN 1: CONFIRMACIÓN DE ASISTENCIA A CITA AGENDADA
    // =========================================================================
    const isConfirmAttendance =
      textLower === 'asistencia' ||
      textLower.includes('asistencia') ||
      textLower.includes('confirmar asistencia') ||
      textLower.includes('confirmo asistencia') ||
      textLower.includes('confirmar cita') ||
      textLower.includes('confirmo mi cita') ||
      textLower.includes('confirmo cita') ||
      textLower.includes('asistencia confirmada') ||
      textLower.includes('confirmada') ||
      textLower.includes('confirmado') ||
      textLower === 'confirmo' ||
      textLower.includes('confirmo') ||
      textLower === 'confirmar' ||
      textLower.includes('confirmar') ||
      textLower === 'si confirmo' ||
      textLower === 'sí confirmo' ||
      textLower === 'si confirmo mi asistencia' ||
      textLower === 'sí confirmo mi asistencia' ||
      textLower.includes('asistiré') ||
      textLower.includes('asistire') ||
      textLower.includes('asisto') ||
      textLower.includes('si asisto') ||
      textLower.includes('sí asisto') ||
      textLower.includes('si voy') ||
      textLower.includes('sí voy') ||
      textLower.includes('alla nos vemos') ||
      textLower.includes('allá nos vemos') ||
      textLower.includes('cuenta con ello') ||
      textLower.startsWith('confirm_') ||
      textLower.includes('confirm_') ||
      (activeAppointment &&
        (textLower === 'listo' || textLower === 'ya quedó' || textLower === 'ya quedo') &&
        (lastModelMessage.includes('cita') || lastModelMessage.includes('confirm'))) ||
      (activeAppointment &&
        (textLower === 'si' || textLower === 'sí' || textLower === 'si porfa' || textLower === 'sí porfa' || textLower === 'claro' || textLower === 'ok') &&
        (lastModelMessage.includes('cita') || lastModelMessage.includes('confirm') || lastModelMessage.includes('asistencia')));

    if (isConfirmAttendance) {
      if (activeAppointment) {
        await db.$transaction(async (tx) => {
          await tx.appointment.update({
            where: { id: activeAppointment.id },
            data: {
              status: 'CONFIRMED',
              notes: (
                (activeAppointment.notes || '') + ' | Asistencia confirmada por el paciente vía WhatsApp'
              ).trim(),
            },
          });
          await auditAgentAction(
            context,
            'fallback:confirmar_asistencia',
            {
              action: 'UPDATE',
              entityType: 'APPOINTMENT',
              entityId: activeAppointment.id,
              patientId: activeAppointment.patientId,
              changes: diffChanges({ status: activeAppointment.status }, { status: 'CONFIRMED' }),
            },
            tx
          );
        });

        const dayPrefix = isTomorrowAppointment
          ? 'Mañana (' + appointmentDateFormatted + ')'
          : isTodayAppointment
          ? 'Hoy (' + appointmentDateFormatted + ')'
          : appointmentDateFormatted;

        return {
          replyText: `¡Muchas gracias por confirmar tu asistencia, ${patientName}! 🙌\n\nTu cita está 100% apartada y garantizada:\n\n📅 *Fecha:* ${dayPrefix}\n⏰ *Horario:* ${appointmentTimeFormatted}\n👨‍⚕️ *Especialista:* ${activeAppointment.doctor.name} (${activeAppointment.doctor.specialty})\n🦷 *Tratamiento:* ${activeAppointment.service.name}\n📍 *Ubicación:* ${tenant.address}\n🚗 *Estacionamiento:* Valet Parking en la entrada\n\n💡 *Recomendaciones para tu consulta:*\n• Te sugerimos llegar con 10 minutos de anticipación.\n• Si requieres factura fiscal (CFDI 4.0) o comprobante para aseguradora (GNP, MetLife, AXA, Monterrey, Mapfre), solicítalo al llegar a recepción.\n• Si te surge algún imprevisto o requieres indicaciones para llegar, escríbenos con confianza por aquí.\n\n¡Te esperamos con mucho gusto!`,
        };
      } else {
        return {
          replyText: `¡Hola ${patientName}! No encontré ninguna cita activa agendada para este número en este momento. ¿Te gustaría agendar una cita? Escribe *1* o indícame qué día te acomoda visitarnos.`,
        };
      }
    }

    // =========================================================================
    // INTENCIÓN 2: AGRADECIMIENTOS, CORTESÍAS Y DESPEDIDAS
    // =========================================================================
    const isCourtesyOrThanks =
      textLower.includes('gracias') ||
      textLower.includes('muchas gracias') ||
      textLower.includes('mil gracias') ||
      textLower.includes('ok gracias') ||
      textLower.includes('muchisimas gracias') ||
      textLower.includes('gracias doctora') ||
      textLower.includes('gracias doctor') ||
      textLower.includes('perfecto gracias') ||
      textLower.includes('excelente gracias') ||
      textLower === 'enterado' ||
      textLower === 'enterada' ||
      textLower === 'perfecto' ||
      textLower === 'excelente' ||
      textLower.includes('hasta mañana') ||
      textLower.includes('nos vemos') ||
      textLower.includes('hasta luego') ||
      textLower.includes('bonito dia') ||
      textLower.includes('bonito día') ||
      textLower.includes('buen dia') ||
      textLower.includes('buen día') ||
      textLower.includes('excelente dia') ||
      textLower.includes('excelente día') ||
      textLower.includes('muy amable');

    if (isCourtesyOrThanks) {
      if (activeAppointment) {
        const dayPrefix = isTomorrowAppointment ? 'mañana ' : isTodayAppointment ? 'hoy ' : '';
        return {
          replyText: `¡A ti, ${patientName}! Con mucho gusto. Te esperamos ${dayPrefix}${appointmentDateFormatted} a las ${appointmentTimeFormatted}. Si tienes cualquier duda antes de tu cita, estamos para servirte. ¡Que tengas un excelente día! 😊`,
        };
      } else {
        return {
          replyText: `¡Con mucho gusto! En ${tenant.name} quedamos a tus órdenes para lo que necesites. ¡Que tengas un excelente día! 😊`,
        };
      }
    }

    // =========================================================================
    // INTENCIÓN 3: CONSULTAR ESTADO O DETALLES DE MI CITA
    // =========================================================================
    const isAppointmentInquiry =
      textLower.includes('mi cita') ||
      textLower.includes('mis citas') ||
      textLower.includes('cuando es mi cita') ||
      textLower.includes('cuándo es mi cita') ||
      textLower.includes('a que hora es mi cita') ||
      textLower.includes('a qué hora es mi cita') ||
      textLower.includes('tengo cita') ||
      textLower.includes('tengo agendado') ||
      textLower.includes('donde es mi cita') ||
      textLower.includes('dónde es mi cita');

    if (isAppointmentInquiry) {
      if (activeAppointment) {
        const dayPrefix = isTomorrowAppointment
          ? 'Mañana (' + appointmentDateFormatted + ')'
          : isTodayAppointment
          ? 'Hoy (' + appointmentDateFormatted + ')'
          : appointmentDateFormatted;

        return {
          replyText: `¡Hola, ${patientName}! Con gusto te comparto los detalles de tu cita programada:\n\n📅 *Fecha:* ${dayPrefix}\n⏰ *Horario:* ${appointmentTimeFormatted}\n👨‍⚕️ *Especialista:* ${activeAppointment.doctor.name} (${activeAppointment.doctor.specialty})\n🦷 *Tratamiento:* ${activeAppointment.service.name} ($${activeAppointment.service.priceMxn} MXN)\n📍 *Ubicación:* ${tenant.address}\n\nEstado de la cita: *${activeAppointment.status === 'CONFIRMED' ? 'Confirmada ✅' : 'Agendada'}*\n\n¿Deseas confirmar asistencia, reagendarla o requieres apoyo para llegar?`,
        };
      } else {
        return {
          replyText: `Hola ${patientName}, actualmente no tienes ninguna cita activa registrada con este número. ¿Te gustaría agendar una cita para esta semana? Escribe *1* para ver los horarios disponibles.`,
        };
      }
    }

    // =========================================================================
    // INTENCIÓN 4: CANCELACIÓN DE CITA
    // =========================================================================
    const isCancelAppointment =
      textLower.includes('cancelar cita') ||
      textLower.includes('cancelar mi cita') ||
      textLower.includes('no voy a poder') ||
      textLower.includes('no podre ir') ||
      textLower.includes('no podré ir') ||
      textLower.includes('no voy a ir') ||
      (activeAppointment && textLower === 'cancelar');

    if (isCancelAppointment) {
      if (activeAppointment) {
        await db.$transaction(async (tx) => {
          await tx.appointment.update({
            where: { id: activeAppointment.id },
            data: {
              status: 'CANCELLED',
              slotKey: null,
              notes: (
                (activeAppointment.notes || '') + ' | Cancelada por el paciente vía WhatsApp'
              ).trim(),
            },
          });
          await auditAgentAction(
            context,
            'fallback:cancelar_cita',
            {
              action: 'UPDATE',
              entityType: 'APPOINTMENT',
              entityId: activeAppointment.id,
              patientId: activeAppointment.patientId,
              changes: diffChanges({ status: activeAppointment.status }, { status: 'CANCELLED' }),
            },
            tx
          );
        });

        return {
          replyText: `Tu cita programada para el ${appointmentDateFormatted} a las ${appointmentTimeFormatted} ha sido cancelada sin ningún costo ni penalización, ${patientName}. Lamentamos que no puedas acompañarnos esta vez. Cuando desees volver a agendar, con todo gusto estamos a tus órdenes por aquí. ¡Que tengas un excelente día!`,
        };
      } else {
        return {
          replyText: `Hola ${patientName}, no encontramos ninguna cita activa para cancelar en el sistema. Si deseas agendar una nueva consulta, con gusto te ayudamos.`,
        };
      }
    }

    // =========================================================================
    // INTENCIÓN 5: REAGENDAR CITA
    // =========================================================================
    const isReschedule =
      textLower.includes('reagendar') ||
      textLower.includes('cambiar cita') ||
      textLower.includes('cambiar fecha') ||
      textLower.includes('cambiar de hora') ||
      textLower.includes('cambiar el horario') ||
      textLower.startsWith('reschedule_') ||
      textLower.includes('reschedule_');

    if (isReschedule) {
      const dateStr = cdmxDateStr(1);
      const slots = await SchedulerService.getAvailableSlots({
        tenantId: context.tenantId,
        targetDateStr: dateStr,
      });
      const topSlots = slots.slice(0, 3);
      if (topSlots.length > 0) {
        const slotsText = topSlots
          .map((s, idx) => `${idx + 1}️⃣ *${s.displayTime}* con ${s.doctorName} (${s.specialty})`)
          .join('\n');
        return {
          replyText: `Con mucho gusto te ayudamos a reagendar tu cita, ${patientName}. Para mañana (${dateStr}) tenemos estos horarios disponibles:\n\n${slotsText}\n\n¿Cuál de estos te acomoda mejor? (Puedes responder con el 1, 2 o 3, o indicar otra hora).`,
        };
      }
      return {
        replyText: `Con gusto te ayudamos a reagendar, ${patientName}. Para mañana no encontré espacios disponibles. ¿Me indicas otro día u horario que te acomode?`,
      };
    }

    // =========================================================================
    // INTENCIÓN 6: SELECCIÓN DE HORARIO / TURNO (1, 2, 3 o por hora específica)
    // =========================================================================
    const isSlotSelection =
      (lastModelMessage.includes('horarios disponibles') ||
        lastModelMessage.includes('estos horarios') ||
        lastModelMessage.includes('estos espacios') ||
        lastModelMessage.includes('cual de estos') ||
        lastModelMessage.includes('cuál de estos')) &&
      (textLower === '1' ||
        textLower === '2' ||
        textLower === '3' ||
        textLower.includes('opcion 1') ||
        textLower.includes('opción 1') ||
        textLower.includes('opcion 2') ||
        textLower.includes('opción 2') ||
        textLower.includes('opcion 3') ||
        textLower.includes('opción 3') ||
        textLower.includes('primero') ||
        textLower.includes('segundo') ||
        textLower.includes('tercero') ||
        textLower.includes('primer') ||
        textLower.includes('segund') ||
        textLower.includes('tercer') ||
        textLower.includes('la 1') ||
        textLower.includes('la 2') ||
        textLower.includes('la 3') ||
        textLower.includes('el 1') ||
        textLower.includes('el 2') ||
        textLower.includes('el 3') ||
        textLower.includes(':') ||
        textLower.includes('am') ||
        textLower.includes('pm') ||
        textLower.includes('a las'));

    if (isSlotSelection) {
      const dateStr = cdmxDateStr(1);
      const inferredService =
        tenant.services.find((s: Service) => lastModelMessage.includes(s.name.toLowerCase())) ||
        tenant.services.find((s: Service) => textLower.includes(s.name.toLowerCase()));
      const slots = await SchedulerService.getAvailableSlots({
        tenantId: context.tenantId,
        targetDateStr: dateStr,
        serviceId: inferredService?.id,
      });

      let chosenSlot = slots[0];
      if (
        (textLower.includes('2') || textLower.includes('segund') || textLower.includes('10:00')) &&
        slots[1]
      ) {
        chosenSlot = slots[1];
      } else if (
        (textLower.includes('3') || textLower.includes('tercer') || textLower.includes('11:00')) &&
        slots[2]
      ) {
        chosenSlot = slots[2];
      }

      if (chosenSlot) {
        const service =
          inferredService ||
          tenant.services.find((s: Service) => s.name.toLowerCase().includes('limpieza')) ||
          tenant.services[0];
        const doctor =
          tenant.doctors.find((d: Doctor) => d.id === chosenSlot.doctorId) || tenant.doctors[0];

        if (!service || !doctor) {
          return {
            replyText: `Gracias, ${patientName}. Todavía no tengo el catálogo de servicios o especialistas configurado; un recepcionista te contactará para confirmar tu cita.`,
            requiresHumanHandover: true,
          };
        }

        const appointment = await SchedulerService.bookAppointment({
          tenantId: tenant.id,
          patientFullName: patientName !== 'estimado paciente' ? patientName : 'Paciente WhatsApp',
          patientPhone: context.patientPhone,
          doctorId: doctor.id,
          serviceId: service.id,
          startTimeIso: chosenSlot.startTimeIso,
          symptoms: 'Agendado vía WhatsApp',
          channelOrigin: 'WHATSAPP',
          auditActor: AGENT_AUDIT_ACTOR,
          auditMetadata: agentAuditMetadata(context, 'fallback:agendar_cita'),
        });

        return {
          replyText: `¡Listo, ${patientName}! 🎉 Tu cita ha quedado confirmada y agendada con éxito:\n\n📅 *Fecha:* Mañana (${dateStr})\n⏰ *Horario:* ${chosenSlot.displayTime}\n👨‍⚕️ *Especialista:* ${doctor.name} (${doctor.specialty})\n🦷 *Tratamiento:* ${service.name} ($${service.priceMxn} MXN)\n📍 *Ubicación:* ${tenant.address}\n\nTe sugerimos llegar 10 minutos antes. Si necesitas reagendar o cancelar en cualquier momento, solo avísanos por este mismo chat. ¡Te esperamos!`,
          appointmentBooked: appointment,
        };
      }

      return {
        replyText: `Gracias, ${patientName}. No encontré horarios disponibles para mañana; ¿me indicas otro día que te acomode para buscar espacio?`,
      };
    }

    // =========================================================================
    // INTENCIÓN 7: RESPUESTAS AFIRMATIVAS EN CONTEXTO ("si", "sí", "por favor", "va", "claro")
    // =========================================================================
    const isAffirmative =
      textLower === 'si' ||
      textLower === 'sí' ||
      textLower === 'si porfa' ||
      textLower === 'sí porfa' ||
      textLower === 'si por favor' ||
      textLower === 'sí por favor' ||
      textLower.includes('por favor') ||
      textLower.includes('porfa') ||
      textLower === 'va' ||
      textLower === 'sale' ||
      textLower === 'claro' ||
      textLower === 'adelante' ||
      textLower === 'ok' ||
      textLower.includes('me interesa') ||
      textLower.includes('me parece bien');

    if (
      isAffirmative &&
      (lastModelMessage.includes('agendemos cita') ||
        lastModelMessage.includes('tratamiento') ||
        lastModelMessage.includes('costo') ||
        lastModelMessage.includes('horarios disponibles') ||
        lastModelMessage.includes('limpieza') ||
        lastModelMessage.includes('servicio'))
    ) {
      const dateStr = cdmxDateStr(1);

      const slots = await SchedulerService.getAvailableSlots({
        tenantId: context.tenantId,
        targetDateStr: dateStr,
      });

      const topSlots = slots.slice(0, 3);
      if (topSlots.length > 0) {
        const slotsText = topSlots
          .map((s, idx) => `${idx + 1}️⃣ *${s.displayTime}* con ${s.doctorName} (${s.specialty})`)
          .join('\n');
        return {
          replyText: `¡Excelente! Para mañana (${dateStr}) tenemos estos horarios disponibles:\n\n${slotsText}\n\n¿Cuál de estos te queda mejor? (Puedes responder con el número 1, 2 o 3, o escribir la hora).`,
        };
      }
      return {
        replyText: `¡Perfecto! Aunque por ahora no tengo espacios para mañana, puedo buscar otro día. ¿Qué fecha te acomoda?`,
      };
    }

    // =========================================================================
    // INTENCIÓN 8: DETECCIÓN DE TRATAMIENTO ESPECÍFICO (Limpieza, Resina, etc.)
    // =========================================================================
    const matchingService = tenant.services.find(
      (s: Service) =>
        textLower.includes(s.name.toLowerCase()) ||
        (s.name.toLowerCase().includes('limpieza') && textLower.includes('limpieza')) ||
        (s.name.toLowerCase().includes('blanqueamiento') && textLower.includes('blanqueamiento')) ||
        (s.name.toLowerCase().includes('resina') &&
          (textLower.includes('resina') || textLower.includes('caries'))) ||
        (s.name.toLowerCase().includes('extracc') &&
          (textLower.includes('extracc') ||
            textLower.includes('sacar muela') ||
            textLower.includes('muela'))) ||
        (s.name.toLowerCase().includes('valoraci') &&
          (textLower.includes('valoraci') ||
            textLower.includes('diagnostico') ||
            textLower.includes('primera vez')))
    );

    if (matchingService) {
      if (
        textLower.includes('cita') ||
        textLower.includes('agendar') ||
        textLower.includes('mañana') ||
        textLower.includes('horario') ||
        textLower.includes('disponib')
      ) {
        const dateStr = cdmxDateStr(1);
        const slots = await SchedulerService.getAvailableSlots({
          tenantId: context.tenantId,
          targetDateStr: dateStr,
          serviceId: matchingService.id,
        });
        const topSlots = slots.slice(0, 3);
        if (topSlots.length === 0) {
          return {
            replyText: `Con gusto. El tratamiento de *${matchingService.name}* cuesta *$${matchingService.priceMxn} MXN*, pero no encontré horarios para mañana. ¿Te acomoda otro día?`,
          };
        }
        const slotsText = topSlots
          .map((s, idx) => `${idx + 1}️⃣ *${s.displayTime}* con ${s.doctorName} (${s.specialty})`)
          .join('\n');

        return {
          replyText: `¡Con gusto! El tratamiento de *${matchingService.name}* tiene un costo de *$${matchingService.priceMxn} MXN* (${matchingService.durationMinutes} min).\n\nPara mañana (${dateStr}) tenemos estos horarios disponibles:\n\n${slotsText}\n\n¿Cuál de estos te acomoda mejor? (Puedes responder con el 1, 2 o 3).`,
        };
      }

      return {
        replyText: `¡Con mucho gusto! El tratamiento de *${matchingService.name}* tiene un costo de *$${matchingService.priceMxn} MXN* (duración estimada: ${matchingService.durationMinutes} minutos).\n\n${matchingService.description || ''}\n\n¿Te gustaría que te agendemos cita para valoración o tratamiento? Si me indicas qué día te acomoda (ej: mañana o esta semana), te muestro los horarios disponibles.`,
      };
    }

    // =========================================================================
    // INTENCIÓN 9: PRECIOS Y COSTOS DE TRATAMIENTOS (OPCIÓN 2)
    // =========================================================================
    if (
      textLower === '2' ||
      textLower === 'dos' ||
      textLower === 'opcion 2' ||
      textLower === 'opción 2' ||
      textLower.includes('precio') ||
      textLower.includes('costo') ||
      textLower.includes('cuanto cuesta') ||
      textLower.includes('cuánto cuesta') ||
      textLower.includes('tratamiento') ||
      textLower.includes('servicios')
    ) {
      const servicesList = tenant.services
        .map((s: Service) => `• *${s.name}*: $${s.priceMxn} MXN (${s.durationMinutes} min)`)
        .join('\n');
      return {
        replyText: `¡Con gusto! Aquí tienes los costos de nuestros tratamientos principales en Pesos Mexicanos (MXN):\n\n${servicesList}\n\n¿Te interesa conocer detalles o disponibilidad para alguno de ellos en específico?`,
      };
    }

    // =========================================================================
    // INTENCIÓN 10: UBICACIÓN, ESTACIONAMIENTO, SEGUROS Y FORMAS DE PAGO (OPCIÓN 3)
    // =========================================================================
    if (
      textLower === '3' ||
      textLower === 'tres' ||
      textLower === 'opcion 3' ||
      textLower === 'opción 3' ||
      textLower.includes('donde estan') ||
      textLower.includes('dónde están') ||
      textLower.includes('ubicacion') ||
      textLower.includes('ubicación') ||
      textLower.includes('direccion') ||
      textLower.includes('dirección') ||
      textLower.includes('como llegar') ||
      textLower.includes('cómo llegar') ||
      textLower.includes('estacionamiento') ||
      textLower.includes('seguro') ||
      textLower.includes('pago')
    ) {
      return {
        replyText: `¡Hola! Con gusto te comparto nuestra información oficial:\n\n📍 *Ubicación:* ${tenant.address}\n🚗 *Estacionamiento:* Servicio de Valet Parking en la entrada y convenio con estacionamiento.\n💳 *Formas de pago:* Tarjetas de crédito/débito (con 3 y 6 MSI), transferencias SPEI y efectivo en MXN.\n📋 *Seguros:* Trabajamos por reembolso con GNP, MetLife, AXA, Seguros Monterrey y Mapfre (emitimos informe médico y factura fiscal CFDI 4.0).\n\n¿Deseas agendar una cita o tienes alguna otra duda?`,
      };
    }

    // =========================================================================
    // INTENCIÓN 11: DISPONIBILIDAD / AGENDAR CITA (OPCIÓN 1)
    // =========================================================================
    if (
      textLower === '1' ||
      textLower === 'uno' ||
      textLower === 'opcion 1' ||
      textLower === 'opción 1' ||
      textLower.includes('cita') ||
      textLower.includes('disponibilidad') ||
      textLower.includes('horario') ||
      textLower.includes('agendar') ||
      textLower.includes('mañana') ||
      textLower.includes('hoy') ||
      textLower.includes('sabado') ||
      textLower.includes('lunes')
    ) {
      const dateStr = cdmxDateStr(1);

      const slots = await SchedulerService.getAvailableSlots({
        tenantId: context.tenantId,
        targetDateStr: dateStr,
      });

      const topSlots = slots.slice(0, 3);
      if (topSlots.length > 0) {
        const slotsText = topSlots
          .map((s, idx) => `${idx + 1}️⃣ *${s.displayTime}* con ${s.doctorName} (${s.specialty})`)
          .join('\n');
        return {
          replyText: `¡Claro que sí! Para mañana (${dateStr}) tenemos estos espacios disponibles:\n\n${slotsText}\n\n¿Cuál de estos horarios te queda mejor? O si prefieres otra fecha, solo indícamela.`,
        };
      } else {
        return {
          replyText: `Para mañana no tenemos espacios disponibles en este momento. ¿Te gustaría consultar para pasado mañana o el próximo lunes?`,
        };
      }
    }

    // =========================================================================
    // INTENCIÓN 12: SALUDO INICIAL O MENÚ POR DEFECTO
    // =========================================================================
    return {
      replyText: `¡Hola! Bienvenido a ${tenant.name}. Con gusto puedo ayudarte a:\n1️⃣ Agendar o reagendar una cita\n2️⃣ Consultar costos de tratamientos\n3️⃣ Resolver dudas sobre ubicación y seguros\n\n¿En qué podemos apoyarte hoy?`,
    };
  }
}
