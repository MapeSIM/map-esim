-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'ACCOUNT_DELETION';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
