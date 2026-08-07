-- Phase PG1: split-payment persistence foundation (wallet-only behavior unchanged).
-- Migration-first safe: BEFORE INSERT compat trigger fills omitted funding fields
-- for pre-PG1 app inserts; explicit PG1 funding values are never overwritten.

-- AlterEnum OrderFundingSource
ALTER TYPE "OrderFundingSource" ADD VALUE 'CUSTOMER_SPLIT';

-- AlterEnum WalletEsimPurchaseStatus
ALTER TYPE "WalletEsimPurchaseStatus" ADD VALUE 'AWAITING_GATEWAY_PAYMENT';
ALTER TYPE "WalletEsimPurchaseStatus" ADD VALUE 'FUNDED';

-- CreateEnum
CREATE TYPE "EsimPurchasePaymentAttemptStatus" AS ENUM (
  'DRAFT',
  'AWAITING_PAYMENT',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
  'RECONCILIATION_REQUIRED'
);

-- 1) Add funding columns in temporarily insert-compatible (nullable) form
ALTER TABLE "WalletEsimPurchase"
ADD COLUMN "useWallet" BOOLEAN,
ADD COLUMN "walletAppliedCents" INTEGER,
ADD COLUMN "gatewayAmountCents" INTEGER;

-- 2) Backfill existing rows as full wallet-only purchases
UPDATE "WalletEsimPurchase"
SET
  "useWallet" = TRUE,
  "walletAppliedCents" = "priceCents",
  "gatewayAmountCents" = 0
WHERE
  "useWallet" IS NULL
  OR "walletAppliedCents" IS NULL
  OR "gatewayAmountCents" IS NULL;

-- 3) Compatibility trigger/function for concurrent + post-migration pre-PG1 inserts.
-- When walletAppliedCents is omitted/NULL, treat as legacy wallet-only:
--   useWallet = TRUE, walletAppliedCents = priceCents, gatewayAmountCents = 0
-- When walletAppliedCents is explicitly provided (new PG1 app), do not overwrite.
CREATE OR REPLACE FUNCTION "WalletEsimPurchase_legacy_funding_compat"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."walletAppliedCents" IS NULL THEN
    NEW."useWallet" := TRUE;
    NEW."walletAppliedCents" := NEW."priceCents";
    NEW."gatewayAmountCents" := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "WalletEsimPurchase_legacy_funding_compat_bi"
  ON "WalletEsimPurchase";

CREATE TRIGGER "WalletEsimPurchase_legacy_funding_compat_bi"
BEFORE INSERT ON "WalletEsimPurchase"
FOR EACH ROW
EXECUTE PROCEDURE "WalletEsimPurchase_legacy_funding_compat"();

-- 4) Enforce NOT NULL / defaults / funding CHECK (trigger already protects inserts)
ALTER TABLE "WalletEsimPurchase"
ALTER COLUMN "useWallet" SET NOT NULL,
ALTER COLUMN "useWallet" SET DEFAULT TRUE,
ALTER COLUMN "walletAppliedCents" SET NOT NULL,
ALTER COLUMN "gatewayAmountCents" SET NOT NULL,
ALTER COLUMN "gatewayAmountCents" SET DEFAULT 0;

ALTER TABLE "WalletEsimPurchase"
ADD CONSTRAINT "WalletEsimPurchase_funding_breakdown_check"
CHECK (
  "walletAppliedCents" >= 0
  AND "gatewayAmountCents" >= 0
  AND "walletAppliedCents" + "gatewayAmountCents" = "priceCents"
);

-- 5) Purchase-scoped gateway payment attempt table + indexes/FK
CREATE TABLE "EsimPurchasePaymentAttempt" (
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsimPurchasePaymentAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EsimPurchasePaymentAttempt_gatewayAmountCents_nonneg" CHECK ("gatewayAmountCents" >= 0),
    CONSTRAINT "EsimPurchasePaymentAttempt_chargeAmountMinor_nonneg" CHECK ("chargeAmountMinor" IS NULL OR "chargeAmountMinor" >= 0)
);

CREATE UNIQUE INDEX "EsimPurchasePaymentAttempt_checkoutIdempotencyKey_key" ON "EsimPurchasePaymentAttempt"("checkoutIdempotencyKey");

CREATE UNIQUE INDEX "EsimPurchasePaymentAttempt_webhookEventId_key" ON "EsimPurchasePaymentAttempt"("webhookEventId");

CREATE INDEX "EsimPurchasePaymentAttempt_purchaseId_idx" ON "EsimPurchasePaymentAttempt"("purchaseId");

CREATE INDEX "EsimPurchasePaymentAttempt_status_idx" ON "EsimPurchasePaymentAttempt"("status");

CREATE INDEX "EsimPurchasePaymentAttempt_createdAt_idx" ON "EsimPurchasePaymentAttempt"("createdAt");

CREATE INDEX "EsimPurchasePaymentAttempt_purchaseId_createdAt_idx" ON "EsimPurchasePaymentAttempt"("purchaseId", "createdAt");

CREATE INDEX "EsimPurchasePaymentAttempt_gatewayProvider_idx" ON "EsimPurchasePaymentAttempt"("gatewayProvider");

ALTER TABLE "EsimPurchasePaymentAttempt" ADD CONSTRAINT "EsimPurchasePaymentAttempt_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "WalletEsimPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
