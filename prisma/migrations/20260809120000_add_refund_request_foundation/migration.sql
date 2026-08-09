-- Customer refund request + admin review foundation (no money movement).

CREATE TYPE "RefundRequestStatus" AS ENUM (
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED_PENDING_EXECUTION',
  'REJECTED',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "RefundRequestReason" AS ENUM (
  'TECHNICAL_ISSUE',
  'DUPLICATE_PAYMENT',
  'ESIM_NOT_RECEIVED',
  'WRONG_PLAN',
  'UNUSED_PLAN',
  'OTHER'
);

CREATE TABLE "RefundRequest" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "purchaseId" TEXT,
  "reason" "RefundRequestReason" NOT NULL,
  "customerNote" TEXT,
  "status" "RefundRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "refundAmountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "walletAppliedCents" INTEGER NOT NULL DEFAULT 0,
  "gatewayAmountCents" INTEGER NOT NULL DEFAULT 0,
  "fundingSource" "OrderFundingSource",
  "openOrderKey" TEXT,
  "adminDecisionNote" TEXT,
  "reviewedByAdminId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "decidedByAdminId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefundRequest_openOrderKey_key" ON "RefundRequest"("openOrderKey");
CREATE INDEX "RefundRequest_customerUserId_idx" ON "RefundRequest"("customerUserId");
CREATE INDEX "RefundRequest_orderId_idx" ON "RefundRequest"("orderId");
CREATE INDEX "RefundRequest_status_idx" ON "RefundRequest"("status");
CREATE INDEX "RefundRequest_createdAt_idx" ON "RefundRequest"("createdAt");
CREATE INDEX "RefundRequest_customerUserId_createdAt_idx" ON "RefundRequest"("customerUserId", "createdAt");
CREATE INDEX "RefundRequest_status_createdAt_idx" ON "RefundRequest"("status", "createdAt");

ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_decidedByAdminId_fkey" FOREIGN KEY ("decidedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
