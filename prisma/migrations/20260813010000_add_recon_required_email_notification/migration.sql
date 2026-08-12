-- Durable once-only customer "order under review" email for WalletEsimPurchase.
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconRequiredEmailNotificationStatus" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconRequiredEmailNotifiedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "WalletEsimPurchase_reconRequiredEmailNotificationStatus_idx"
  ON "WalletEsimPurchase"("reconRequiredEmailNotificationStatus");
