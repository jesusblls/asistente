import type { ConversationItem, MessageItem } from './types';

export const DEMO_CONVERSATIONS: ConversationItem[] = [
  {
    id: 'demo-conv-1',
    patientName: 'Mariana Hernández',
    phone: '+52 (55) 1234-9988',
    channel: 'WHATSAPP',
    lastMessage: 'Perfecto, acabo de pagar el anticipo de $200 por Mercado Pago. ¡Nos vemos hoy!',
    lastTime: '16:15',
    unreadCount: 0,
    isHandedOverToHuman: false,
    status: 'Cita Confirmada',
    appointment: {
      serviceName: 'Limpieza Dental con Ultrasonido',
      doctorName: 'Dra. Sofía Silva',
      startTime: 'Hoy • 4:00 PM (45 min)',
      status: 'CONFIRMED',
      depositAmountMxn: 200,
      paymentStatus: 'DEPOSIT_PAID',
      symptoms: 'Limpieza dental semestral de rutina',
    },
  },
  {
    id: 'demo-conv-2',
    patientName: 'Fernando Rivas',
    phone: '+52 (55) 7766-5544',
    channel: 'PHONE_CALL',
    lastMessage: 'Grabación de llamada (1m 32s): Dolor agudo en tercer molar inferior.',
    lastTime: '15:40',
    unreadCount: 1,
    isUrgent: true,
    isHandedOverToHuman: false,
    status: '🚨 Urgencia Prioritaria',
    appointment: {
      serviceName: 'Extracción Muela del Juicio (Urgencia)',
      doctorName: 'Dr. Roberto Mendoza',
      startTime: 'Hoy • 6:30 PM (60 min)',
      status: 'CONFIRMED',
      depositAmountMxn: 500,
      paymentStatus: 'DEPOSIT_PAID',
      symptoms: 'Dolor punzante e inflamación en tercer molar derecho',
    },
  },
  {
    id: 'demo-conv-3',
    patientName: 'Sofía Morales',
    phone: '+52 (81) 8299-1122',
    channel: 'INSTAGRAM',
    lastMessage: 'Hola, ¿qué costo tiene el diseño de sonrisa con carillas de porcelana?',
    lastTime: '14:20',
    unreadCount: 0,
    isHandedOverToHuman: false,
    status: 'Cotización Entregada',
    appointment: {
      serviceName: 'Valoración Estética y Carillas',
      doctorName: 'Dra. María Fernández',
      startTime: 'Mañana • 11:00 AM (45 min)',
      status: 'PENDING',
      depositAmountMxn: 300,
      paymentStatus: 'PENDING',
      symptoms: 'Interés en carillas cerámicas superiores',
    },
  },
];

export const DEMO_MESSAGES: Record<string, MessageItem[]> = {
  'demo-conv-1': [
    {
      id: 'm1-1',
      sender: 'PATIENT',
      senderName: 'Mariana Hernández',
      content: 'Hola buenas tardes, ¿cuánto cuesta la limpieza dental y en qué horarios tienen libre hoy?',
      time: '16:05',
    },
    {
      id: 'm1-2',
      sender: 'AI_AGENT',
      senderName: 'Asistente IA (Gemini 2.5)',
      content:
        '¡Hola Mariana! Con mucho gusto. La Limpieza Dental con Ultrasonido cuesta $850 MXN (45 minutos). Para hoy contamos con disponibilidad a las 4:00 PM y a las 5:30 PM con la Dra. Sofía Silva. ¿Cuál te acomoda mejor?',
      time: '16:05',
    },
    {
      id: 'm1-3',
      sender: 'PATIENT',
      senderName: 'Mariana Hernández',
      content: 'A las 4:00 PM me queda excelente. ¿Cómo aparto mi lugar?',
      time: '16:08',
    },
    {
      id: 'm1-4',
      sender: 'AI_AGENT',
      senderName: 'Asistente IA (Gemini 2.5)',
      content:
        '¡Perfecto Mariana! Tu cita quedó agendada para hoy a las 4:00 PM. Para congelar el horario y evitar inasistencias requerimos un anticipo deducible de $200 MXN. Puedes pagar aquí de forma segura con Mercado Pago: https://mpago.li/dental-sonrisas',
      time: '16:09',
    },
    {
      id: 'm1-5',
      sender: 'PATIENT',
      senderName: 'Mariana Hernández',
      content: 'Perfecto, acabo de pagar el anticipo de $200 por Mercado Pago. ¡Nos vemos hoy!',
      time: '16:15',
    },
  ],
  'demo-conv-2': [
    {
      id: 'm2-1',
      sender: 'AI_AGENT',
      senderName: 'Llamada Entrante Twilio (+52)',
      content: 'Llamada contestada en 540ms. Audio procesado con reconocimiento de voz en tiempo real.',
      time: '15:38',
    },
    {
      id: 'm2-2',
      sender: 'PATIENT',
      senderName: 'Fernando Rivas (Voz)',
      content:
        'Buenas tardes, disculpen la molestia pero tengo un dolor fuertísimo en la muela de abajo que no me deja ni masticar desde ayer en la noche. ¿Tienen algún espacio de urgencia?',
      time: '15:39',
    },
    {
      id: 'm2-3',
      sender: 'AI_AGENT',
      senderName: 'Asistente de Voz IA (Gemini 2.5)',
      content:
        'Lamento mucho el dolor, Don Fernando. Lo canalizo de inmediato como Urgencia Prioritaria. El Dr. Roberto Mendoza tiene un espacio a las 6:30 PM de hoy para valorarlo y aliviar el dolor. ¿Le registro su lugar en nuestra sucursal?',
      time: '15:39',
    },
    {
      id: 'm2-4',
      sender: 'PATIENT',
      senderName: 'Fernando Rivas (Voz)',
      content: 'Sí por favor, cuenten conmigo ahí a las 6:30 PM. Muchas gracias.',
      time: '15:40',
    },
  ],
  'demo-conv-3': [
    {
      id: 'm3-1',
      sender: 'PATIENT',
      senderName: 'Sofía Morales',
      content: 'Hola, ¿qué costo tiene el diseño de sonrisa con carillas de porcelana?',
      time: '14:20',
    },
    {
      id: 'm3-2',
      sender: 'AI_AGENT',
      senderName: 'Asistente IA (Instagram)',
      content:
        '¡Hola Sofía! Con gusto. Las carillas de porcelana de alta estética tienen un costo desde $4,500 MXN por pieza. Incluyen escaneo 3D digital y prueba de mock-up. Te recomendamos agendar una valoración inicial para evaluar tu caso. ¿Te gustaría apartar mañana?',
      time: '14:21',
    },
  ],
};
