-- Phase 8G-B1: durable provider-status refresh single-flight + sanitized observation fields.
-- Nullable-safe. No raw provider payloads. No destructive constraints.

ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "providerRefreshClaimedAt" TIMESTAMP(3);
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "providerRefreshCompletedAt" TIMESTAMP(3);
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "providerRefreshByAdminId" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "providerRefreshResult" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "providerRefreshSafeCode" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "providerRefreshOrderExists" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "providerRefreshOfferMatch" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "providerRefreshInstallData" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "providerRefreshSafeState" TEXT;

ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "providerRefreshClaimedAt" TIMESTAMP(3);
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "providerRefreshCompletedAt" TIMESTAMP(3);
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "providerRefreshByAdminId" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "providerRefreshResult" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "providerRefreshSafeCode" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "providerRefreshOrderExists" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "providerRefreshOfferMatch" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "providerRefreshInstallData" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "providerRefreshSafeState" TEXT;

CREATE INDEX IF NOT EXISTS "AdminPackageAssignment_providerRefreshClaimedAt_idx"
  ON "AdminPackageAssignment"("providerRefreshClaimedAt");
CREATE INDEX IF NOT EXISTS "AdminPackageAssignment_providerRefreshResult_idx"
  ON "AdminPackageAssignment"("providerRefreshResult");
CREATE INDEX IF NOT EXISTS "WalletEsimPurchase_providerRefreshClaimedAt_idx"
  ON "WalletEsimPurchase"("providerRefreshClaimedAt");
CREATE INDEX IF NOT EXISTS "WalletEsimPurchase_providerRefreshResult_idx"
  ON "WalletEsimPurchase"("providerRefreshResult");
