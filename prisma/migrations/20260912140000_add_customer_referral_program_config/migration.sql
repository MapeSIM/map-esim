-- Admin-controlled customer referral program settings (singleton).
CREATE TYPE "ReferralRewardType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE');

CREATE TABLE "CustomerReferralProgramConfig" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rewardType" "ReferralRewardType" NOT NULL DEFAULT 'FIXED_AMOUNT',
    "rewardValue" INTEGER NOT NULL DEFAULT 500,
    "minPurchaseCents" INTEGER NOT NULL DEFAULT 0,
    "maxRewardCents" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerReferralProgramConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CustomerReferralProgramConfig" (
  "id",
  "enabled",
  "rewardType",
  "rewardValue",
  "minPurchaseCents",
  "maxRewardCents",
  "version",
  "updatedByAdminId",
  "createdAt",
  "updatedAt"
) VALUES (
  'default',
  true,
  'FIXED_AMOUNT',
  500,
  0,
  NULL,
  1,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
