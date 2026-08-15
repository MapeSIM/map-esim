-- AlterTable
ALTER TABLE "User" ADD COLUMN "adminDisabledAt" TIMESTAMP(3),
ADD COLUMN "adminStatusVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "User_adminDisabledAt_idx" ON "User"("adminDisabledAt");
