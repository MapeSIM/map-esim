-- Phase 8E: wallet transaction email notification snapshots (nullable-safe).
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "balanceBeforeCents" INTEGER;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "emailNotificationStatus" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "emailNotifiedAt" TIMESTAMP(3);

ALTER TABLE "WalletTransaction" DROP CONSTRAINT IF EXISTS "WalletTransaction_balanceBeforeCents_check";
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_balanceBeforeCents_check"
  CHECK ("balanceBeforeCents" IS NULL OR "balanceBeforeCents" >= 0);

CREATE INDEX IF NOT EXISTS "WalletTransaction_emailNotificationStatus_idx"
  ON "WalletTransaction"("emailNotificationStatus");
