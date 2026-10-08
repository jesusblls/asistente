export interface ConversationItem {
  id: string;
  patientName: string;
  phone: string;
  channel: 'WHATSAPP' | 'INSTAGRAM' | 'PHONE_CALL' | 'MESSENGER';
  lastMessage: string;
  lastTime: string;
  unreadCount: number;
  isUrgent?: boolean;
  isHandedOverToHuman: boolean;
  status: string;
  appointment?: {
    serviceName: string;
    doctorName: string;
    startTime: string;
    status: string;
    depositAmountMxn?: number | null;
    paymentStatus?: string;
    symptoms?: string | null;
  } | null;
}

export interface MessageItem {
  id: string;
  sender: 'PATIENT' | 'AI_AGENT' | 'HUMAN_STAFF';
  senderName: string;
  content: string;
  time: string;
  audioDuration?: string;
  /**
   * Estado de entrega de un saliente: `PENDING`/`SENT`/`FAILED` vienen de la
   * API. Los demás son locales: `SENDING` (la respuesta aún no llega),
   * `NOT_SAVED` (la API la rechazó: el paciente nunca la recibió) y
   * `UNCONFIRMED` (error de red o 5xx: pudo haberse guardado o no).
   */
  deliveryStatus?: 'PENDING' | 'SENT' | 'FAILED' | 'SENDING' | 'NOT_SAVED' | 'UNCONFIRMED' | null;
  /** Instante (ms) de creación: del servidor, o de envío si es local. */
  createdAtMs?: number;
}

export interface ApiConversationResponse {
  id: string;
  channel: 'WHATSAPP' | 'INSTAGRAM' | 'PHONE_CALL' | 'MESSENGER';
  externalChannelId?: string;
  isHandedOverToHuman: boolean;
  lastMessageAt?: string | null;
  createdAt: string;
  messages?: Array<{ content: string; senderRole?: string }>;
  patient?: {
    fullName?: string;
    phoneE164?: string;
    appointments?: Array<{
      startTime: string;
      status: string;
      depositAmountMxn?: number | null;
      paymentStatus?: string;
      symptoms?: string | null;
      service?: { name: string };
      doctor?: { name: string };
    }>;
  } | null;
}

export interface ApiMessageResponse {
  id: string;
  senderRole: 'PATIENT' | 'AI_AGENT' | 'HUMAN_STAFF';
  content: string;
  createdAt: string;
  deliveryStatus?: 'PENDING' | 'SENT' | 'FAILED' | null;
}
