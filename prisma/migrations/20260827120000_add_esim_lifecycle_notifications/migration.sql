-- Customer eSIM package lifecycle notifications (expiry / low data).
-- Additive only — never drops existing columns.

CREATE TYPE "EsimLifecycleNotificationKind" AS ENUM (
  'EXPIRY_SOON_24H',
  'EXPIRED',
  'LOW_DATA',
  'DATA_EXHAUSTED'
);

CREATE TYPE "EsimLifecycleNotificationDeliveryStatus" AS ENUM (
  'PENDING',
  'CLAIMED',
  'SENT',
  'FAILED',
  'SKIPPED'
);

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "lifecycleUsageCheckedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_lifecycleUsageCheckedAt_idx"
  ON "Order"("lifecycleUsageCheckedAt");

CREATE TABLE IF NOT EXISTS "EsimLifecycleNotificationDelivery" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "kind" "EsimLifecycleNotificationKind" NOT NULL,
  "status" "EsimLifecycleNotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "claimToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "claimExpiresAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EsimLifecycleNotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EsimLifecycleNotificationDelivery_eventKey_key"
  ON "EsimLifecycleNotificationDelivery"("eventKey");

CREATE INDEX IF NOT EXISTS "EsimLifecycleNotificationDelivery_orderId_kind_idx"
  ON "EsimLifecycleNotificationDelivery"("orderId", "kind");

CREATE INDEX IF NOT EXISTS "EsimLifecycleNotificationDelivery_status_claimedAt_idx"
  ON "EsimLifecycleNotificationDelivery"("status", "claimedAt");

CREATE INDEX IF NOT EXISTS "EsimLifecycleNotificationDelivery_kind_status_idx"
  ON "EsimLifecycleNotificationDelivery"("kind", "status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'EsimLifecycleNotificationDelivery_orderId_fkey'
  ) THEN
    ALTER TABLE "EsimLifecycleNotificationDelivery"
      ADD CONSTRAINT "EsimLifecycleNotificationDelivery_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EsimLifecycleNotificationRunnerLock" (
  "id" TEXT NOT NULL,
  "claimToken" TEXT,
  "claimedAt" TIMESTAMP(3),
  "claimExpiresAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EsimLifecycleNotificationRunnerLock_pkey" PRIMARY KEY ("id")
);
