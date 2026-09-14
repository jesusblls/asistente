/**
 * Tipos compartidos para la plataforma SaaS Asistente Omnicanal
 */

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
