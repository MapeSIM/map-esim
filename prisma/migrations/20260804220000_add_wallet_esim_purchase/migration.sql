-- CreateEnum
CREATE TYPE "WalletEsimPurchaseStatus" AS ENUM (
  'DRAFT',
  'READY',
  'FUNDS_RESERVED',
  'PROVIDER_PENDING',
  'COMPLETED',
  'FAILED_REFUNDED',
  'RECONCILIATION_REQUIRED'
);

-- CreateTable
CREATE TABLE "WalletEsimPurchase" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "destinationCode" TEXT,
    "destinationName" TEXT,
    "planName" TEXT,
    "dataAllowance" TEXT,
    "validity" TEXT,
    "priceCents" INTEGER NOT NULL,
    "providerCostCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fundingSource" "OrderFundingSource" NOT NULL DEFAULT 'CUSTOMER_WALLET',
    "status" "WalletEsimPurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "debitTransactionId" TEXT,
    "refundTransactionId" TEXT,
    "orderId" TEXT,
    "providerOrderId" TEXT,
    "failureCategory" TEXT,
    "failureCode" TEXT,
    "reconciliationState" TEXT,
    "emailDeliveryStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WalletEsimPurchase_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WalletEsimPurchase_priceCents_pos" CHECK ("priceCents" > 0),
    CONSTRAINT "WalletEsimPurchase_providerCostCents_nonneg" CHECK ("providerCostCents" IS NULL OR "providerCostCents" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletEsimPurchase_idempotencyKey_key" ON "WalletEsimPurchase"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEsimPurchase_debitTransactionId_key" ON "WalletEsimPurchase"("debitTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEsimPurchase_refundTransactionId_key" ON "WalletEsimPurchase"("refundTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletEsimPurchase_orderId_key" ON "WalletEsimPurchase"("orderId");

-- CreateIndex
CREATE INDEX "WalletEsimPurchase_customerUserId_idx" ON "WalletEsimPurchase"("customerUserId");

-- CreateIndex
CREATE INDEX "WalletEsimPurchase_status_idx" ON "WalletEsimPurchase"("status");

-- CreateIndex
CREATE INDEX "WalletEsimPurchase_createdAt_idx" ON "WalletEsimPurchase"("createdAt");

-- CreateIndex
CREATE INDEX "WalletEsimPurchase_customerUserId_createdAt_idx" ON "WalletEsimPurchase"("customerUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "WalletEsimPurchase" ADD CONSTRAINT "WalletEsimPurchase_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEsimPurchase" ADD CONSTRAINT "WalletEsimPurchase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEsimPurchase" ADD CONSTRAINT "WalletEsimPurchase_debitTransactionId_fkey" FOREIGN KEY ("debitTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEsimPurchase" ADD CONSTRAINT "WalletEsimPurchase_refundTransactionId_fkey" FOREIGN KEY ("refundTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
