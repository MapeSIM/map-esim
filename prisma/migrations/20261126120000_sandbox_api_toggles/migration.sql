-- Sandbox Partner API ON/OFF controls (global + per-partner).

ALTER TABLE "SandboxPartner" ADD COLUMN IF NOT EXISTS "apiEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "SandboxPartner_apiEnabled_idx" ON "SandboxPartner"("apiEnabled");

CREATE TABLE IF NOT EXISTS "SandboxSettings" (
    "id" TEXT NOT NULL,
    "globalSandboxApiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SandboxSettings" ("id", "globalSandboxApiEnabled", "createdAt", "updatedAt")
VALUES ('default', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
