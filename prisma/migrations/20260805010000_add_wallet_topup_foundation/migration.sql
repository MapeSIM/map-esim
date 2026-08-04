-- CreateEnum
CREATE TYPE "WalletTopupStatus" AS ENUM (
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

-- CreateEnum
CREATE TYPE "PaymentGatewayProvider" AS ENUM (
  'SIMPAISA',
  'PAYFAST',
  'SAFEPAY',
  'JAZZCASH',
  'EASYPAISA',
  'MANUAL_TEST'
);

-- CreateTable
CREATE TABLE "WalletTopup" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "creditAmountCents" INTEGER NOT NULL,
    "chargeCurrency" TEXT,
    "chargeAmountMinor" INTEGER,
    "fxRateSnapshot" TEXT,
    "gatewayProvider" "PaymentGatewayProvider",
    "gatewayPaymentRef" TEXT,
    "status" "WalletTopupStatus" NOT NULL DEFAULT 'DRAFT',
    "checkoutIdempotencyKey" TEXT NOT NULL,
    "webhookEventId" TEXT,
    "walletTransactionId" TEXT,
    "failureCategory" TEXT,
    "failureCode" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paymentConfirmedAt" TIMESTAMP(3),
    "walletCreditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletTopup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WalletTopup_creditAmountCents_pos" CHECK ("creditAmountCents" > 0),
    CONSTRAINT "WalletTopup_chargeAmountMinor_nonneg" CHECK ("chargeAmountMinor" IS NULL OR "chargeAmountMinor" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletTopup_checkoutIdempotencyKey_key" ON "WalletTopup"("checkoutIdempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTopup_webhookEventId_key" ON "WalletTopup"("webhookEventId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTopup_walletTransactionId_key" ON "WalletTopup"("walletTransactionId");

-- CreateIndex
CREATE INDEX "WalletTopup_customerUserId_idx" ON "WalletTopup"("customerUserId");

-- CreateIndex
CREATE INDEX "WalletTopup_status_idx" ON "WalletTopup"("status");

-- CreateIndex
CREATE INDEX "WalletTopup_createdAt_idx" ON "WalletTopup"("createdAt");

-- CreateIndex
CREATE INDEX "WalletTopup_customerUserId_createdAt_idx" ON "WalletTopup"("customerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTopup_gatewayProvider_idx" ON "WalletTopup"("gatewayProvider");

-- AddForeignKey
ALTER TABLE "WalletTopup" ADD CONSTRAINT "WalletTopup_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTopup" ADD CONSTRAINT "WalletTopup_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
