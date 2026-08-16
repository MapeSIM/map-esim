-- Admin invitation opaque password-setup tokens (hashed at rest). Additive only.
CREATE TABLE "AdminInviteSetupToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminInviteSetupToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminInviteSetupToken_tokenHash_key" ON "AdminInviteSetupToken"("tokenHash");
CREATE INDEX "AdminInviteSetupToken_userId_idx" ON "AdminInviteSetupToken"("userId");
CREATE INDEX "AdminInviteSetupToken_expiresAt_idx" ON "AdminInviteSetupToken"("expiresAt");

ALTER TABLE "AdminInviteSetupToken" ADD CONSTRAINT "AdminInviteSetupToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
