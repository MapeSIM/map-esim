-- Durable once-only customer "payment received, eSIM still preparing" email.
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "paymentReceivedEmailNotificationStatus" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "paymentReceivedEmailNotifiedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "WalletEsimPurchase_paymentReceivedEmailNotificationStatus_idx"
  ON "WalletEsimPurchase"("paymentReceivedEmailNotificationStatus");
