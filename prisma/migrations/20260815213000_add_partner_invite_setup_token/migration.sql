-- AlterTable: Partner invitation opaque tokens (hashed at rest). Additive only.
CREATE TABLE "PartnerInviteToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerInviteToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerInviteSetupToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerInviteSetupToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerInviteToken_tokenHash_key" ON "PartnerInviteToken"("tokenHash");
CREATE INDEX "PartnerInviteToken_userId_idx" ON "PartnerInviteToken"("userId");
CREATE INDEX "PartnerInviteToken_expiresAt_idx" ON "PartnerInviteToken"("expiresAt");

CREATE UNIQUE INDEX "PartnerInviteSetupToken_tokenHash_key" ON "PartnerInviteSetupToken"("tokenHash");
CREATE INDEX "PartnerInviteSetupToken_userId_idx" ON "PartnerInviteSetupToken"("userId");
CREATE INDEX "PartnerInviteSetupToken_inviteId_idx" ON "PartnerInviteSetupToken"("inviteId");
CREATE INDEX "PartnerInviteSetupToken_expiresAt_idx" ON "PartnerInviteSetupToken"("expiresAt");

ALTER TABLE "PartnerInviteToken" ADD CONSTRAINT "PartnerInviteToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerInviteSetupToken" ADD CONSTRAINT "PartnerInviteSetupToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerInviteSetupToken" ADD CONSTRAINT "PartnerInviteSetupToken_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "PartnerInviteToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
