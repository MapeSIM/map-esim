-- Guest checkout admin ON/OFF (singleton). Default enabled=true.
-- Reversible: DROP TABLE "GuestCheckoutConfig";

CREATE TABLE "GuestCheckoutConfig" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestCheckoutConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "GuestCheckoutConfig" ("id", "enabled", "version", "updatedByAdminId", "createdAt", "updatedAt")
VALUES ('default', true, 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
