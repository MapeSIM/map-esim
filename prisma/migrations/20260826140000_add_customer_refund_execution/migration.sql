-- Customer refund execution: retryable failure status + MAP Wallet credit linkage.

-- AlterEnum
ALTER TYPE "RefundRequestStatus" ADD VALUE 'EXECUTION_FAILED';

-- AlterTable
ALTER TABLE "RefundRequest" ADD COLUMN "executedRefundTransactionId" TEXT,
ADD COLUMN "executedAmountCents" INTEGER,
ADD COLUMN "executedAt" TIMESTAMP(3),
ADD COLUMN "executedByAdminId" TEXT,
ADD COLUMN "lastExecutionError" TEXT;

-- CreateIndex
CREATE INDEX "RefundRequest_executedRefundTransactionId_idx" ON "RefundRequest"("executedRefundTransactionId");

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_executedByAdminId_fkey" FOREIGN KEY ("executedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
