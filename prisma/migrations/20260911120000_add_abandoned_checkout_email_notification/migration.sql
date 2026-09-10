-- Durable once-only customer abandoned-checkout recovery email.
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "abandonedCheckoutEmailNotificationStatus" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "abandonedCheckoutEmailNotifiedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "WalletEsimPurchase_abandonedCheckoutEmailNotificationStatus_idx"
  ON "WalletEsimPurchase"("abandonedCheckoutEmailNotificationStatus");
