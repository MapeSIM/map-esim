-- Isolated sandbox partner tables (mapesim.store). Never touch live PartnerProfile.

CREATE TABLE "SandboxPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 125000,
    "initialBalanceCents" INTEGER NOT NULL DEFAULT 125000,
    "shareCompanyName" TEXT,
    "shareSupportEmail" TEXT,
    "shareLogoUrl" TEXT,
    "shareButtonBackground" TEXT,
    "shareButtonTextColor" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SandboxPartner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SandboxPartner_email_key" ON "SandboxPartner"("email");
CREATE INDEX "SandboxPartner_disabledAt_idx" ON "SandboxPartner"("disabledAt");
CREATE INDEX "SandboxPartner_createdAt_idx" ON "SandboxPartner"("createdAt");

CREATE TABLE "SandboxApiKey" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SandboxApiKey_keyHash_key" ON "SandboxApiKey"("keyHash");
CREATE INDEX "SandboxApiKey_partnerId_idx" ON "SandboxApiKey"("partnerId");
CREATE INDEX "SandboxApiKey_revokedAt_idx" ON "SandboxApiKey"("revokedAt");

CREATE TABLE "SandboxOrder" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "iccid" TEXT NOT NULL,
    "activationCode" TEXT NOT NULL,
    "matchingId" TEXT,
    "smdpAddress" TEXT NOT NULL DEFAULT 'smdp.sandbox.mapesim.store',
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SandboxOrder_orderId_key" ON "SandboxOrder"("orderId");
CREATE INDEX "SandboxOrder_partnerId_createdAt_idx" ON "SandboxOrder"("partnerId", "createdAt");
CREATE INDEX "SandboxOrder_iccid_idx" ON "SandboxOrder"("iccid");

CREATE TABLE "SandboxWalletTx" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SandboxWalletTx_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SandboxWalletTx_partnerId_createdAt_idx" ON "SandboxWalletTx"("partnerId", "createdAt");

ALTER TABLE "SandboxApiKey" ADD CONSTRAINT "SandboxApiKey_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "SandboxPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SandboxOrder" ADD CONSTRAINT "SandboxOrder_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "SandboxPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SandboxWalletTx" ADD CONSTRAINT "SandboxWalletTx_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "SandboxPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
