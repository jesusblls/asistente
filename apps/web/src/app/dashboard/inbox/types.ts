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
}

export interface ApiConversationResponse {
  id: string;
  channel: 'WHATSAPP' | 'INSTAGRAM' | 'PHONE_CALL' | 'MESSENGER';
  externalChannelId?: string;
  isHandedOverToHuman: boolean;
  lastMessageAt?: string | null;
  createdAt: string;
  messages?: Array<{ content: string }>;
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
}
