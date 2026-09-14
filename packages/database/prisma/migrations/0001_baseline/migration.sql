-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "address" TEXT,
    "emergencyInstructions" TEXT,
    "welcomeMessage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Doctor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "calendarId" TEXT,
    "availabilityRules" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Doctor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "priceMxn" REAL NOT NULL DEFAULT 0.0,
    "requiredDepositMxn" REAL NOT NULL DEFAULT 0.0,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "whatsappId" TEXT,
    "instagramId" TEXT,
    "messengerId" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Patient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "paymentStatus" TEXT NOT NULL DEFAULT 'NONE',
    "depositAmountMxn" REAL,
    "depositPaymentUrl" TEXT,
    "paymentReferenceId" TEXT,
    "channelOrigin" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "symptoms" TEXT,
    "notes" TEXT,
    "reminderSent24h" BOOLEAN NOT NULL DEFAULT false,
    "reminderSent2h" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalChannelId" TEXT NOT NULL,
    "isHandedOverToHuman" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "channel" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "rawPayload" TEXT,
    "deliveryStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChannelConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "credentials" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FaqItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT,
    "keywords" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FaqItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Doctor_tenantId_isActive_idx" ON "Doctor"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Service_tenantId_isActive_idx" ON "Service"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Patient_tenantId_fullName_idx" ON "Patient"("tenantId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_tenantId_phoneE164_key" ON "Patient"("tenantId", "phoneE164");

-- CreateIndex
CREATE INDEX "Appointment_tenantId_startTime_idx" ON "Appointment"("tenantId", "startTime");

-- CreateIndex
CREATE INDEX "Appointment_doctorId_startTime_idx" ON "Appointment"("doctorId", "startTime");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_lastMessageAt_idx" ON "Conversation"("tenantId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_tenantId_channel_externalChannelId_key" ON "Conversation"("tenantId", "channel", "externalChannelId");

-- CreateIndex
CREATE INDEX "Message_tenantId_createdAt_idx" ON "Message"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_externalMessageId_key" ON "Message"("conversationId", "externalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConfig_tenantId_channelType_key" ON "ChannelConfig"("tenantId", "channelType");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_tenantId_type_idx" ON "Job"("tenantId", "type");

-- CreateIndex
CREATE INDEX "Job_status_updatedAt_idx" ON "Job"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "FaqItem_tenantId_idx" ON "FaqItem"("tenantId");
