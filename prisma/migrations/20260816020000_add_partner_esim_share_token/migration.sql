-- Partner Phase 3 Slice 1: hashed-at-rest eSIM share tokens.
-- Additive only. No DROP / DELETE / data rewrite.

CREATE TABLE "PartnerEsimShareToken" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerEsimShareToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerEsimShareToken_tokenHash_key" ON "PartnerEsimShareToken"("tokenHash");
CREATE INDEX "PartnerEsimShareToken_partnerId_idx" ON "PartnerEsimShareToken"("partnerId");
CREATE INDEX "PartnerEsimShareToken_orderId_idx" ON "PartnerEsimShareToken"("orderId");
CREATE INDEX "PartnerEsimShareToken_revokedAt_idx" ON "PartnerEsimShareToken"("revokedAt");

-- One active (non-revoked) share token per Partner Order.
CREATE UNIQUE INDEX "PartnerEsimShareToken_orderId_active_key" ON "PartnerEsimShareToken"("orderId") WHERE "revokedAt" IS NULL;

ALTER TABLE "PartnerEsimShareToken" ADD CONSTRAINT "PartnerEsimShareToken_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerEsimShareToken" ADD CONSTRAINT "PartnerEsimShareToken_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
