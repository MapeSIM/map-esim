-- Admin customer email campaign broadcast (history + per-recipient logs).
CREATE TYPE "EmailCampaignAudience" AS ENUM ('ALL_CUSTOMERS', 'PURCHASED_CUSTOMERS', 'ACTIVE_CUSTOMERS');
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'TEST_SENT', 'SENDING', 'SENT', 'FAILED');
CREATE TYPE "EmailCampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "audience" "EmailCampaignAudience" NOT NULL,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "testSentTo" TEXT,
    "testSentAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "EmailCampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailCampaign_createdAt_idx" ON "EmailCampaign"("createdAt");
CREATE INDEX "EmailCampaign_status_idx" ON "EmailCampaign"("status");
CREATE INDEX "EmailCampaign_createdByAdminId_idx" ON "EmailCampaign"("createdByAdminId");
CREATE UNIQUE INDEX "EmailCampaignRecipient_campaignId_customerUserId_key" ON "EmailCampaignRecipient"("campaignId", "customerUserId");
CREATE INDEX "EmailCampaignRecipient_campaignId_status_idx" ON "EmailCampaignRecipient"("campaignId", "status");
CREATE INDEX "EmailCampaignRecipient_customerUserId_idx" ON "EmailCampaignRecipient"("customerUserId");

ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailCampaignRecipient" ADD CONSTRAINT "EmailCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailCampaignRecipient" ADD CONSTRAINT "EmailCampaignRecipient_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
