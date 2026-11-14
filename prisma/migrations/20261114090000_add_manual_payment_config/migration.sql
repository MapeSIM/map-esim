-- Singleton admin-configured manual payment details shown at checkout.
CREATE TABLE "ManualPaymentConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "accountTitle" TEXT NOT NULL DEFAULT '',
    "jazzcashNumber" TEXT NOT NULL DEFAULT '',
    "easypaisaNumber" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccountTitle" TEXT NOT NULL DEFAULT '',
    "bankAccountNumber" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualPaymentConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ManualPaymentConfig" (
  "id",
  "enabled",
  "accountTitle",
  "jazzcashNumber",
  "easypaisaNumber",
  "bankName",
  "bankAccountTitle",
  "bankAccountNumber",
  "version",
  "createdAt",
  "updatedAt"
) VALUES (
  'default',
  false,
  '',
  '',
  '',
  '',
  '',
  '',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
