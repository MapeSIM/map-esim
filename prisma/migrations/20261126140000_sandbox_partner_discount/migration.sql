-- Default 3% sandbox partner discount (catalog / buy / API / admin).

ALTER TABLE "SandboxPartner" ADD COLUMN IF NOT EXISTS "discountPercent" INTEGER NOT NULL DEFAULT 3;

-- Backfill every existing sandbox partner to the platform default.
UPDATE "SandboxPartner" SET "discountPercent" = 3;
