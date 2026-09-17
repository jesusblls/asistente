-- ---------------------------------------------------------------------------
-- Control de morosidad, período de gracia e historial de cobros SaaS.
-- ---------------------------------------------------------------------------

ALTER TABLE "Tenant" ADD COLUMN "pastDueSince" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "gracePeriodEndsAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "lastPaymentError" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "lastBillingNoticeSentAt" TIMESTAMP(3);

CREATE TABLE "SubscriptionCharge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mpPaymentId" TEXT,
    "mpPreapprovalId" TEXT,
    "amountMxn" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "statusDetail" TEXT,
    "failureReason" TEXT,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "lastFourDigits" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionCharge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionCharge_tenantId_createdAt_idx" ON "SubscriptionCharge"("tenantId", "createdAt");
CREATE INDEX "SubscriptionCharge_mpPaymentId_idx" ON "SubscriptionCharge"("mpPaymentId");
CREATE INDEX "SubscriptionCharge_status_idx" ON "SubscriptionCharge"("status");

ALTER TABLE "SubscriptionCharge" ADD CONSTRAINT "SubscriptionCharge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
