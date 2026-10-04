-- Cached VeSIM lifecycle / usage snapshot on Order (nullable, backwards compatible).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerLifecycleStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerRemainingDataGb" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerUsedDataGb" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerInitialDataGb" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerUsagePercent" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerActivatedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerExpiresAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "providerUsageSyncedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_providerUsageSyncedAt_idx" ON "Order"("providerUsageSyncedAt");
CREATE INDEX IF NOT EXISTS "Order_providerLifecycleStatus_idx" ON "Order"("providerLifecycleStatus");
