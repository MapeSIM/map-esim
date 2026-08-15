-- Partner Phase 2 Slice 1: PartnerEsimPurchase table + ops control seed.
-- Additive only. No destructive rewrites. No customer wallet table coupling.

-- CreateEnum
CREATE TYPE "PartnerEsimPurchaseStatus" AS ENUM (
    'DRAFT',
    'READY',
    'FUNDS_RESERVED',
    'PROVIDER_PENDING',
    'COMPLETED',
    'FAILED_REFUNDED',
    'RECONCILIATION_REQUIRED'
);

-- CreateTable
CREATE TABLE "PartnerEsimPurchase" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "destinationCode" TEXT,
    "destinationName" TEXT,
    "planName" TEXT,
    "dataAllowance" TEXT,
    "validity" TEXT,
    "retailPriceCents" INTEGER NOT NULL,
    "discountBps" INTEGER NOT NULL,
    "discountVersion" INTEGER NOT NULL,
    "partnerChargeCents" INTEGER NOT NULL,
    "providerCostCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fundingSource" "OrderFundingSource" NOT NULL DEFAULT 'PARTNER_BALANCE',
    "status" "PartnerEsimPurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "debitTransactionId" TEXT,
    "refundTransactionId" TEXT,
    "orderId" TEXT,
    "providerOrderId" TEXT,
    "providerResultKind" TEXT,
    "providerObservedAt" TIMESTAMP(3),
    "safeProviderStatusCode" TEXT,
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
    "providerRefreshClaimedAt" TIMESTAMP(3),
    "providerRefreshCompletedAt" TIMESTAMP(3),
    "providerRefreshByAdminId" TEXT,
    "providerRefreshResult" TEXT,
    "providerRefreshSafeCode" TEXT,
    "providerRefreshOrderExists" TEXT,
    "providerRefreshOfferMatch" TEXT,
    "providerRefreshInstallData" TEXT,
    "providerRefreshSafeState" TEXT,
    "failureCategory" TEXT,
    "failureCode" TEXT,
    "reconciliationState" TEXT,
    "emailDeliveryStatus" TEXT,
    "reconRequiredEmailNotificationStatus" TEXT,
    "reconRequiredEmailNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerEsimPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerEsimPurchase_idempotencyKey_key" ON "PartnerEsimPurchase"("idempotencyKey");
CREATE UNIQUE INDEX "PartnerEsimPurchase_debitTransactionId_key" ON "PartnerEsimPurchase"("debitTransactionId");
CREATE UNIQUE INDEX "PartnerEsimPurchase_refundTransactionId_key" ON "PartnerEsimPurchase"("refundTransactionId");
CREATE UNIQUE INDEX "PartnerEsimPurchase_orderId_key" ON "PartnerEsimPurchase"("orderId");
CREATE INDEX "PartnerEsimPurchase_partnerId_idx" ON "PartnerEsimPurchase"("partnerId");
CREATE INDEX "PartnerEsimPurchase_status_idx" ON "PartnerEsimPurchase"("status");
CREATE INDEX "PartnerEsimPurchase_createdAt_idx" ON "PartnerEsimPurchase"("createdAt");
CREATE INDEX "PartnerEsimPurchase_partnerId_createdAt_idx" ON "PartnerEsimPurchase"("partnerId", "createdAt");
CREATE INDEX "PartnerEsimPurchase_providerOrderId_idx" ON "PartnerEsimPurchase"("providerOrderId");
CREATE INDEX "PartnerEsimPurchase_providerResultKind_idx" ON "PartnerEsimPurchase"("providerResultKind");
CREATE INDEX "PartnerEsimPurchase_status_updatedAt_idx" ON "PartnerEsimPurchase"("status", "updatedAt");
CREATE INDEX "PartnerEsimPurchase_reconciliationResolvedAt_idx" ON "PartnerEsimPurchase"("reconciliationResolvedAt");
CREATE INDEX "PartnerEsimPurchase_reconciliationLockedAt_idx" ON "PartnerEsimPurchase"("reconciliationLockedAt");
CREATE INDEX "PartnerEsimPurchase_reconciliationEscalatedAt_idx" ON "PartnerEsimPurchase"("reconciliationEscalatedAt");
CREATE INDEX "PartnerEsimPurchase_providerRefreshClaimedAt_idx" ON "PartnerEsimPurchase"("providerRefreshClaimedAt");
CREATE INDEX "PartnerEsimPurchase_providerRefreshResult_idx" ON "PartnerEsimPurchase"("providerRefreshResult");
CREATE INDEX "PartnerEsimPurchase_reconRequiredEmailNotificationStatus_idx" ON "PartnerEsimPurchase"("reconRequiredEmailNotificationStatus");

-- AddForeignKey
ALTER TABLE "PartnerEsimPurchase" ADD CONSTRAINT "PartnerEsimPurchase_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerEsimPurchase" ADD CONSTRAINT "PartnerEsimPurchase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerEsimPurchase" ADD CONSTRAINT "PartnerEsimPurchase_debitTransactionId_fkey" FOREIGN KEY ("debitTransactionId") REFERENCES "PartnerWalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerEsimPurchase" ADD CONSTRAINT "PartnerEsimPurchase_refundTransactionId_fkey" FOREIGN KEY ("refundTransactionId") REFERENCES "PartnerWalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed PARTNER_WALLET_PURCHASES control as ACTIVE (paused=false).
INSERT INTO "OperationalControl" ("id", "key", "paused", "version", "reason", "updatedByAdminId", "createdAt", "updatedAt")
VALUES
  ('opsctl_partner_wallet_purchases', 'PARTNER_WALLET_PURCHASES', false, 0, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
