-- Phase 8G-A: minimum nullable-safe reconciliation metadata (read-only dashboard foundation).
-- No destructive constraints. Existing rows remain valid. No raw provider payloads.

ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "providerResultKind" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "providerObservedAt" TIMESTAMP(3);
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "safeProviderStatusCode" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "reconciliationResolvedAt" TIMESTAMP(3);
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "reconciliationResolvedByAdminId" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "reconciliationResolutionReason" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "reconciliationLockedAt" TIMESTAMP(3);

ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "providerResultKind" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "providerObservedAt" TIMESTAMP(3);
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "safeProviderStatusCode" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconciliationResolvedAt" TIMESTAMP(3);
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconciliationResolvedByAdminId" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconciliationResolutionReason" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconciliationLockedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AdminPackageAssignment_providerOrderId_idx"
  ON "AdminPackageAssignment"("providerOrderId");
CREATE INDEX IF NOT EXISTS "AdminPackageAssignment_providerResultKind_idx"
  ON "AdminPackageAssignment"("providerResultKind");
CREATE INDEX IF NOT EXISTS "AdminPackageAssignment_status_updatedAt_idx"
  ON "AdminPackageAssignment"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "AdminPackageAssignment_reconciliationResolvedAt_idx"
  ON "AdminPackageAssignment"("reconciliationResolvedAt");

CREATE INDEX IF NOT EXISTS "WalletEsimPurchase_providerOrderId_idx"
  ON "WalletEsimPurchase"("providerOrderId");
CREATE INDEX IF NOT EXISTS "WalletEsimPurchase_providerResultKind_idx"
  ON "WalletEsimPurchase"("providerResultKind");
CREATE INDEX IF NOT EXISTS "WalletEsimPurchase_status_updatedAt_idx"
  ON "WalletEsimPurchase"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "WalletEsimPurchase_reconciliationResolvedAt_idx"
  ON "WalletEsimPurchase"("reconciliationResolvedAt");
