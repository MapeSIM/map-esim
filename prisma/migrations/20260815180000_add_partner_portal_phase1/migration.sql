-- AlterEnum: widen Role with PARTNER (existing CUSTOMER/ADMIN rows unchanged).
ALTER TYPE "Role" ADD VALUE 'PARTNER';

-- CreateEnum
CREATE TYPE "PartnerWalletTransactionType" AS ENUM ('ADMIN_CREDIT', 'ADMIN_DEBIT');

-- CreateTable
CREATE TABLE "PartnerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "discountVersion" INTEGER NOT NULL DEFAULT 0,
    "disabledAt" TIMESTAMP(3),
    "statusVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerWalletAccount" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "currency" "WalletCurrency" NOT NULL DEFAULT 'USD',
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerWalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerWalletTransaction" (
    "id" TEXT NOT NULL,
    "partnerWalletAccountId" TEXT NOT NULL,
    "type" "PartnerWalletTransactionType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceBeforeCents" INTEGER NOT NULL,
    "balanceAfterCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdByAdminId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerWalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerProfile_userId_key" ON "PartnerProfile"("userId");

-- CreateIndex
CREATE INDEX "PartnerProfile_disabledAt_idx" ON "PartnerProfile"("disabledAt");

-- CreateIndex
CREATE INDEX "PartnerProfile_createdAt_idx" ON "PartnerProfile"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerWalletAccount_partnerId_key" ON "PartnerWalletAccount"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerWalletAccount_createdAt_idx" ON "PartnerWalletAccount"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerWalletTransaction_idempotencyKey_key" ON "PartnerWalletTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PartnerWalletTransaction_partnerWalletAccountId_createdAt_idx" ON "PartnerWalletTransaction"("partnerWalletAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerWalletTransaction_createdByAdminId_idx" ON "PartnerWalletTransaction"("createdByAdminId");

-- CreateIndex
CREATE INDEX "PartnerWalletTransaction_createdAt_idx" ON "PartnerWalletTransaction"("createdAt");

-- AddForeignKey
ALTER TABLE "PartnerProfile" ADD CONSTRAINT "PartnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerWalletAccount" ADD CONSTRAINT "PartnerWalletAccount_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerWalletTransaction" ADD CONSTRAINT "PartnerWalletTransaction_partnerWalletAccountId_fkey" FOREIGN KEY ("partnerWalletAccountId") REFERENCES "PartnerWalletAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerWalletTransaction" ADD CONSTRAINT "PartnerWalletTransaction_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
