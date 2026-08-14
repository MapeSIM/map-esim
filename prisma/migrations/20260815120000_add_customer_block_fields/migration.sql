-- AlterTable
ALTER TABLE "User" ADD COLUMN "blockedAt" TIMESTAMP(3),
ADD COLUMN "blockedReason" TEXT,
ADD COLUMN "blockedByAdminId" TEXT,
ADD COLUMN "accountStatusVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "User_blockedAt_idx" ON "User"("blockedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_blockedByAdminId_fkey" FOREIGN KEY ("blockedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
