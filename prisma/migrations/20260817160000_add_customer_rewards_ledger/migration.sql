-- Customer Rewards V1 ledger (additive). Isolated local migrate only.

CREATE TYPE "CustomerRewardTransactionType" AS ENUM (
  'PURCHASE_EARN',
  'PURCHASE_EARN_REVERSAL',
  'REDEMPTION',
  'REDEMPTION_RESTORE',
  'ADMIN_ADJUSTMENT'
);

CREATE TABLE "CustomerRewardAccount" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "lifetimeEarnedPoints" INTEGER NOT NULL DEFAULT 0,
    "lifetimeRedeemedPoints" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRewardAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerRewardAccount_customerUserId_key" ON "CustomerRewardAccount"("customerUserId");
CREATE INDEX "CustomerRewardAccount_createdAt_idx" ON "CustomerRewardAccount"("createdAt");

CREATE TABLE "CustomerRewardTransaction" (
    "id" TEXT NOT NULL,
    "rewardAccountId" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "type" "CustomerRewardTransactionType" NOT NULL,
    "pointsDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "eligibleSpendCents" INTEGER,
    "purchaseId" TEXT,
    "orderId" TEXT,
    "refundRequestId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerRewardTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerRewardTransaction_idempotencyKey_key" ON "CustomerRewardTransaction"("idempotencyKey");
CREATE UNIQUE INDEX "CustomerRewardTransaction_purchaseId_type_key" ON "CustomerRewardTransaction"("purchaseId", "type");
CREATE INDEX "CustomerRewardTransaction_customerUserId_createdAt_idx" ON "CustomerRewardTransaction"("customerUserId", "createdAt");
CREATE INDEX "CustomerRewardTransaction_rewardAccountId_createdAt_idx" ON "CustomerRewardTransaction"("rewardAccountId", "createdAt");
CREATE INDEX "CustomerRewardTransaction_type_idx" ON "CustomerRewardTransaction"("type");
CREATE INDEX "CustomerRewardTransaction_createdAt_idx" ON "CustomerRewardTransaction"("createdAt");

ALTER TABLE "CustomerRewardAccount" ADD CONSTRAINT "CustomerRewardAccount_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerRewardTransaction" ADD CONSTRAINT "CustomerRewardTransaction_rewardAccountId_fkey" FOREIGN KEY ("rewardAccountId") REFERENCES "CustomerRewardAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerRewardTransaction" ADD CONSTRAINT "CustomerRewardTransaction_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerRewardTransaction" ADD CONSTRAINT "CustomerRewardTransaction_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "WalletEsimPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerRewardTransaction" ADD CONSTRAINT "CustomerRewardTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
