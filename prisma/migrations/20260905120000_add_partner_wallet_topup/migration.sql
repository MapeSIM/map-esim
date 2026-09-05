-- Partner self-service wallet Add Funds (parallel to customer WalletTopup).
-- Additive only — does not mutate existing financial rows.

-- AlterEnum: PartnerWalletTransactionType += TOPUP_CREDIT
ALTER TYPE "PartnerWalletTransactionType" ADD VALUE 'TOPUP_CREDIT';

-- CreateEnum
CREATE TYPE "PartnerWalletTopupStatus" AS ENUM (
  'DRAFT',
  'AWAITING_PAYMENT',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'CREDITED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'RECONCILIATION_REQUIRED'
);

-- CreateTable
CREATE TABLE "PartnerWalletTopup" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "baseAmountCents" INTEGER NOT NULL,
    "processingFeeAmountCents" INTEGER NOT NULL DEFAULT 0,
    "totalPayableCents" INTEGER NOT NULL,
    "feePolicyVersion" TEXT,
    "chargeCurrency" TEXT,
    "chargeAmountMinor" INTEGER,
    "fxRateSnapshot" TEXT,
    "gatewayProvider" "PaymentGatewayProvider",
    "gatewayPaymentRef" TEXT,
    "walletOperatorId" TEXT,
    "customerMsisdnMasked" TEXT,
    "status" "PartnerWalletTopupStatus" NOT NULL DEFAULT 'DRAFT',
    "checkoutIdempotencyKey" TEXT NOT NULL,
    "webhookEventId" TEXT,
    "walletTransactionId" TEXT,
    "failureCategory" TEXT,
    "failureCode" TEXT,
    "reconciliationResolvedAt" TIMESTAMP(3),
    "reconciliationResolvedByAdminId" TEXT,
    "reconciliationResolutionReason" TEXT,
    "reconciliationResolutionCode" TEXT,
    "reconciliationLockedAt" TIMESTAMP(3),
    "reconciliationLockedByAdminId" TEXT,
    "reconciliationLockReason" TEXT,
    "reconciliationEscalatedAt" TIMESTAMP(3),
    "reconciliationEscalatedByAdminId" TEXT,
    "reconciliationEscalationReason" TEXT,
    "reconciliationEscalationPriority" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paymentConfirmedAt" TIMESTAMP(3),
    "walletCreditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerWalletTopup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PartnerWalletTopup_base_positive" CHECK ("baseAmountCents" > 0),
    CONSTRAINT "PartnerWalletTopup_fee_nonneg" CHECK ("processingFeeAmountCents" >= 0),
    CONSTRAINT "PartnerWalletTopup_total_positive" CHECK ("totalPayableCents" > 0),
    CONSTRAINT "PartnerWalletTopup_total_covers_base_fee" CHECK ("totalPayableCents" >= "baseAmountCents" + "processingFeeAmountCents")
);

CREATE UNIQUE INDEX "PartnerWalletTopup_checkoutIdempotencyKey_key" ON "PartnerWalletTopup"("checkoutIdempotencyKey");
CREATE UNIQUE INDEX "PartnerWalletTopup_webhookEventId_key" ON "PartnerWalletTopup"("webhookEventId");
CREATE UNIQUE INDEX "PartnerWalletTopup_walletTransactionId_key" ON "PartnerWalletTopup"("walletTransactionId");
CREATE INDEX "PartnerWalletTopup_partnerId_idx" ON "PartnerWalletTopup"("partnerId");
CREATE INDEX "PartnerWalletTopup_status_idx" ON "PartnerWalletTopup"("status");
CREATE INDEX "PartnerWalletTopup_createdAt_idx" ON "PartnerWalletTopup"("createdAt");
CREATE INDEX "PartnerWalletTopup_partnerId_createdAt_idx" ON "PartnerWalletTopup"("partnerId", "createdAt");
CREATE INDEX "PartnerWalletTopup_gatewayProvider_idx" ON "PartnerWalletTopup"("gatewayProvider");
CREATE INDEX "PartnerWalletTopup_reconciliationResolvedAt_idx" ON "PartnerWalletTopup"("reconciliationResolvedAt");
CREATE INDEX "PartnerWalletTopup_reconciliationLockedAt_idx" ON "PartnerWalletTopup"("reconciliationLockedAt");
CREATE INDEX "PartnerWalletTopup_reconciliationEscalatedAt_idx" ON "PartnerWalletTopup"("reconciliationEscalatedAt");

ALTER TABLE "PartnerWalletTopup" ADD CONSTRAINT "PartnerWalletTopup_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerWalletTopup" ADD CONSTRAINT "PartnerWalletTopup_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "PartnerWalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
