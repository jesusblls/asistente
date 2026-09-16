/**
 * Tipos compartidos para la plataforma SaaS Asistente Omnicanal
 */

export * from './auditSensitivity.js';

export type ChannelType =
  | 'WHATSAPP'
  | 'INSTAGRAM'
  | 'MESSENGER'
  | 'PHONE_CALL'
  | 'WEBCHAT';

export type AppointmentStatus = 
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'RESCHEDULED'
  | 'COMPLETED'
  | 'NO_SHOW';

export type PaymentStatus = 
  | 'NONE'
  | 'DEPOSIT_PENDING'
  | 'DEPOSIT_PAID'
  | 'FULLY_PAID'
  | 'REFUNDED';

export type MessageDirection = 'INBOUND' | 'OUTBOUND';
export type MessageSenderRole = 'PATIENT' | 'AI_AGENT' | 'HUMAN_STAFF' | 'SYSTEM';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  phoneE164: string; // Ej: "+525512345678"
  timezone: string; // Ej: "America/Mexico_City"
  address?: string;
  emergencyInstructions?: string;
  welcomeMessage?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Doctor {
  id: string;
  tenantId: string;
  name: string;
  specialty: string;
  phone?: string;
  email?: string;
  calendarId?: string; // ID en Google Calendar o Cal.com
  availabilityRules?: DoctorAvailabilityRules;
  isActive: boolean;
}

export interface DoctorAvailabilityRules {
  // Horarios de lunes a domingo (0 = domingo, 1 = lunes, ...)
  days: {
    [dayOfWeek: number]: {
      start: string; // "09:00"
      end: string;   // "18:00"
      lunchStart?: string; // "14:00"
      lunchEnd?: string;   // "15:00"
    }[];
  };
  slotDurationMinutes: number; // Por defecto 30 o 45 min
  bufferBetweenAppointmentsMinutes: number; // 10 min
}

export interface Service {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  priceMxn: number;
  requiredDepositMxn: number;
  category?: string; // "odontologia", "medicina_general", "estetica"
  isActive: boolean;
}

export interface Patient {
  id: string;
  tenantId: string;
  fullName: string;
  phoneE164: string; // Normalizado +52...
  whatsappId?: string;
  instagramId?: string;
  messengerId?: string;
  email?: string;
  medicalNotes?: Record<string, any>;
  isVip?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Appointment {
  id: string;
  tenantId: string;
  patientId: string;
  doctorId: string;
  serviceId: string;
  startTime: Date;
  endTime: Date;
  status: AppointmentStatus;
  paymentStatus: PaymentStatus;
  depositAmountMxn?: number;
  depositPaymentUrl?: string;
  paymentReferenceId?: string;
  channelOrigin: ChannelType;
  symptoms?: string;
  notes?: string;
  reminderSent24h: boolean;
  reminderSent2h: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  tenantId: string;
  patientId: string;
  channel: ChannelType;
  externalChannelId: string; // Chat ID de WhatsApp, IG o Call SID de Twilio
  isHandedOverToHuman: boolean;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  tenantId: string;
  direction: MessageDirection;
  senderRole: MessageSenderRole;
  content: string;
  mediaUrl?: string;
  channel: ChannelType;
  rawPayload?: Record<string, any>;
  createdAt: Date;
}

export interface TimeSlot {
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  doctorId: string;
  doctorName: string;
  serviceId?: string;
  available: boolean;
}

export interface ChannelCredentials {
  whatsapp?: {
    phoneNumberId: string;
    accessToken: string;
    businessAccountId: string;
    verifyToken: string;
  };
  instagram?: {
    pageId: string;
    accessToken: string;
  };
  messenger?: {
    pageId: string;
    accessToken: string;
  };
  twilio?: {
    accountSid: string;
    authToken: string;
    phoneNumber: string; // +52...
  };
  mercadopago?: {
    accessToken: string;
    publicKey: string;
  };
}

// ---------------------------------------------------------------------------
// Planes de suscripción (SaaS)
// ---------------------------------------------------------------------------

/**
 * Identificador del plan contratado. `trial` es el estado inicial de toda
 * clínica que se registra sola desde la landing: acceso a todo lo que ofrece
 * Clínica Pro, pero con cupos chicos y fecha de caducidad.
 */
export type PlanSlug = 'trial' | 'consultorio' | 'clinica-pro' | 'cadenas';

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'EXPIRED';

/**
 * Cupos duros del plan. `null` significa ilimitado, nunca "cero": un cupo en
 * cero se escribe como `0` y bloquea la acción por completo.
 */
export interface PlanLimits {
  /** Doctores activos simultáneos. */
  maxDoctors: number | null;
  /** Citas creadas dentro del mes natural en curso (America/Mexico_City). */
  maxAppointmentsPerMonth: number | null;
  /** Minutos de telefonía con IA incluidos por mes. */
  includedVoiceMinutes: number;
  /** Si el plan da acceso al canal de voz. */
  voiceEnabled: boolean;
}

export interface PlanDefinition {
  slug: PlanSlug;
  name: string;
  priceMonthlyMxn: number;
  priceAnnualMxn: number;
  limits: PlanLimits;
}

/**
 * Catálogo canónico de planes. Es la única fuente de verdad: la landing, el
 * panel y el backend leen de aquí, para que el precio que se anuncia y el
 * cupo que se aplica no puedan separarse con el tiempo.
 */
export const PLANS: Record<PlanSlug, PlanDefinition> = {
  trial: {
    slug: 'trial',
    name: 'Prueba gratuita',
    priceMonthlyMxn: 0,
    priceAnnualMxn: 0,
    limits: {
      maxDoctors: 5,
      maxAppointmentsPerMonth: 50,
      includedVoiceMinutes: 30,
      voiceEnabled: true,
    },
  },
  consultorio: {
    slug: 'consultorio',
    name: 'Consultorio Individual',
    priceMonthlyMxn: 1499,
    priceAnnualMxn: 1199,
    limits: {
      maxDoctors: 1,
      maxAppointmentsPerMonth: 250,
      includedVoiceMinutes: 0,
      voiceEnabled: false,
    },
  },
  'clinica-pro': {
    slug: 'clinica-pro',
    name: 'Clínica Pro',
    priceMonthlyMxn: 3499,
    priceAnnualMxn: 2799,
    limits: {
      maxDoctors: 5,
      maxAppointmentsPerMonth: null,
      includedVoiceMinutes: 300,
      voiceEnabled: true,
    },
  },
  cadenas: {
    slug: 'cadenas',
    name: 'Cadenas & Hospitales',
    priceMonthlyMxn: 7999,
    priceAnnualMxn: 6399,
    limits: {
      maxDoctors: null,
      maxAppointmentsPerMonth: null,
      includedVoiceMinutes: 1200,
      voiceEnabled: true,
    },
  },
};

export const PLAN_SLUGS = Object.keys(PLANS) as PlanSlug[];

/** Días de prueba que se otorgan al registrarse sin tarjeta. */
export const TRIAL_DURATION_DAYS = 14;

/** Métricas de consumo que se acumulan en `UsageCounter`. */
export type UsageMetric = 'VOICE_SECONDS';
