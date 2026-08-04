-- CreateEnum
CREATE TYPE "OrderFundingSource" AS ENUM (
  'COMPANY_FUNDED',
  'CUSTOMER_WALLET',
  'DIRECT_PAYMENT'
);

-- CreateEnum
CREATE TYPE "AdminPackageAssignmentStatus" AS ENUM (
  'DRAFT',
  'READY',
  'PROVIDER_PENDING',
  'COMPLETED',
  'FAILED',
  'RECONCILIATION_REQUIRED'
);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "fundingSource" "OrderFundingSource";

-- CreateTable
CREATE TABLE "AdminPackageAssignment" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "destinationCode" TEXT,
    "destinationName" TEXT,
    "planName" TEXT,
    "dataAllowance" TEXT,
    "validity" TEXT,
    "fundingSource" "OrderFundingSource" NOT NULL DEFAULT 'COMPANY_FUNDED',
    "providerCostCents" INTEGER,
    "providerCurrency" TEXT NOT NULL DEFAULT 'USD',
    "status" "AdminPackageAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "orderId" TEXT,
    "providerOrderId" TEXT,
    "reason" TEXT NOT NULL,
    "internalReference" TEXT,
    "failureCategory" TEXT,
    "failureCode" TEXT,
    "reconciliationState" TEXT,
    "emailDeliveryStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AdminPackageAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdminPackageAssignment_providerCostCents_nonneg" CHECK ("providerCostCents" IS NULL OR "providerCostCents" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminPackageAssignment_idempotencyKey_key" ON "AdminPackageAssignment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdminPackageAssignment_orderId_key" ON "AdminPackageAssignment"("orderId");

-- CreateIndex
CREATE INDEX "AdminPackageAssignment_customerUserId_idx" ON "AdminPackageAssignment"("customerUserId");

-- CreateIndex
CREATE INDEX "AdminPackageAssignment_adminUserId_idx" ON "AdminPackageAssignment"("adminUserId");

-- CreateIndex
CREATE INDEX "AdminPackageAssignment_status_idx" ON "AdminPackageAssignment"("status");

-- CreateIndex
CREATE INDEX "AdminPackageAssignment_createdAt_idx" ON "AdminPackageAssignment"("createdAt");

-- CreateIndex
CREATE INDEX "AdminPackageAssignment_customerUserId_createdAt_idx" ON "AdminPackageAssignment"("customerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_fundingSource_idx" ON "Order"("fundingSource");

-- AddForeignKey
ALTER TABLE "AdminPackageAssignment" ADD CONSTRAINT "AdminPackageAssignment_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPackageAssignment" ADD CONSTRAINT "AdminPackageAssignment_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminPackageAssignment" ADD CONSTRAINT "AdminPackageAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
