import { db, diffChanges, recordAudit, type AuditActor } from '@asistente/database';
import { createLogger } from '@asistente/observability';
import { roundMxn } from '../utils/money.js';

const logger = createLogger('payment');

/** Actor por defecto: la acreditación del anticipo solo la dispara el webhook. */
const MERCADOPAGO_WEBHOOK_ACTOR: AuditActor = { type: 'WEBHOOK', id: 'mercadopago' };

export interface CreateDepositPreferenceParams {
  appointmentId: string;
  tenantId?: string;
  amountMxn: number;
  serviceName?: string;
  patientName?: string;
  patientEmail?: string;
  patientPhone?: string;
  auditActor?: AuditActor;
}

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
  data?: { id: string };
  external_reference?: string;
  appointmentId?: string;
  status?: string; // 'approved', 'pending', 'rejected'
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

export class MercadoPagoService {
  /**
   * Genera una preferencia de pago (link de cobro de anticipo) para el No-Show Shield en MXN.
   * Con MERCADOPAGO_ACCESS_TOKEN configurado se usa la API real; sin token se genera
   * un link simulado exclusivamente para desarrollo local.
   */
  static async createDepositPreference(
    params: CreateDepositPreferenceParams
  ): Promise<DepositPreferenceResult> {
    const { appointmentId, tenantId, serviceName, patientName, patientEmail, auditActor } = params;
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

    const effectiveServiceName = serviceName || appt.service?.name || 'Consulta Médica/Dental';
    const effectivePatient = patientName || appt.patient?.fullName || 'Paciente';
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

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
          notification_url: process.env.MERCADOPAGO_WEBHOOK_URL || undefined,
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
   * Con token configurado, reconsulta el pago en la API de MP y valida estado,
   * cita asociada y monto antes de acreditar el anticipo.
   */
  static async processPaymentWebhook(
    payload: PaymentWebhookPayload,
    auditActor: AuditActor = MERCADOPAGO_WEBHOOK_ACTOR
  ) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const paymentId = payload.data?.id ? String(payload.data.id) : undefined;

    if (accessToken && paymentId) {
      const response = await fetch(`${MP_API_BASE}/v1/payments/${encodeURIComponent(paymentId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error('No se pudo verificar el pago con Mercado Pago');
      }

      const payment = (await response.json()) as MercadoPagoPaymentResponse;
      if (payment.status !== 'approved') {
        throw new Error(`El pago no está aprobado (status: ${payment.status || 'desconocido'})`);
      }

      const appointmentId = payment.external_reference;
      if (!appointmentId) {
        throw new Error('El pago no tiene external_reference asociado a una cita');
      }

      const appointment = await db.appointment.findUnique({
        where: { id: appointmentId },
        include: { service: true },
      });
      if (!appointment) {
        throw new Error('Cita asociada al pago no encontrada');
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
        throw new Error('El monto pagado no coincide con el anticipo configurado de la cita');
      }

      return this.markDepositAsPaid(appointment.id, auditActor);
    }

    if (accessToken && !paymentId) {
      throw new Error('Notificación de Mercado Pago sin identificador de pago (data.id)');
    }

    // Ruta de desarrollo/simulación sin credenciales reales.
    const targetAppointmentId = payload.appointmentId || payload.external_reference;
    if (!targetAppointmentId) {
      const referenceId = payload.data?.id;
      if (referenceId) {
        const appointmentByReference = await db.appointment.findFirst({
          where: { paymentReferenceId: referenceId },
        });
        if (appointmentByReference) {
          return this.markDepositAsPaid(appointmentByReference.id, auditActor);
        }
      }
      throw new Error('No se pudo identificar la cita asociada al pago de Mercado Pago');
    }

    return this.markDepositAsPaid(targetAppointmentId, auditActor);
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
    const appt = await db.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true, patient: true, doctor: true, tenant: true },
    });

    if (!appt) {
      throw new Error(`Cita con ID ${appointmentId} no encontrada`);
    }

    if (appt.paymentStatus === 'DEPOSIT_PAID') {
      return appt;
    }

    return db.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          paymentStatus: 'DEPOSIT_PAID',
          notes: (
            (appt.notes || '') +
            ` | Anticipo de $${appt.depositAmountMxn || appt.service.requiredDepositMxn} MXN acreditado exitosamente vía Mercado Pago (No-Show Shield)`
          ).trim(),
        },
        include: { patient: true, doctor: true, service: true, tenant: true },
      });

      await recordAudit(
        {
          tenantId: appt.tenantId,
          actor: auditActor,
          action: 'UPDATE',
          entityType: 'APPOINTMENT',
          entityId: appt.id,
          patientId: appt.patientId,
          changes: diffChanges(appt, { paymentStatus: 'DEPOSIT_PAID' }),
        },
        tx
      );

      return updated;
    });
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
