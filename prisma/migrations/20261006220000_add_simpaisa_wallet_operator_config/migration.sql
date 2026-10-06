-- Singleton Simpaisa wallet operator enablement (JazzCash / Easypaisa).
CREATE TABLE "SimpaisaWalletOperatorConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "jazzcashEnabled" BOOLEAN NOT NULL DEFAULT true,
    "easypaisaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimpaisaWalletOperatorConfig_pkey" PRIMARY KEY ("id")
);

-- Seed singleton with JazzCash on / Easypaisa off (maintenance default).
INSERT INTO "SimpaisaWalletOperatorConfig" (
  "id",
  "jazzcashEnabled",
  "easypaisaEnabled",
  "version",
  "createdAt",
  "updatedAt"
) VALUES (
  'default',
  true,
  false,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
