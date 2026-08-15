/**
 * Isolated LOCAL Partner invite setup-link validation.
 * Requires process DATABASE_URL → 127.0.0.1 / localhost only.
 * Never logs raw tokens or setup URLs with secrets.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword, verifyPassword } from "../app/lib/auth/password";
import {
  PARTNER_INVITE_INVALID_MESSAGE,
  buildPartnerInviteSetupUrl,
  exchangePartnerInviteTokenInDb,
  getPartnerInviteSetupUserFromRaw,
  mintPartnerInviteToken,
} from "../app/lib/partner/partnerInvite";
import {
  PARTNER_INVITE_EMAIL_SUBJECT,
  renderPartnerInviteEmailHtml,
  renderPartnerInviteEmailText,
} from "../app/lib/email/partnerInviteTemplate";
import { BRAND_NAME } from "../app/lib/brand";

function assertLocalDatabaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL unparseable");
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing non-local DATABASE_URL host: ${host}`);
  }
  console.log(
    `CONFIRMED_LOCAL_DB host=${host} port=${parsed.port || "5432"} db=${parsed.pathname.replace(/^\//, "")}`
  );
}

function randomLocalPassword(): string {
  return `Uat${randomBytes(18).toString("base64url")}!9`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  assertLocalDatabaseUrl(url);

  const prisma = new PrismaClient();
  const stamp = Date.now();

  try {
    const adminPassword = randomLocalPassword();
    const partnerSetupPassword = randomLocalPassword();

    const admin = await prisma.user.create({
      data: {
        name: "Invite UAT Admin",
        email: `invite-admin-${stamp}@example.invalid`,
        role: Role.ADMIN,
        passwordHash: await hashPassword(adminPassword),
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });

    const partnerUser = await prisma.user.create({
      data: {
        name: "Invite UAT Partner",
        email: `invite-partner-${stamp}@example.invalid`,
        role: Role.PARTNER,
        passwordHash: null,
        emailVerifiedAt: new Date(),
        credentialsChangedAt: new Date(),
      },
      select: { id: true, email: true },
    });

    const partner = await prisma.partnerProfile.create({
      data: {
        userId: partnerUser.id,
        discountBps: 750,
        discountVersion: 1,
      },
      select: { id: true, discountBps: true },
    });

    await prisma.partnerWalletAccount.create({
      data: {
        partnerId: partner.id,
        balanceCents: 12_345,
        version: 1,
      },
    });

    // --- Email render (no secrets logged) ---
    const fakeUrl = buildPartnerInviteSetupUrl("placeholder_token_for_render_only");
    const html = renderPartnerInviteEmailHtml({
      recipientEmail: partnerUser.email,
      setupUrl: fakeUrl,
    });
    const text = renderPartnerInviteEmailText({
      recipientEmail: partnerUser.email,
      setupUrl: fakeUrl,
    });
    assert.equal(PARTNER_INVITE_EMAIL_SUBJECT, `Welcome to ${BRAND_NAME} Partner`);
    assert.match(html, /Your .* Partner account is ready/);
    assert.match(html, /Set up my password/);
    assert.match(html, /expires in 30 minutes/);
    assert.doesNotMatch(html, /\b\d{6}\b/);
    assert.doesNotMatch(html, /temporary password|plaintext/i);
    assert.doesNotMatch(text, /\b\d{6}\b/);
    console.log("PASS email_render_setup_link_no_otp");

    // --- Mint stores hash only ---
    const minted = await mintPartnerInviteToken(partnerUser.id);
    const inviteRow = await prisma.partnerInviteToken.findUniqueOrThrow({
      where: { id: minted.inviteId },
    });
    const expectedHash = createHash("sha256")
      .update(minted.rawToken)
      .digest("hex");
    assert.equal(inviteRow.tokenHash, expectedHash);
    assert.notEqual(inviteRow.tokenHash, minted.rawToken);
    assert.equal(inviteRow.consumedAt, null);
    console.log("PASS mint_stores_hash_not_raw");

    // --- Exchange consumes invite; creates one setup ---
    const exchanged = await exchangePartnerInviteTokenInDb(minted.rawToken);
    assert.equal(exchanged.ok, true);
    if (!exchanged.ok) throw new Error("exchange failed");

    const inviteAfter = await prisma.partnerInviteToken.findUniqueOrThrow({
      where: { id: minted.inviteId },
    });
    assert.ok(inviteAfter.consumedAt);
    const setupActive = await prisma.partnerInviteSetupToken.count({
      where: { userId: partnerUser.id, consumedAt: null },
    });
    assert.equal(setupActive, 1);
    console.log("PASS exchange_consumes_invite_creates_setup");

    // --- Original email link dies ---
    const replay = await exchangePartnerInviteTokenInDb(minted.rawToken);
    assert.equal(replay.ok, false);
    if (replay.ok) throw new Error("replay should fail");
    assert.equal(replay.error, PARTNER_INVITE_INVALID_MESSAGE);
    console.log("PASS original_email_link_dies_after_exchange");

    // --- Setup session authorizes password form ---
    const peek = await getPartnerInviteSetupUserFromRaw(exchanged.setupRaw);
    assert.ok(peek);
    assert.equal(peek?.userId, partnerUser.id);
    console.log("PASS setup_session_valid");

    // --- Password setup (consume setup only) ---
    const now = new Date();
    const newHash = await hashPassword(partnerSetupPassword);
    await prisma.$transaction(async (tx) => {
      const setup = await tx.partnerInviteSetupToken.updateMany({
        where: {
          id: exchanged.setupTokenId,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      assert.equal(setup.count, 1);
      await tx.user.update({
        where: { id: partnerUser.id },
        data: { passwordHash: newHash, credentialsChangedAt: now },
      });
    });

    const afterPw = await prisma.user.findUniqueOrThrow({
      where: { id: partnerUser.id },
      select: {
        role: true,
        passwordHash: true,
        partnerProfile: {
          select: {
            discountBps: true,
            walletAccount: { select: { balanceCents: true, version: true } },
          },
        },
      },
    });
    assert.equal(afterPw.role, Role.PARTNER);
    assert.ok(afterPw.passwordHash);
    assert.equal(
      await verifyPassword(partnerSetupPassword, afterPw.passwordHash),
      true
    );
    assert.equal(afterPw.partnerProfile?.discountBps, 750);
    assert.equal(afterPw.partnerProfile?.walletAccount?.balanceCents, 12_345);
    assert.equal(afterPw.partnerProfile?.walletAccount?.version, 1);
    console.log("PASS password_setup_preserves_profile_wallet");

    // --- Second use of setup session rejected ---
    const peek2 = await getPartnerInviteSetupUserFromRaw(exchanged.setupRaw);
    assert.equal(peek2, null);
    console.log("PASS setup_session_second_use_rejected");

    // --- Resend supersedes; old fails; new works ---
    const partner2User = await prisma.user.create({
      data: {
        name: "Invite UAT Partner Resend",
        email: `invite-partner-resend-${stamp}@example.invalid`,
        role: Role.PARTNER,
        passwordHash: null,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.partnerProfile.create({
      data: { userId: partner2User.id, discountBps: 100 },
    });

    const first = await mintPartnerInviteToken(partner2User.id);
    const second = await mintPartnerInviteToken(partner2User.id);
    const oldExchange = await exchangePartnerInviteTokenInDb(first.rawToken);
    assert.equal(oldExchange.ok, false);
    const newExchange = await exchangePartnerInviteTokenInDb(second.rawToken);
    assert.equal(newExchange.ok, true);
    console.log("PASS resend_invalidates_old_invite");

    // --- Expired invite rejected ---
    const partner3 = await prisma.user.create({
      data: {
        name: "Invite UAT Expired",
        email: `invite-partner-exp-${stamp}@example.invalid`,
        role: Role.PARTNER,
        passwordHash: null,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.partnerProfile.create({
      data: { userId: partner3.id, discountBps: 0 },
    });
    const expiredMint = await mintPartnerInviteToken(partner3.id);
    await prisma.partnerInviteToken.update({
      where: { id: expiredMint.inviteId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expiredEx = await exchangePartnerInviteTokenInDb(expiredMint.rawToken);
    assert.equal(expiredEx.ok, false);
    console.log("PASS expired_invite_rejected");

    // --- Forgot password + admin invite surfaces unchanged (static) ---
    // Covered by offline QA scripts; assert OTP models still exist.
    const otpPurposes = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'OtpPurpose'
      ORDER BY e.enumsortorder
    `;
    const labels = otpPurposes.map((r) => r.enumlabel);
    assert.ok(labels.includes("PASSWORD_RESET"));
    assert.ok(labels.includes("EMAIL_VERIFICATION"));
    console.log("PASS otp_purpose_enum_intact");

    void admin;
    console.log("ALL PASS uat-partner-invite-setup-isolated");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.name : "UAT_FAILED");
  process.exit(1);
});
