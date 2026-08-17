-- Customer Rewards V1 Slice 3 — allow a second REDEMPTION_RESTORE per purchase
-- (pre-funding hold release vs post-refund restore of a COMPLETED redemption).
-- Earn / earn-reversal / completed-redemption remain one-per-purchase.
-- Additive. Isolated local migrate only.

DROP INDEX IF EXISTS "CustomerRewardTransaction_purchaseId_type_key";

CREATE UNIQUE INDEX "CustomerRewardTransaction_purchase_earn_once"
  ON "CustomerRewardTransaction" ("purchaseId")
  WHERE "purchaseId" IS NOT NULL AND "type" = 'PURCHASE_EARN';

CREATE UNIQUE INDEX "CustomerRewardTransaction_purchase_earn_reversal_once"
  ON "CustomerRewardTransaction" ("purchaseId")
  WHERE "purchaseId" IS NOT NULL AND "type" = 'PURCHASE_EARN_REVERSAL';

CREATE UNIQUE INDEX "CustomerRewardTransaction_purchase_redemption_once"
  ON "CustomerRewardTransaction" ("purchaseId")
  WHERE "purchaseId" IS NOT NULL AND "type" = 'REDEMPTION';
