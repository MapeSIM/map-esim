-- Partner Phase 1: split-payment persistence foundation (wallet-only behavior unchanged).
-- Migration-first safe: BEFORE INSERT compat trigger fills omitted funding fields
-- for pre-Phase-1 app inserts; explicit funding values are never overwritten.
-- No checkout / webhook / split orchestration in this migration.

-- AlterEnum OrderFundingSource
ALTER TYPE "OrderFundingSource" ADD VALUE 'PARTNER_SPLIT';
ALTER TYPE "OrderFundingSource" ADD VALUE 'PARTNER_GATEWAY';

-- AlterEnum PartnerEsimPurchaseStatus
ALTER TYPE "PartnerEsimPurchaseStatus" ADD VALUE 'AWAITING_GATEWAY_PAYMENT';
ALTER TYPE "PartnerEsimPurchaseStatus" ADD VALUE 'FUNDED';

-- 1) Add funding columns in temporarily insert-compatible (nullable) form
ALTER TABLE "PartnerEsimPurchase"
ADD COLUMN "useWallet" BOOLEAN,
ADD COLUMN "walletAppliedCents" INTEGER,
ADD COLUMN "gatewayAmountCents" INTEGER;

-- 2) Backfill existing rows as full wallet-only purchases
UPDATE "PartnerEsimPurchase"
SET
  "useWallet" = TRUE,
  "walletAppliedCents" = "partnerChargeCents",
  "gatewayAmountCents" = 0
WHERE
  "useWallet" IS NULL
  OR "walletAppliedCents" IS NULL
  OR "gatewayAmountCents" IS NULL;

-- 3) Compatibility trigger/function for concurrent + post-migration pre-Phase-1 inserts.
-- When walletAppliedCents is omitted/NULL, treat as legacy wallet-only:
--   useWallet = TRUE, walletAppliedCents = partnerChargeCents, gatewayAmountCents = 0
-- When walletAppliedCents is explicitly provided, do not overwrite.
CREATE OR REPLACE FUNCTION "PartnerEsimPurchase_legacy_funding_compat"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."walletAppliedCents" IS NULL THEN
    NEW."useWallet" := TRUE;
    NEW."walletAppliedCents" := NEW."partnerChargeCents";
    NEW."gatewayAmountCents" := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "PartnerEsimPurchase_legacy_funding_compat_bi"
  ON "PartnerEsimPurchase";

CREATE TRIGGER "PartnerEsimPurchase_legacy_funding_compat_bi"
BEFORE INSERT ON "PartnerEsimPurchase"
FOR EACH ROW
EXECUTE PROCEDURE "PartnerEsimPurchase_legacy_funding_compat"();

-- 4) Enforce NOT NULL / defaults / funding CHECK (trigger already protects inserts)
ALTER TABLE "PartnerEsimPurchase"
ALTER COLUMN "useWallet" SET NOT NULL,
ALTER COLUMN "useWallet" SET DEFAULT TRUE,
ALTER COLUMN "walletAppliedCents" SET NOT NULL,
ALTER COLUMN "gatewayAmountCents" SET NOT NULL,
ALTER COLUMN "gatewayAmountCents" SET DEFAULT 0;

ALTER TABLE "PartnerEsimPurchase"
ADD CONSTRAINT "PartnerEsimPurchase_funding_breakdown_check"
CHECK (
  "walletAppliedCents" >= 0
  AND "gatewayAmountCents" >= 0
  AND "walletAppliedCents" + "gatewayAmountCents" = "partnerChargeCents"
);

-- 5) Partner purchase-scoped gateway payment attempt table + indexes/FK
-- Reuses EsimPurchasePaymentAttemptStatus; does NOT alter customer EsimPurchasePaymentAttempt.
CREATE TABLE "PartnerEsimPurchasePaymentAttempt" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "gatewayAmountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "chargeCurrency" TEXT,
    "chargeAmountMinor" INTEGER,
    "fxRateSnapshot" TEXT,
    "gatewayProvider" "PaymentGatewayProvider",
    "gatewayPaymentRef" TEXT,
    "status" "EsimPurchasePaymentAttemptStatus" NOT NULL DEFAULT 'DRAFT',
    "checkoutIdempotencyKey" TEXT NOT NULL,
    "webhookEventId" TEXT,
    "failureCategory" TEXT,
    "failureCode" TEXT,
    "reconciliationState" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paymentConfirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "failureEmailNotificationStatus" TEXT,
    "failureEmailNotifiedAt" TIMESTAMP(3),
    "failureEmailWalletReturned" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerEsimPurchasePaymentAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PartnerEsimPurchasePaymentAttempt_gatewayAmountCents_nonneg" CHECK ("gatewayAmountCents" >= 0),
    CONSTRAINT "PartnerEsimPurchasePaymentAttempt_chargeAmountMinor_nonneg" CHECK ("chargeAmountMinor" IS NULL OR "chargeAmountMinor" >= 0)
);

CREATE UNIQUE INDEX "PartnerEsimPurchasePaymentAttempt_checkoutIdempotencyKey_key"
  ON "PartnerEsimPurchasePaymentAttempt"("checkoutIdempotencyKey");

CREATE UNIQUE INDEX "PartnerEsimPurchasePaymentAttempt_webhookEventId_key"
  ON "PartnerEsimPurchasePaymentAttempt"("webhookEventId");

CREATE INDEX "PartnerEsimPurchasePaymentAttempt_purchaseId_idx"
  ON "PartnerEsimPurchasePaymentAttempt"("purchaseId");

CREATE INDEX "PartnerEsimPurchasePaymentAttempt_status_idx"
  ON "PartnerEsimPurchasePaymentAttempt"("status");

CREATE INDEX "PartnerEsimPurchasePaymentAttempt_createdAt_idx"
  ON "PartnerEsimPurchasePaymentAttempt"("createdAt");

CREATE INDEX "PartnerEsimPurchasePaymentAttempt_purchaseId_createdAt_idx"
  ON "PartnerEsimPurchasePaymentAttempt"("purchaseId", "createdAt");

CREATE INDEX "PartnerEsimPurchasePaymentAttempt_gatewayProvider_idx"
  ON "PartnerEsimPurchasePaymentAttempt"("gatewayProvider");

CREATE INDEX "PartnerEsimPurchasePaymentAttempt_failureEmailNotificationStatus_idx"
  ON "PartnerEsimPurchasePaymentAttempt"("failureEmailNotificationStatus");

ALTER TABLE "PartnerEsimPurchasePaymentAttempt"
ADD CONSTRAINT "PartnerEsimPurchasePaymentAttempt_purchaseId_fkey"
FOREIGN KEY ("purchaseId") REFERENCES "PartnerEsimPurchase"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
