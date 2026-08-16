/**
 * Focused Admin Invite password-setup-link QA.
 * Isolated LOCAL DB only: 127.0.0.1 / map_esim_admin_invite_uat.
 * No Production. No live email. No provider/wallet writes.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword, validateAdminPassword } from "../app/lib/auth/password";
import {
  ADMIN_INVITE_INVALID_MESSAGE,
  ADMIN_INVITE_SETUP_TTL_MS,
  adminInviteSetupExpiresAt,
  hashAdminInviteSetupToken,
  isAdminInviteSetupLive,
} from "../app/lib/admin/adminInviteSetupShared";

const root = path.join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function assertLocalAdminInviteDb(url: string): void {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing non-local host: ${host}`);
  }
  const db = parsed.pathname.replace(/^\//, "");
  if (db !== "map_esim_admin_invite_uat") {
    throw new Error(`Refusing unexpected db=${db}`);
  }
  console.log(`CONFIRMED_LOCAL_DB host=${host} port=${parsed.port || "5432"} db=${db}`);
}

async function main() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260816214500_add_admin_invite_setup_token/migration.sql"
  );
  assert.match(schema, /model AdminInviteSetupToken/);
  assert.match(schema, /adminInviteSetupTokens\s+AdminInviteSetupToken/);
  assert.match(migration, /CREATE TABLE "AdminInviteSetupToken"/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  console.log("PASS A_schema_hashed_setup_token");

  const service = read("app/lib/admin/adminUsers.ts");
  const setup = read("app/lib/admin/adminInviteSetup.ts");
  const shared = read("app/lib/admin/adminInviteSetupShared.ts");
  const actions = read("app/lib/admin/adminInviteSetupActions.ts");
  const panel = read("app/components/admin/AdminUsersPanel.tsx");
  const page = read("app/admin-setup-password/page.tsx");
  const emailTpl = read("app/lib/email/adminInviteTemplate.ts");
  const send = read("app/lib/email/sendAdminInviteEmail.ts");
  const forgot = read("app/lib/auth/actions.ts");
  const otp = read("app/lib/auth/otp.ts");
  const passwordLib = read("app/lib/auth/password.ts");
  const robots = read("app/robots.ts");
  const pkg = read("package.json");

  assert.match(pkg, /qa:admin-invite-setup/);
  assert.match(setup, /randomBytes\(32\)/);
  assert.match(shared, /createHash\(["']sha256["']\)/);
  assert.match(shared, /ADMIN_INVITE_SETUP_TTL_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/);
  assert.match(service, /mintAdminInviteSetupToken/);
  assert.match(service, /sendAdminInviteEmail/);
  assert.match(service, /inviteMethod:\s*["']opaque_setup_link["']/);
  assert.doesNotMatch(service, /issueEmailOtp/);
  assert.doesNotMatch(service, /OtpPurpose\.PASSWORD_RESET/);
  assert.doesNotMatch(service, /kind:\s*["']admin_invite["']/);
  assert.doesNotMatch(service, /temporaryPassword|plainTextPassword|generateOtpCode/);
  console.log("PASS A_C_invite_creates_setup_link_no_temp_password_no_otp");

  assert.doesNotMatch(page, /setup code|verification code|OTP/i);
  assert.match(page, /Create New Password/);
  assert.match(page, /Confirm Password/);
  assert.match(page, /completeAdminPasswordSetupAction/);
  assert.match(page, /hiddenFields=\{\{\s*token:\s*rawToken/);
  console.log("PASS B_D_no_numeric_code_opens_password_form");

  assert.equal(ADMIN_INVITE_SETUP_TTL_MS, 30 * 60 * 1000);
  const issued = new Date("2026-08-16T12:00:00.000Z");
  const expiresAt = adminInviteSetupExpiresAt(issued);
  assert.equal(expiresAt.getTime(), issued.getTime() + ADMIN_INVITE_SETUP_TTL_MS);
  const at29m59s = new Date(issued.getTime() + 29 * 60 * 1000 + 59 * 1000);
  const at30m00s = new Date(issued.getTime() + 30 * 60 * 1000);
  assert.equal(
    isAdminInviteSetupLive({ expiresAt, consumedAt: null, now: at29m59s }),
    true
  );
  assert.equal(
    isAdminInviteSetupLive({ expiresAt, consumedAt: null, now: at30m00s }),
    false
  );
  console.log("PASS E_F_exact_30_minute_expiry_helper");

  assert.match(setup, /completeAdminInvitePasswordSetupInDb/);
  assert.match(setup, /consumedAt:\s*now/);
  assert.match(actions, /validateAdminPassword/);
  assert.match(actions, /redirect\(["']\/signin\?reset=1["']\)/);
  console.log("PASS G_consume_on_successful_setup");

  assert.match(setup, /ADMIN_INVITE_INVALID_MESSAGE/);
  assert.equal(
    ADMIN_INVITE_INVALID_MESSAGE,
    "This password setup link is invalid or has expired."
  );
  assert.match(page, /ADMIN_INVITE_INVALID_MESSAGE/);
  console.log("PASS H_I_generic_invalid_message");

  assert.match(service, /resendAdminInviteSetup/);
  assert.match(service, /mintAdminInviteSetupToken\(target\.id\)/);
  assert.match(setup, /consumedAt:\s*null[\s\S]*consumedAt:\s*now/);
  assert.match(panel, /Resend setup link/);
  assert.doesNotMatch(service.slice(service.indexOf("resendAdminInviteSetup")), /user\.create/);
  console.log("PASS J_K_L_M_resend_fresh_link_same_account");

  assert.match(service, /already_active_admin/);
  assert.match(
    service.slice(service.indexOf("resendAdminInviteSetup")),
    /This admin already has a password/
  );
  assert.match(service, /customer_collision/);
  console.log("PASS N_O_active_not_reset_customer_not_promoted");

  assert.match(forgot, /forgotPasswordAction/);
  assert.match(forgot, /verifyResetOtpAction/);
  assert.match(forgot, /resetPasswordAction/);
  assert.match(forgot, /kind:\s*["']password_reset["']/);
  assert.doesNotMatch(
    forgot.slice(
      forgot.indexOf("forgotPasswordAction"),
      forgot.indexOf("forgotPasswordAction") + 1600
    ),
    /adminInviteSetup|mintAdminInviteSetupToken/
  );
  assert.match(otp, /OTP_TTL_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/);
  console.log("PASS P_forgot_password_unchanged");

  assert.doesNotMatch(service, /console\.(?:log|info|warn|error)\([^\)]*(?:rawToken|setupUrl)/);
  assert.doesNotMatch(setup, /console\.(?:log|info|warn)\(/);
  assert.doesNotMatch(service, /metadata:[\s\S]{0,200}rawToken/);
  assert.doesNotMatch(setup, /metadata:[\s\S]{0,200}rawToken/);
  assert.doesNotMatch(panel, /rawToken|tokenHash/);
  assert.doesNotMatch(page, /tokenHash/);
  assert.doesNotMatch(send, /console\.log\([^\)]*setupUrl/);
  console.log("PASS Q_raw_token_never_logged_or_audited");

  assert.match(actions, /validateAdminPassword/);
  assert.match(passwordLib, /ADMIN_PASSWORD_MIN_LENGTH = 10/);
  assert.equal(validateAdminPassword("abcdef").ok, false);
  console.log("PASS R_admin_password_rules_unchanged");

  assert.match(emailTpl, /You have been invited as a .* administrator/);
  assert.match(emailTpl, /Use the secure link below to create your password/);
  assert.match(emailTpl, /This link expires in 30 minutes/);
  assert.match(
    emailTpl,
    /If the link expires, contact the administrator to resend the setup link/
  );
  assert.doesNotMatch(emailTpl, /temporary password|setup code|OTP/i);
  assert.match(send, /channel:\s*["']security["']/);
  assert.match(robots, /\/admin-setup-password/);
  assert.match(setup, /\/admin-setup-password/);
  console.log("PASS email_and_public_setup_route");

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required for isolated Admin invite QA");
  assertLocalAdminInviteDb(url);

  const {
    mintAdminInviteSetupToken,
    peekAdminInviteSetupToken,
    completeAdminInvitePasswordSetupInDb,
    buildAdminInviteSetupUrl,
  } = await import("../app/lib/admin/adminInviteSetup");

  const prisma = new PrismaClient();
  const stamp = randomBytes(4).toString("hex");
  const createdIds: string[] = [];

  try {
    const invited = await prisma.user.create({
      data: {
        name: "QA Invited Admin",
        email: `qa.admin.invite.${stamp}@example.com`,
        role: Role.ADMIN,
        passwordHash: null,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    createdIds.push(invited.id);

    const issuedAt = new Date("2026-08-16T15:00:00.000Z");
    const minted = await mintAdminInviteSetupToken(invited.id, issuedAt);
    assert.equal(typeof minted.rawToken, "string");
    assert.ok(minted.rawToken.length >= 32);
    assert.notEqual(minted.rawToken, hashAdminInviteSetupToken(minted.rawToken));
    assert.equal(
      minted.expiresAt.getTime(),
      issuedAt.getTime() + ADMIN_INVITE_SETUP_TTL_MS
    );
    const stored = await prisma.adminInviteSetupToken.findUniqueOrThrow({
      where: { id: minted.tokenId },
    });
    assert.equal(stored.tokenHash, hashAdminInviteSetupToken(minted.rawToken));
    assert.equal(stored.tokenHash.includes(minted.rawToken), false);
    const setupUrl = buildAdminInviteSetupUrl(minted.rawToken);
    assert.match(setupUrl, /\/admin-setup-password\?token=/);
    console.log("PASS A_runtime_mint_stores_hash_only");

    const peekOk = await peekAdminInviteSetupToken(
      minted.rawToken,
      new Date(issuedAt.getTime() + 29 * 60 * 1000 + 59 * 1000)
    );
    assert.equal(peekOk.ok, true);
    console.log("PASS E_runtime_29m59s_valid");

    const peekExpired = await peekAdminInviteSetupToken(
      minted.rawToken,
      new Date(issuedAt.getTime() + 30 * 60 * 1000)
    );
    assert.equal(peekExpired.ok, false);
    if (!peekExpired.ok) {
      assert.equal(peekExpired.error, ADMIN_INVITE_INVALID_MESSAGE);
    }
    console.log("PASS F_runtime_30m00s_expired");

    const peekInvalid = await peekAdminInviteSetupToken("not-a-real-token");
    assert.equal(peekInvalid.ok, false);
    if (!peekInvalid.ok) {
      assert.equal(peekInvalid.error, ADMIN_INVITE_INVALID_MESSAGE);
    }
    console.log("PASS I_runtime_invalid_link_generic");

    const passwordHash = await hashPassword("AdminQa!23456");
    const completed = await completeAdminInvitePasswordSetupInDb({
      rawToken: minted.rawToken,
      passwordHash,
      now: new Date(issuedAt.getTime() + 60 * 1000),
    });
    assert.equal(completed.ok, true);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: invited.id },
      select: { passwordHash: true },
    });
    assert.ok(after.passwordHash);
    const reused = await completeAdminInvitePasswordSetupInDb({
      rawToken: minted.rawToken,
      passwordHash,
      now: new Date(issuedAt.getTime() + 90 * 1000),
    });
    assert.equal(reused.ok, false);
    const peekUsed = await peekAdminInviteSetupToken(minted.rawToken);
    assert.equal(peekUsed.ok, false);
    const audits = await prisma.auditLog.findMany({
      where: { targetId: invited.id, action: "admin.password_setup_completed" },
    });
    assert.ok(audits.length >= 1);
    assert.equal(JSON.stringify(audits).includes(minted.rawToken), false);
    console.log("PASS G_H_Q_runtime_consume_and_reuse_rejected");

    const invited2 = await prisma.user.create({
      data: {
        name: "QA Resend Admin",
        email: `qa.admin.resend.${stamp}@example.com`,
        role: Role.ADMIN,
        passwordHash: null,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    createdIds.push(invited2.id);
    const first = await mintAdminInviteSetupToken(invited2.id);
    const secondIssued = new Date();
    const second = await mintAdminInviteSetupToken(invited2.id, secondIssued);
    const oldPeek = await peekAdminInviteSetupToken(first.rawToken);
    assert.equal(oldPeek.ok, false);
    const newPeek = await peekAdminInviteSetupToken(second.rawToken);
    assert.equal(newPeek.ok, true);
    assert.equal(
      second.expiresAt.getTime(),
      secondIssued.getTime() + ADMIN_INVITE_SETUP_TTL_MS
    );
    const adminCount = await prisma.user.count({
      where: { email: { in: [
        `qa.admin.invite.${stamp}@example.com`,
        `qa.admin.resend.${stamp}@example.com`,
      ] } },
    });
    assert.equal(adminCount, 2);
    const tokenRows = await prisma.adminInviteSetupToken.count({
      where: { userId: invited2.id },
    });
    assert.equal(tokenRows, 2);
    console.log("PASS J_K_L_M_runtime_resend_invalidates_old_same_user");

    const active = await prisma.user.create({
      data: {
        name: "QA Active Admin",
        email: `qa.admin.active.${stamp}@example.com`,
        role: Role.ADMIN,
        passwordHash: await hashPassword("ActiveAdm!n12"),
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    createdIds.push(active.id);
    const activeMint = await mintAdminInviteSetupToken(active.id);
    const activePeek = await peekAdminInviteSetupToken(activeMint.rawToken);
    assert.equal(activePeek.ok, false);
    const activeAfter = await prisma.user.findUniqueOrThrow({
      where: { id: active.id },
      select: { passwordHash: true },
    });
    assert.ok(activeAfter.passwordHash);
    console.log("PASS N_runtime_active_admin_not_reset_by_setup_token");

    const customer = await prisma.user.create({
      data: {
        name: "QA Customer",
        email: `qa.admin.cust.${stamp}@example.com`,
        role: Role.CUSTOMER,
        passwordHash: await hashPassword("customer-pass"),
        emailVerifiedAt: new Date(),
      },
      select: { id: true, role: true },
    });
    createdIds.push(customer.id);
    const custMint = await mintAdminInviteSetupToken(customer.id);
    const custPeek = await peekAdminInviteSetupToken(custMint.rawToken);
    assert.equal(custPeek.ok, false);
    const custAfter = await prisma.user.findUniqueOrThrow({
      where: { id: customer.id },
      select: { role: true },
    });
    assert.equal(custAfter.role, Role.CUSTOMER);
    console.log("PASS O_runtime_customer_not_promoted");
  } finally {
    if (createdIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
    }
    await prisma.$disconnect();
  }

  console.log("ALL_QA_PASSED=admin-invite-setup");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
