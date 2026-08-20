-- Durable public browse offer snapshots. Additive only.
-- Checkout/admin/partner purchase paths do not read these tables.

CREATE TABLE "PublicDestinationOfferSnapshot" (
    "destinationCode" TEXT NOT NULL,
    "offerIds" TEXT[] NOT NULL,
    "offersJson" JSONB NOT NULL,
    "offerCount" INTEGER NOT NULL,
    "idFingerprint" TEXT NOT NULL,
    "payloadFingerprint" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "providerCheckedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "refreshClaimToken" TEXT,
    "refreshClaimedAt" TIMESTAMP(3),
    "refreshClaimExpiresAt" TIMESTAMP(3),
    "pendingOfferIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "pendingOffersJson" JSONB,
    "pendingOfferCount" INTEGER,
    "pendingIdFingerprint" TEXT,
    "pendingPayloadFingerprint" TEXT,
    "pendingFirstSeenAt" TIMESTAMP(3),
    "pendingConfirmCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicDestinationOfferSnapshot_pkey" PRIMARY KEY ("destinationCode"),
    CONSTRAINT "PublicDestinationOfferSnapshot_offerCount_positive" CHECK ("offerCount" > 0),
    CONSTRAINT "PublicDestinationOfferSnapshot_version_nonneg" CHECK ("version" >= 0),
    CONSTRAINT "PublicDestinationOfferSnapshot_pendingConfirm_nonneg" CHECK ("pendingConfirmCount" >= 0)
);

CREATE INDEX "PublicDestinationOfferSnapshot_providerCheckedAt_idx"
    ON "PublicDestinationOfferSnapshot"("providerCheckedAt");

CREATE INDEX "PublicDestinationOfferSnapshot_refreshClaimExpiresAt_idx"
    ON "PublicDestinationOfferSnapshot"("refreshClaimExpiresAt");

CREATE TABLE "PublicOfferSnapshotControl" (
    "id" TEXT NOT NULL,
    "publicReadsOn" BOOLEAN NOT NULL DEFAULT false,
    "seedVerifiedAt" TIMESTAMP(3),
    "expectedCountsJson" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicOfferSnapshotControl_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PublicOfferSnapshotControl_version_nonneg" CHECK ("version" >= 0)
);

INSERT INTO "PublicOfferSnapshotControl" ("id", "publicReadsOn", "version", "updatedAt")
VALUES ('default', false, 0, CURRENT_TIMESTAMP);
