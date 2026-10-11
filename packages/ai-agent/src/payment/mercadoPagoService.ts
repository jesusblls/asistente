import {
  db,
  decryptCredentials,
  diffChanges,
  recordAudit,
  type AuditActor,
  type Prisma,
} from '@asistente/database';
import { createLogger } from '@asistente/observability';
import { roundMxn } from '../utils/money.js';

const logger = createLogger('payment');

/** Actor por defecto: la acreditación del anticipo solo la dispara el webhook. */
const MERCADOPAGO_WEBHOOK_ACTOR: AuditActor = { type: 'WEBHOOK', id: 'mercadopago' };

/**
 * No hay credenciales reales de Mercado Pago en producción. Se lanza en vez de
 * fabricar un link: un link simulado sobre el dominio real de Mercado Pago le
 * mostraría al paciente un checkout roto, y lo dejaría creyendo que no pudo
 * pagar por su culpa. `statusCode` lo usa la API para responder 503.
 */
export class DepositLinkUnavailableError extends Error {
  readonly statusCode = 503;

  constructor() {
    super('Mercado Pago no está configurado (falta MERCADOPAGO_ACCESS_TOKEN): no se puede generar el link de anticipo');
    this.name = 'DepositLinkUnavailableError';
  }
}

/**
 * La cita no admite un link de cobro en su estado actual (ya pagada o
 * cancelada). Sin esta guarda, regenerar el link sobre una cita pagada la
 * regresaba a DEPOSIT_PENDING y el barrido de vencimientos la cancelaba.
 */
export class DepositStateError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'DepositStateError';
  }
}

export interface CreateDepositPreferenceParams {
  appointmentId: string;
  tenantId?: string;
  amountMxn: number;
  serviceName?: string;
  patientName?: string;
  patientEmail?: string;
  patientPhone?: string;
  auditActor?: AuditActor;
  /**
   * Límite de pago. Solo lo pasa el envío automático al paciente: con él, el
   * barrido de anticipos recuerda y, si vence, libera el horario.
   */
  deadlineAt?: Date;
  /**
   * El plazo es tan corto que el momento del recordatorio ya pasó al enviar
   * el link (p. ej. la confirmación salió tarde por reintentos): se marca el
   * recordatorio como cubierto para no mandarlo pegado a la confirmación.
   */
  reminderCovered?: boolean;
}

type AppointmentWithRelations = Prisma.AppointmentGetPayload<{
  include: { service: true; patient: true; doctor: true; tenant: true };
}>;

/**
 * Resultado de procesar una notificación de Mercado Pago.
 *
 * Una notificación que no acredita nada (pago rechazado, otro tipo de evento,
 * pago de prueba inexistente) es un resultado normal, no un error: si el
 * webhook respondiera 500, Mercado Pago la reintentaría indefinidamente.
 */
export type PaymentWebhookOutcome =
  | {
      outcome: 'PAID';
      /** true solo la primera vez: las notificaciones duplicadas llegan en false. */
      transitioned: boolean;
      appointment: AppointmentWithRelations;
    }
  | { outcome: 'IGNORED'; reason: string; appointmentId?: string };

const PAID_STATUSES = ['DEPOSIT_PAID', 'FULLY_PAID'];

export interface DepositPreferenceResult {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint: string;
  amountMxn: number;
  currencyId: 'MXN';
  externalReference: string;
}

export interface PaymentWebhookPayload {
  action?: string;
  type?: string;
  /** Formato IPN antiguo: Mercado Pago a veces manda `topic` en lugar de `type`. */
  topic?: string;
  data?: { id: string };
  external_reference?: string;
  appointmentId?: string;
  status?: string; // 'approved', 'pending', 'rejected' (solo en la simulación de desarrollo)
}

interface MercadoPagoPreferenceResponse {
  id?: string | number;
  init_point?: string;
  sandbox_init_point?: string;
}

interface MercadoPagoPaymentResponse {
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
}

const MP_API_BASE = process.env.MERCADOPAGO_API_BASE || 'https://api.mercadopago.com';

/** Credenciales de la cuenta de Mercado Pago propia de una clínica (`ChannelConfig` MERCADOPAGO). */
export interface MercadoPagoChannelCredentials {
  accessToken: string;
  userId: string;
  nickname?: string | null;
}

export const MERCADOPAGO_CHANNEL = 'MERCADOPAGO';

export interface ResolvedMercadoPagoToken {
  accessToken: string;
  /** CLINIC: cuenta propia de la clínica · PLATFORM: token global (solo fuera de producción). */
  source: 'CLINIC' | 'PLATFORM';
}

/**
 * Cuenta de Mercado Pago con la que se cobra el anticipo de una clínica.
 *
 * El anticipo es dinero del paciente para la clínica: debe caer en la cuenta
 * de la clínica, no en la de la plataforma (que solo cobra las mensualidades).
 * Por eso en producción NO hay respaldo al token global: una clínica que no ha
 * conectado su cuenta simplemente no genera links (ver
 * `DepositLinkUnavailableError`) y recepción le comparte cómo pagar. Fuera de
 * producción el token global sigue sirviendo para sandbox y pruebas.
 */
export async function resolveMercadoPagoToken(tenantId: string): Promise<ResolvedMercadoPagoToken | null> {
  const config = await db.channelConfig.findFirst({
    where: { tenantId, channelType: MERCADOPAGO_CHANNEL, isActive: true },
    select: { credentials: true },
  });
  if (config) {
    try {
      const credentials = JSON.parse(decryptCredentials(config.credentials)) as MercadoPagoChannelCredentials;
      if (credentials.accessToken) return { accessToken: credentials.accessToken, source: 'CLINIC' };
    } catch (error) {
      logger.error('Credenciales de Mercado Pago de la clínica ilegibles', error, { tenantId });
      return null;
    }
  }

  const platformToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (platformToken && process.env.NODE_ENV !== 'production') {
    return { accessToken: platformToken, source: 'PLATFORM' };
  }
  return null;
}

/**
 * URL a la que Mercado Pago avisa los pagos de los anticipos de una clínica.
 * Es por clínica porque cada cuenta es distinta: el aviso solo trae el id del
 * pago, y para consultarlo hay que saber con qué token hacerlo.
 */
export function clinicPaymentWebhookUrl(tenantId: string): string | undefined {
  const host = process.env.PUBLIC_API_HOST?.trim();
  if (!host) return process.env.MERCADOPAGO_WEBHOOK_URL || undefined;
  return `https://${host}/webhooks/mercadopago/clinica/${encodeURIComponent(tenantId)}`;
}

export class MercadoPagoService {
  /**
   * Genera una preferencia de pago (link de cobro de anticipo) para el No-Show Shield en MXN.
   * Con MERCADOPAGO_ACCESS_TOKEN configurado se usa la API real; sin token se genera
   * un link simulado exclusivamente para desarrollo local.
   */
  static async createDepositPreference(
    params: CreateDepositPreferenceParams
  ): Promise<DepositPreferenceResult> {
    const {
      appointmentId,
      tenantId,
      serviceName,
      patientName,
      patientEmail,
      auditActor,
      deadlineAt,
      reminderCovered,
    } = params;
    const amountMxn = roundMxn(params.amountMxn);

    if (amountMxn <= 0) {
      throw new Error('El monto del anticipo en MXN debe ser mayor a 0');
    }

    const appt = await db.appointment.findFirst({
      where: { id: appointmentId, ...(tenantId ? { tenantId } : {}) },
      include: { service: true, patient: true, tenant: true },
    });

    if (!appt) {
      throw new Error(`Cita con ID ${appointmentId} no encontrada`);
    }

    if (PAID_STATUSES.includes(appt.paymentStatus)) {
      throw new DepositStateError('El anticipo de esta cita ya está pagado');
    }
    if (appt.status === 'CANCELLED') {
      throw new DepositStateError('La cita está cancelada: no se puede cobrar un anticipo');
    }

    const effectiveServiceName = serviceName || appt.service?.name || 'Consulta Médica/Dental';
    const effectivePatient = patientName || appt.patient?.fullName || 'Paciente';
    const resolved = await resolveMercadoPagoToken(appt.tenantId);
    const accessToken = resolved?.accessToken;

    // El link simulado solo existe para desarrollo local; en producción sin
    // la cuenta de la clínica se prefiere no mandar link a mandar uno que no
    // cobra (o que cobra a la cuenta equivocada).
    if (!accessToken && process.env.NODE_ENV === 'production') {
      logger.error('La clínica no tiene Mercado Pago conectado: no se generó link de anticipo', undefined, {
        appointmentId,
        tenantId: appt.tenantId,
      });
      throw new DepositLinkUnavailableError();
    }

    let preferenceId: string;
    let initPoint: string;
    let sandboxInitPoint: string;

    if (accessToken) {
      const response = await fetch(`${MP_API_BASE}/checkout/preferences`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              title: `Anticipo: ${effectiveServiceName}`,
              quantity: 1,
              currency_id: 'MXN',
              unit_price: Number(amountMxn),
            },
          ],
          external_reference: appointmentId,
          notification_url:
            resolved?.source === 'CLINIC'
              ? clinicPaymentWebhookUrl(appt.tenantId)
              : process.env.MERCADOPAGO_WEBHOOK_URL || undefined,
          metadata: { tenant_id: appt.tenantId, appointment_id: appointmentId },
          payer: patientEmail || appt.patient?.email ? { email: patientEmail || appt.patient?.email } : undefined,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        logger.error('Error creando preferencia de Mercado Pago', detail.slice(0, 300), { status: response.status });
        throw new Error('Mercado Pago rechazó la creación de la preferencia de pago');
      }

      const preference = (await response.json()) as MercadoPagoPreferenceResponse;
      if (!preference.id || !preference.init_point) {
        throw new Error('Mercado Pago devolvió una preferencia incompleta');
      }

      preferenceId = String(preference.id);
      initPoint = preference.init_point;
      sandboxInitPoint = preference.sandbox_init_point || preference.init_point;
    } else {
      const timestamp = Date.now();
      preferenceId = `mp_pref_sim_${appt.id.slice(-8)}_${timestamp}`;
      initPoint = `https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=${preferenceId}`;
      sandboxInitPoint = `https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=${preferenceId}`;
      logger.warn(
        'MERCADOPAGO_ACCESS_TOKEN no configurado: se generó un link simulado de desarrollo'
      );
    }

    await db.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          paymentStatus: 'DEPOSIT_PENDING',
          depositAmountMxn: amountMxn,
          depositPaymentUrl: initPoint,
          paymentReferenceId: preferenceId,
          // Sin `deadlineAt` (link pedido por recepción) el cobro lo gestiona
          // una persona: se quita cualquier límite automático previo para que
          // el barrido no libere el horario justo después de reenviar el link.
          depositDeadlineAt: deadlineAt ?? null,
          ...(reminderCovered ? { depositReminderSentAt: new Date() } : {}),
          notes: (
            (appt.notes || '') +
            ` | Anticipo No-Show generado: $${amountMxn} MXN (${effectiveServiceName} para ${effectivePatient})`
          ).trim(),
        },
      });

      if (auditActor) {
        await recordAudit(
          {
            tenantId: appt.tenantId,
            actor: auditActor,
            action: 'UPDATE',
            entityType: 'APPOINTMENT',
            entityId: appt.id,
            patientId: appt.patientId,
            changes: diffChanges(appt, {
              paymentStatus: 'DEPOSIT_PENDING',
              depositAmountMxn: amountMxn,
              depositPaymentUrl: initPoint,
              depositDeadlineAt: deadlineAt ?? null,
            }),
            metadata: { event: 'DEPOSIT_LINK_CREATED' },
          },
          tx
        );
      }
    });

    return {
      preferenceId,
      initPoint,
      sandboxInitPoint,
      amountMxn,
      currencyId: 'MXN',
      externalReference: appointmentId,
    };
  }

  /**
   * Procesa la notificación de Mercado Pago.
   *
   * Con token configurado, reconsulta el pago en la API de MP y valida estado,
   * cita asociada y monto antes de acreditar el anticipo.
   *
   * Solo lanza ante fallas transitorias (la API de MP no respondió): ahí sí
   * conviene que Mercado Pago reintente. Todo lo demás —pago rechazado o
   * pendiente, otro tipo de evento, cita inexistente, monto distinto— regresa
   * `IGNORED` con la razón, porque reintentarlo jamás cambiaría el resultado.
   */
  static async processPaymentWebhook(
    payload: PaymentWebhookPayload,
    auditActor: AuditActor = MERCADOPAGO_WEBHOOK_ACTOR,
    options: { tenantId?: string } = {}
  ): Promise<PaymentWebhookOutcome> {
    // Aviso de la cuenta propia de una clínica: el pago se consulta con SU
    // token y solo puede acreditar citas de esa clínica. Si la clínica ya no
    // tiene cuenta conectada, no hay con qué verificar y no se acredita nada.
    let accessToken: string | undefined;
    if (options.tenantId) {
      const resolved = await resolveMercadoPagoToken(options.tenantId);
      accessToken = resolved?.accessToken;
      if (!accessToken && process.env.NODE_ENV === 'production') {
        return ignored('clinica_sin_mercadopago');
      }
    } else {
      accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    }
    const paymentId = payload.data?.id ? String(payload.data.id) : undefined;
    const notificationType = payload.type || payload.topic;

    // `merchant_order`, `point_integration_wh`, etc.: no son pagos de anticipo.
    if (notificationType && notificationType !== 'payment') {
      return ignored(`tipo_no_soportado:${notificationType}`);
    }

    if (accessToken) {
      if (!paymentId) {
        return ignored('sin_data_id');
      }

      const response = await fetch(`${MP_API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // 404: el pago no existe en esta cuenta (p. ej. la notificación de
      // prueba del panel de Mercado Pago, que manda un id ficticio).
      if (response.status === 404) {
        return ignored('pago_inexistente');
      }
      if (!response.ok) {
        throw new Error(`No se pudo verificar el pago con Mercado Pago (HTTP ${response.status})`);
      }

      const payment = (await response.json()) as MercadoPagoPaymentResponse;
      if (payment.status !== 'approved') {
        return ignored(`pago_no_aprobado:${payment.status || 'desconocido'}`, payment.external_reference);
      }

      if (!payment.external_reference) {
        return ignored('sin_external_reference');
      }
      const appointmentId = await this.resolveRescheduledTarget(payment.external_reference);

      const appointment = await db.appointment.findUnique({
        where: { id: appointmentId },
        include: { service: true },
      });
      if (!appointment) {
        return ignored('cita_no_encontrada', appointmentId);
      }
      // Un pago de la cuenta de una clínica jamás acredita la cita de otra.
      if (options.tenantId && appointment.tenantId !== options.tenantId) {
        logger.error('Pago de la cuenta de una clínica con referencia a la cita de otra', undefined, {
          tenantId: options.tenantId,
          paymentId,
        });
        return ignored('cita_de_otra_clinica');
      }

      const expectedAmount =
        appointment.depositAmountMxn && appointment.depositAmountMxn > 0
          ? appointment.depositAmountMxn
          : appointment.service.requiredDepositMxn;

      if (
        expectedAmount > 0 &&
        payment.transaction_amount !== undefined &&
        Math.abs(Number(payment.transaction_amount) - expectedAmount) > 0.01
      ) {
        // Dinero recibido que no cuadra: no se acredita en automático, pero
        // se deja en el log como error para que alguien lo concilie a mano.
        logger.error('Pago aprobado con monto distinto al anticipo: no se acredita', undefined, {
          appointmentId,
          tenantId: appointment.tenantId,
          paymentId,
          expectedAmount,
          paidAmount: payment.transaction_amount,
        });
        return ignored('monto_no_coincide', appointmentId);
      }

      return { outcome: 'PAID', ...(await this.markDepositAsPaidOnce(appointment.id, auditActor)) };
    }

    // Sin token en producción no hay forma de verificar el pago: acreditar lo
    // que diga el cuerpo de la notificación sería creerle a quien la mande.
    if (process.env.NODE_ENV === 'production') {
      logger.error('Notificación de pago ignorada: falta MERCADOPAGO_ACCESS_TOKEN en producción', undefined, {
        paymentId,
      });
      return ignored('mercadopago_no_configurado');
    }

    // Ruta de desarrollo/simulación sin credenciales reales. El cuerpo puede
    // traer `status` para simular un pago rechazado; si no lo trae, se asume
    // aprobado (compatibilidad con las pruebas y el sandbox).
    if (payload.status && payload.status !== 'approved') {
      return ignored(`pago_no_aprobado:${payload.status}`, payload.appointmentId || payload.external_reference);
    }

    let targetAppointmentId = payload.appointmentId || payload.external_reference;
    if (!targetAppointmentId && paymentId) {
      const appointmentByReference = await db.appointment.findFirst({
        where: { paymentReferenceId: paymentId },
        select: { id: true },
      });
      targetAppointmentId = appointmentByReference?.id;
    }
    if (!targetAppointmentId) {
      return ignored('cita_no_identificada');
    }
    targetAppointmentId = await this.resolveRescheduledTarget(targetAppointmentId);

    const exists = await db.appointment.findUnique({
      where: { id: targetAppointmentId },
      select: { id: true, tenantId: true },
    });
    if (!exists) {
      return ignored('cita_no_encontrada', targetAppointmentId);
    }
    if (options.tenantId && exists.tenantId !== options.tenantId) {
      return ignored('cita_de_otra_clinica');
    }

    return { outcome: 'PAID', ...(await this.markDepositAsPaidOnce(targetAppointmentId, auditActor)) };
  }

  /**
   * Si la cita del link de pago se reagendó, devuelve la cita vigente que la
   * sustituyó (siguiendo la cadena si se reagendó varias veces). Sin esto, el
   * paciente que paga con el link que ya tenía acreditaría una cita cancelada
   * y la nueva seguiría pidiendo anticipo hasta liberarse sola.
   *
   * Solo se redirige a una cita del mismo paciente y clínica que aún espere el
   * anticipo; en cualquier otro caso se queda en la original, y el pago se
   * acredita ahí y se marca para conciliar, como antes.
   */
  static async resolveRescheduledTarget(appointmentId: string): Promise<string> {
    let currentId = appointmentId;
    for (let hops = 0; hops < 5; hops += 1) {
      const current = await db.appointment.findUnique({
        where: { id: currentId },
        select: { status: true, tenantId: true, patientId: true, rescheduledToId: true },
      });
      if (!current || current.status !== 'CANCELLED' || !current.rescheduledToId) break;

      const successor = await db.appointment.findFirst({
        where: {
          id: current.rescheduledToId,
          tenantId: current.tenantId,
          patientId: current.patientId,
        },
        select: { id: true, paymentStatus: true },
      });
      // Si la nueva ya está pagada o no pide anticipo, este pago no le
      // corresponde: se queda en la original para conciliarlo a mano.
      if (!successor || successor.paymentStatus !== 'DEPOSIT_PENDING') break;
      currentId = successor.id;
    }
    return currentId;
  }

  /**
   * Marca el anticipo como DEPOSIT_PAID de forma idempotente. El cambio y su
   * fila de auditoría se confirman en la misma transacción: un anticipo nunca
   * queda acreditado sin rastro de quién lo acreditó.
   */
  static async markDepositAsPaid(
    appointmentId: string,
    auditActor: AuditActor = MERCADOPAGO_WEBHOOK_ACTOR
  ) {
    const { appointment } = await this.markDepositAsPaidOnce(appointmentId, auditActor);
    return appointment;
  }

  /**
   * Igual que `markDepositAsPaid`, pero dice si esta llamada fue la que hizo
   * la transición. Mercado Pago manda varias notificaciones por el mismo pago
   * (`payment.created`, `payment.updated`, reintentos), y el aviso al paciente
   * debe salir una sola vez.
   *
   * La transición es un UPDATE condicional (`paymentStatus` aún no pagado), no
   * un "leer y luego escribir": dos notificaciones simultáneas no pueden ganar
   * ambas, y tampoco puede colarse entre la lectura y la escritura el barrido
   * que cancela anticipos vencidos.
   */
  static async markDepositAsPaidOnce(
    appointmentId: string,
    auditActor: AuditActor = MERCADOPAGO_WEBHOOK_ACTOR
  ): Promise<{ appointment: AppointmentWithRelations; transitioned: boolean }> {
    const include = { patient: true, doctor: true, service: true, tenant: true } as const;
    const appt = await db.appointment.findUnique({ where: { id: appointmentId }, include });

    if (!appt) {
      throw new Error(`Cita con ID ${appointmentId} no encontrada`);
    }

    if (PAID_STATUSES.includes(appt.paymentStatus)) {
      return { appointment: appt, transitioned: false };
    }

    // Concurrencia optimista sobre `updatedAt`: si otra escritura (p. ej. el
    // barrido que libera el horario) se cuela entre la lectura y el UPDATE, se
    // relee la fila en vez de pisar sus notas o auditar un estado viejo.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const outcome = await db.$transaction(async (tx) => {
        const fresh = await tx.appointment.findFirstOrThrow({
          where: { id: appointmentId, tenantId: appt.tenantId },
          include,
        });
        if (PAID_STATUSES.includes(fresh.paymentStatus)) {
          return { appointment: fresh, transitioned: false };
        }

        const result = await tx.appointment.updateMany({
          where: {
            id: appointmentId,
            tenantId: fresh.tenantId,
            paymentStatus: { notIn: PAID_STATUSES },
            updatedAt: fresh.updatedAt,
          },
          data: {
            paymentStatus: 'DEPOSIT_PAID',
            notes: (
              (fresh.notes || '') +
              ` | Anticipo de $${fresh.depositAmountMxn || fresh.service.requiredDepositMxn} MXN acreditado exitosamente vía Mercado Pago (No-Show Shield)`
            ).trim(),
          },
        });
        if (result.count === 0) return null; // alguien escribió en medio: reintentar

        await recordAudit(
          {
            tenantId: fresh.tenantId,
            actor: auditActor,
            action: 'UPDATE',
            entityType: 'APPOINTMENT',
            entityId: fresh.id,
            patientId: fresh.patientId,
            changes: diffChanges(fresh, { paymentStatus: 'DEPOSIT_PAID' }),
            // Un pago que llega después de que el barrido liberó el horario se
            // acredita igual (el dinero sí entró), pero queda señalado.
            ...(fresh.status === 'CANCELLED' ? { metadata: { event: 'DEPOSIT_PAID_AFTER_RELEASE' } } : {}),
          },
          tx
        );

        const current = await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include });
        return { appointment: current, transitioned: true };
      });

      if (outcome) return outcome;
    }

    // Tras varios choques seguidos se deja que Mercado Pago reintente.
    throw new Error(`No se pudo acreditar el anticipo de la cita ${appointmentId}: escrituras concurrentes`);
  }

  /**
   * Verifica si una cita tiene su anticipo acreditado.
   */
  static async verifyDepositStatus(appointmentId: string) {
    const appt = await db.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        paymentStatus: true,
        depositAmountMxn: true,
        depositPaymentUrl: true,
        paymentReferenceId: true,
      },
    });

    if (!appt) {
      throw new Error(`Cita ${appointmentId} no encontrada`);
    }

    return {
      appointmentId: appt.id,
      isDepositPaid: appt.paymentStatus === 'DEPOSIT_PAID',
      paymentStatus: appt.paymentStatus,
      depositAmountMxn: appt.depositAmountMxn,
      depositPaymentUrl: appt.depositPaymentUrl,
      paymentReferenceId: appt.paymentReferenceId,
    };
  }
}

function ignored(reason: string, appointmentId?: string): PaymentWebhookOutcome {
  logger.info('Notificación de Mercado Pago sin acreditación', { reason, appointmentId });
  return { outcome: 'IGNORED', reason, ...(appointmentId ? { appointmentId } : {}) };
}
