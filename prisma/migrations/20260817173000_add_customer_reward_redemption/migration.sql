-- Customer Rewards V1 Slice 2 — checkout redemption hold + purchase snapshot.
-- Additive. Isolated local migrate only.

CREATE TYPE "CustomerRewardRedemptionStatus" AS ENUM ('HELD', 'COMPLETED', 'RELEASED');

ALTER TABLE "WalletEsimPurchase" ADD COLUMN "useRewards" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN "rewardPointsRedeemed" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WalletEsimPurchase" DROP CONSTRAINT "WalletEsimPurchase_funding_breakdown_check";
ALTER TABLE "WalletEsimPurchase" ADD CONSTRAINT "WalletEsimPurchase_funding_breakdown_check"
CHECK (
  "walletAppliedCents" >= 0
  AND "gatewayAmountCents" >= 0
  AND "promoDiscountCents" >= 0
  AND "promoDiscountCents" <= "priceCents"
  AND "rewardPointsRedeemed" >= 0
  AND "rewardPointsRedeemed" <= "priceCents" - "promoDiscountCents"
  AND "walletAppliedCents" + "gatewayAmountCents" = "priceCents" - "promoDiscountCents" - "rewardPointsRedeemed"
);

CREATE TABLE "CustomerRewardRedemption" (
    "id" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "rewardAccountId" TEXT NOT NULL,
    "walletEsimPurchaseId" TEXT NOT NULL,
    "status" "CustomerRewardRedemptionStatus" NOT NULL DEFAULT 'HELD',
    "pointsHeld" INTEGER NOT NULL,
    "afterPromoCents" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRewardRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerRewardRedemption_walletEsimPurchaseId_key" ON "CustomerRewardRedemption"("walletEsimPurchaseId");
CREATE INDEX "CustomerRewardRedemption_customerUserId_createdAt_idx" ON "CustomerRewardRedemption"("customerUserId", "createdAt");
CREATE INDEX "CustomerRewardRedemption_status_idx" ON "CustomerRewardRedemption"("status");
CREATE INDEX "CustomerRewardRedemption_createdAt_idx" ON "CustomerRewardRedemption"("createdAt");

ALTER TABLE "CustomerRewardRedemption" ADD CONSTRAINT "CustomerRewardRedemption_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerRewardRedemption" ADD CONSTRAINT "CustomerRewardRedemption_rewardAccountId_fkey" FOREIGN KEY ("rewardAccountId") REFERENCES "CustomerRewardAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerRewardRedemption" ADD CONSTRAINT "CustomerRewardRedemption_walletEsimPurchaseId_fkey" FOREIGN KEY ("walletEsimPurchaseId") REFERENCES "WalletEsimPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
