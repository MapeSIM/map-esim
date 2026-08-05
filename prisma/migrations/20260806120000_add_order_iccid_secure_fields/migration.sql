-- AlterTable
ALTER TABLE "Order" ADD COLUMN "iccidHash" TEXT,
ADD COLUMN "iccidLast4" TEXT,
ADD COLUMN "iccidCapturedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_iccidHash_idx" ON "Order"("iccidHash");
