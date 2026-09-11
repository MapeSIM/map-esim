-- Customer referral MVP: unique referral codes + attribution + reward tracking.
CREATE TYPE "CustomerReferralStatus" AS ENUM ('PENDING', 'REWARDED', 'INELIGIBLE');

ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

CREATE TABLE "CustomerReferral" (
    "id" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "codeUsed" TEXT NOT NULL,
    "status" "CustomerReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rewardedPurchaseId" TEXT,
    "rewardWalletTxId" TEXT,
    "rewardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerReferral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerReferral_referredUserId_key" ON "CustomerReferral"("referredUserId");

CREATE INDEX "CustomerReferral_referrerUserId_idx" ON "CustomerReferral"("referrerUserId");

CREATE INDEX "CustomerReferral_status_idx" ON "CustomerReferral"("status");

CREATE INDEX "CustomerReferral_createdAt_idx" ON "CustomerReferral"("createdAt");

CREATE INDEX "CustomerReferral_rewardedPurchaseId_idx" ON "CustomerReferral"("rewardedPurchaseId");

ALTER TABLE "CustomerReferral" ADD CONSTRAINT "CustomerReferral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerReferral" ADD CONSTRAINT "CustomerReferral_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
