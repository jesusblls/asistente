export const APPOINTMENT_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'CANCELLED',
  'RESCHEDULED',
  'COMPLETED',
  'NO_SHOW',
] as const;

export const PAYMENT_STATUSES = [
  'NONE',
  'DEPOSIT_PENDING',
  'DEPOSIT_PAID',
  'FULLY_PAID',
  'REFUNDED',
] as const;

export const createTenantSchema = {
  body: {
    type: 'object',
    required: ['name', 'phoneE164'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      phoneE164: { type: 'string', minLength: 10, maxLength: 30 },
      address: { type: 'string', maxLength: 300 },
      city: { type: 'string', maxLength: 120 },
      doctorName: { type: 'string', maxLength: 200 },
      doctorSpecialty: { type: 'string', maxLength: 200 },
    },
    additionalProperties: false,
  },
};

export const updateTenantSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      phoneE164: { type: 'string', minLength: 10, maxLength: 30 },
      address: { type: 'string', maxLength: 300 },
      welcomeMessage: { type: 'string', maxLength: 1000 },
      emergencyInstructions: { type: 'string', maxLength: 1000 },
    },
    additionalProperties: false,
  },
};

export const createDoctorSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
    },
  },
  body: {
    type: 'object',
    required: ['name', 'specialty'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      specialty: { type: 'string', minLength: 1, maxLength: 200 },
      phone: { type: 'string', maxLength: 30 },
      email: { type: 'string', maxLength: 200 },
    },
    additionalProperties: false,
  },
};

export const createServiceSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
    },
  },
  body: {
    type: 'object',
    required: ['name', 'priceMxn'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      priceMxn: { type: 'number', minimum: 0, maximum: 10_000_000 },
      durationMinutes: { type: 'number', minimum: 5, maximum: 600 },
      requiredDepositMxn: { type: 'number', minimum: 0 },
      description: { type: 'string', maxLength: 1000 },
      category: { type: 'string', maxLength: 120 },
    },
    additionalProperties: false,
  },
};

export const availabilitySchema = {
  querystring: {
    type: 'object',
    required: ['date'],
    properties: {
      date: { type: 'string', minLength: 1, maxLength: 20 },
      tenantId: { type: 'string' },
      doctorId: { type: 'string' },
      serviceId: { type: 'string' },
    },
  },
};

export const createAppointmentSchema = {
  body: {
    type: 'object',
    required: ['patientName', 'patientPhone', 'doctorId', 'serviceId', 'startTimeIso'],
    properties: {
      patientName: { type: 'string', minLength: 1, maxLength: 200 },
      patientPhone: { type: 'string', minLength: 10, maxLength: 30 },
      doctorId: { type: 'string', minLength: 1, maxLength: 100 },
      serviceId: { type: 'string', minLength: 1, maxLength: 100 },
      startTimeIso: { type: 'string', minLength: 1 },
      symptoms: { type: 'string', maxLength: 1000 },
      channelOrigin: {
        type: 'string',
        enum: ['WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'PHONE_CALL', 'WEBCHAT'],
      },
      tenantId: { type: 'string' },
    },
    additionalProperties: false,
  },
};

export const updateAppointmentSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
    },
  },
  body: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: APPOINTMENT_STATUSES as unknown as string[] },
      paymentStatus: { type: 'string', enum: PAYMENT_STATUSES as unknown as string[] },
      notes: { type: 'string', maxLength: 2000 },
      startTime: { type: 'string' },
      endTime: { type: 'string' },
      startTimeIso: { type: 'string' },
      doctorId: { type: 'string', maxLength: 100 },
      depositAmountMxn: { type: 'number', minimum: 0 },
      depositPaymentUrl: { type: 'string', maxLength: 1000 },
      paymentReferenceId: { type: 'string', maxLength: 200 },
    },
    additionalProperties: false,
  },
};

export const takeoverSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
    },
  },
  body: {
    type: 'object',
    required: ['isHandedOver'],
    properties: {
      isHandedOver: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

export const replySchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
    },
  },
  body: {
    type: 'object',
    required: ['text'],
    properties: {
      text: { type: 'string', minLength: 1, maxLength: 4000 },
      staffName: { type: 'string', maxLength: 200 },
    },
    additionalProperties: false,
  },
};

export const auditQuerySchema = {
  querystring: {
    type: 'object',
    properties: {
      patientId: { type: 'string', maxLength: 100 },
      entityId: { type: 'string', maxLength: 100 },
      actorId: { type: 'string', maxLength: 100 },
      entityType: { type: 'string', maxLength: 50 },
      action: { type: 'string', maxLength: 100 },
      from: { type: 'string', maxLength: 50 },
      to: { type: 'string', maxLength: 50 },
      limit: { type: 'string', maxLength: 10 },
      onlySensitive: { type: 'string', enum: ['true', 'false'] },
    },
  },
};
