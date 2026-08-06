-- Admin Operations Part A2: allowlisted runtime pause switches.
-- Non-destructive. Seeds ACTIVE (paused=false) defaults to preserve current behavior.
-- No secret columns, arbitrary JSON payloads, or customer data.
-- Reversible: DROP TABLE "OperationalControl"; DROP TYPE "OperationalControlKey";

CREATE TYPE "OperationalControlKey" AS ENUM (
  'TRANSACTION_MAINTENANCE',
  'CUSTOMER_WALLET_PURCHASES',
  'ADMIN_WALLET_PURCHASES',
  'COMPANY_ASSIGNMENTS',
  'PROVIDER_ORDER_CREATION'
);

CREATE TABLE "OperationalControl" (
    "id" TEXT NOT NULL,
    "key" "OperationalControlKey" NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalControl_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OperationalControl_key_key" ON "OperationalControl"("key");
CREATE INDEX "OperationalControl_paused_idx" ON "OperationalControl"("paused");
CREATE INDEX "OperationalControl_updatedAt_idx" ON "OperationalControl"("updatedAt");

-- Seed allowlisted controls as ACTIVE (not paused). Safe default preserves open initiation.
INSERT INTO "OperationalControl" ("id", "key", "paused", "version", "reason", "updatedByAdminId", "createdAt", "updatedAt")
VALUES
  ('opsctl_transaction_maintenance', 'TRANSACTION_MAINTENANCE', false, 0, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('opsctl_customer_wallet_purchases', 'CUSTOMER_WALLET_PURCHASES', false, 0, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('opsctl_admin_wallet_purchases', 'ADMIN_WALLET_PURCHASES', false, 0, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('opsctl_company_assignments', 'COMPANY_ASSIGNMENTS', false, 0, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('opsctl_provider_order_creation', 'PROVIDER_ORDER_CREATION', false, 0, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
