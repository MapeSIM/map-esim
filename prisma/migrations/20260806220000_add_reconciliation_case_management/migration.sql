-- Phase 8G-B2: case lock, escalation, and safe resolution metadata.
-- Nullable-safe and non-destructive. Existing rows remain valid.
-- No raw provider payloads, ICCID plaintext, email bodies, or credentials.

-- AdminPackageAssignment
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "reconciliationResolutionCode" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "reconciliationLockedByAdminId" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "reconciliationLockReason" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "reconciliationEscalatedAt" TIMESTAMP(3);
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "reconciliationEscalatedByAdminId" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "reconciliationEscalationReason" TEXT;
ALTER TABLE "AdminPackageAssignment" ADD COLUMN IF NOT EXISTS "reconciliationEscalationPriority" TEXT;

-- WalletEsimPurchase
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconciliationResolutionCode" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconciliationLockedByAdminId" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconciliationLockReason" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconciliationEscalatedAt" TIMESTAMP(3);
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconciliationEscalatedByAdminId" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconciliationEscalationReason" TEXT;
ALTER TABLE "WalletEsimPurchase" ADD COLUMN IF NOT EXISTS "reconciliationEscalationPriority" TEXT;

-- WalletTopup
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "reconciliationResolvedAt" TIMESTAMP(3);
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "reconciliationResolvedByAdminId" TEXT;
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "reconciliationResolutionReason" TEXT;
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "reconciliationResolutionCode" TEXT;
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "reconciliationLockedAt" TIMESTAMP(3);
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "reconciliationLockedByAdminId" TEXT;
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "reconciliationLockReason" TEXT;
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "reconciliationEscalatedAt" TIMESTAMP(3);
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "reconciliationEscalatedByAdminId" TEXT;
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "reconciliationEscalationReason" TEXT;
ALTER TABLE "WalletTopup" ADD COLUMN IF NOT EXISTS "reconciliationEscalationPriority" TEXT;

-- WalletTransaction (wallet notification cases)
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reconciliationResolvedAt" TIMESTAMP(3);
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reconciliationResolvedByAdminId" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reconciliationResolutionReason" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reconciliationResolutionCode" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reconciliationLockedAt" TIMESTAMP(3);
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reconciliationLockedByAdminId" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reconciliationLockReason" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reconciliationEscalatedAt" TIMESTAMP(3);
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reconciliationEscalatedByAdminId" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reconciliationEscalationReason" TEXT;
ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "reconciliationEscalationPriority" TEXT;

-- Order (ICCID cases)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reconciliationResolvedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reconciliationResolvedByAdminId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reconciliationResolutionReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reconciliationResolutionCode" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reconciliationLockedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reconciliationLockedByAdminId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reconciliationLockReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reconciliationEscalatedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reconciliationEscalatedByAdminId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reconciliationEscalationReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "reconciliationEscalationPriority" TEXT;

CREATE INDEX IF NOT EXISTS "AdminPackageAssignment_reconciliationLockedAt_idx"
  ON "AdminPackageAssignment"("reconciliationLockedAt");
CREATE INDEX IF NOT EXISTS "AdminPackageAssignment_reconciliationEscalatedAt_idx"
  ON "AdminPackageAssignment"("reconciliationEscalatedAt");

CREATE INDEX IF NOT EXISTS "WalletEsimPurchase_reconciliationLockedAt_idx"
  ON "WalletEsimPurchase"("reconciliationLockedAt");
CREATE INDEX IF NOT EXISTS "WalletEsimPurchase_reconciliationEscalatedAt_idx"
  ON "WalletEsimPurchase"("reconciliationEscalatedAt");

CREATE INDEX IF NOT EXISTS "WalletTopup_reconciliationResolvedAt_idx"
  ON "WalletTopup"("reconciliationResolvedAt");
CREATE INDEX IF NOT EXISTS "WalletTopup_reconciliationLockedAt_idx"
  ON "WalletTopup"("reconciliationLockedAt");
CREATE INDEX IF NOT EXISTS "WalletTopup_reconciliationEscalatedAt_idx"
  ON "WalletTopup"("reconciliationEscalatedAt");

CREATE INDEX IF NOT EXISTS "WalletTransaction_reconciliationResolvedAt_idx"
  ON "WalletTransaction"("reconciliationResolvedAt");
CREATE INDEX IF NOT EXISTS "WalletTransaction_reconciliationLockedAt_idx"
  ON "WalletTransaction"("reconciliationLockedAt");
CREATE INDEX IF NOT EXISTS "WalletTransaction_reconciliationEscalatedAt_idx"
  ON "WalletTransaction"("reconciliationEscalatedAt");

CREATE INDEX IF NOT EXISTS "Order_reconciliationResolvedAt_idx"
  ON "Order"("reconciliationResolvedAt");
CREATE INDEX IF NOT EXISTS "Order_reconciliationLockedAt_idx"
  ON "Order"("reconciliationLockedAt");
CREATE INDEX IF NOT EXISTS "Order_reconciliationEscalatedAt_idx"
  ON "Order"("reconciliationEscalatedAt");
