-- Durable once-only customer payment-failure email scheduling (nullable-safe).
ALTER TABLE "EsimPurchasePaymentAttempt" ADD COLUMN IF NOT EXISTS "failureEmailNotificationStatus" TEXT;
ALTER TABLE "EsimPurchasePaymentAttempt" ADD COLUMN IF NOT EXISTS "failureEmailNotifiedAt" TIMESTAMP(3);
ALTER TABLE "EsimPurchasePaymentAttempt" ADD COLUMN IF NOT EXISTS "failureEmailWalletReturned" BOOLEAN;

CREATE INDEX IF NOT EXISTS "EsimPurchasePaymentAttempt_failureEmailNotificationStatus_idx"
  ON "EsimPurchasePaymentAttempt"("failureEmailNotificationStatus");
