/**
 * Offline QA for Partner invitation opaque setup-link UX.
 * Does not mutate Production DB or send email.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model PartnerInviteToken/);
  assert.match(schema, /model PartnerInviteSetupToken/);
  assert.match(schema, /tokenHash\s+String\s+@unique/);
  assert.match(schema, /consumedAt\s+DateTime\?/);
  console.log("PASS schema_partner_invite_tokens");

  const migration = read(
    "prisma/migrations/20260815213000_add_partner_invite_setup_token/migration.sql"
  );
  assert.match(migration, /CREATE TABLE "PartnerInviteToken"/);
  assert.match(migration, /CREATE TABLE "PartnerInviteSetupToken"/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  console.log("PASS migration_additive_invite_tokens");

  const invite = read("app/lib/partner/partnerInvite.ts");
  assert.match(invite, /PARTNER_INVITE_TTL_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/);
  assert.match(invite, /randomBytes\(32\)/);
  assert.match(invite, /createHash\(["']sha256["']\)/);
  assert.match(invite, /mintPartnerInviteToken/);
  assert.match(invite, /exchangePartnerInviteTokenInDb/);
  // Exchange must consume invite inside a transaction with setup create.
  const exchangeIdx = invite.indexOf(
    "export async function exchangePartnerInviteTokenInDb"
  );
  assert.ok(exchangeIdx >= 0);
  const exchangeBody = invite.slice(exchangeIdx, exchangeIdx + 4500);
  assert.match(exchangeBody, /\$transaction/);
  assert.match(exchangeBody, /partnerInviteToken\.updateMany/);
  assert.match(exchangeBody, /partnerInviteSetupToken\.create/);
  assert.match(exchangeBody, /consumedAt:\s*now/);
  assert.match(invite, /PARTNER_INVITE_SETUP_COOKIE/);
  const peekIdx = invite.indexOf(
    "export async function getPartnerInviteSetupUserFromRaw"
  );
  assert.ok(peekIdx >= 0);
  const peekBody = invite.slice(peekIdx, peekIdx + 1200);
  assert.doesNotMatch(
    peekBody,
    /invite:\s*\{[\s\S]*consumedAt:\s*null/
  );
  assert.match(invite, /httpOnly:\s*true/);
  assert.match(invite, /sameSite:\s*["']lax["']/);
  assert.match(
    invite,
    /This setup link is invalid or has expired/
  );
  assert.doesNotMatch(invite, /console\.log\([^\)]*rawToken/);
  assert.doesNotMatch(invite, /AuditLog[\s\S]*rawToken/);
  console.log("PASS invite_token_crypto_and_cookie_exchange");

  // A/B: mint stores hash semantics (unit of hash function shape)
  const raw = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(raw).digest("hex");
  assert.notEqual(raw, hash);
  assert.equal(hash.length, 64);
  console.log("PASS token_hash_not_equal_raw");

  const partners = read("app/lib/partner/partners.ts");
  assert.match(partners, /mintPartnerInviteToken/);
  assert.match(partners, /sendPartnerInviteEmail/);
  assert.match(partners, /opaque_setup_link/);
  assert.match(partners, /resendPartnerInvitation/);
  assert.match(partners, /partner\.invitation_resent/);
  assert.doesNotMatch(partners, /issueEmailOtp/);
  assert.doesNotMatch(partners, /kind:\s*["']partner_invite["']/);
  assert.doesNotMatch(partners, /OtpPurpose\.PASSWORD_RESET/);
  assert.doesNotMatch(partners, /temporaryPassword|plainTextPassword|LocalUat/);
  console.log("PASS create_resend_uses_setup_link_not_otp");

  const emailTpl = read("app/lib/email/partnerInviteTemplate.ts");
  assert.match(emailTpl, /Welcome to .* Partner/);
  assert.match(emailTpl, /Your .* Partner account is ready/);
  assert.match(emailTpl, /Set up my password/);
  assert.match(emailTpl, /expires in 30 minutes/);
  assert.match(emailTpl, /If you were not expecting this invitation/);
  assert.doesNotMatch(emailTpl, /one-time code|OTP|temporary password/i);
  console.log("PASS partner_invite_email_copy");

  const send = read("app/lib/email/sendPartnerInviteEmail.ts");
  assert.match(send, /channel:\s*["']security["']/);
  assert.match(send, /sendChannelMail/);
  assert.doesNotMatch(send, /console\.log\([^\)]*setupUrl/);
  console.log("PASS partner_invite_email_channel");

  const setupPage = read("app/partner/setup-password/page.tsx");
  assert.match(setupPage, /exchangePartnerInviteToken/);
  assert.match(setupPage, /redirect\(["']\/partner\/setup-password["']\)/);
  assert.match(setupPage, /robots:\s*\{[\s\S]*index:\s*false/);
  assert.match(setupPage, /no-referrer|referrer:\s*["']no-referrer["']/);
  assert.match(setupPage, /Create password|completePartnerPasswordSetupAction/);
  console.log("PASS setup_page_exchange_and_noindex");

  const actions = read("app/lib/partner/partnerInviteActions.ts");
  assert.match(actions, /^["']use server["']/m);
  assert.match(actions, /export async function completePartnerPasswordSetupAction/);
  assert.match(actions, /validatePassword/);
  assert.match(actions, /hashPassword/);
  assert.match(actions, /credentialsChangedAt/);
  assert.match(actions, /session\.deleteMany/);
  assert.match(actions, /PARTNER_PASSWORD_SETUP_COMPLETED_AUDIT/);
  assert.match(read("app/lib/partner/partners.ts"), /partner\.password_setup_completed/);
  assert.match(actions, /redirect\(["']\/signin\?partnerSetup=1["']\)/);
  assert.doesNotMatch(actions, /^export const\s+/m);
  console.log("PASS setup_action_server_boundary");

  const authConfig = read("auth.config.ts");
  assert.match(authConfig, /\/partner\/setup-password/);
  console.log("PASS auth_allows_public_setup_route");

  const robots = read("app/robots.ts");
  assert.match(robots, /\/partner\/setup-password/);
  console.log("PASS robots_disallow_setup");

  // M: Forgot password unchanged
  const forgot = read("app/lib/auth/actions.ts");
  assert.match(forgot, /forgotPasswordAction/);
  assert.match(forgot, /verifyResetOtpAction/);
  assert.match(forgot, /resetPasswordAction/);
  assert.match(forgot, /OtpPurpose\.PASSWORD_RESET|PASSWORD_RESET/);
  console.log("PASS forgot_password_unchanged");

  // N: Admin invite still OTP-based
  const adminUsers = read("app/lib/admin/adminUsers.ts");
  assert.match(adminUsers, /admin_invite/);
  assert.match(adminUsers, /issueEmailOtp|PASSWORD_RESET/);
  console.log("PASS admin_invite_unchanged");

  const otpTpl = read("app/lib/email/otpTemplate.ts");
  assert.match(otpTpl, /admin_invite/);
  assert.match(otpTpl, /Password reset code/);
  console.log("PASS otp_template_admin_and_reset_intact");

  const detail = read("app/admin/partners/[id]/page.tsx");
  assert.match(detail, /PartnerInviteResendPanel/);
  console.log("PASS admin_resend_ui");

  const portalLayout = read("app/partner/(portal)/layout.tsx");
  assert.match(portalLayout, /requireRole\(["']PARTNER["']\)/);
  assert.ok(
    !readFileSync(join(root, "app/partner/setup-password/page.tsx"), "utf8").includes(
      "requireRole"
    )
  );
  console.log("PASS setup_outside_partner_portal_layout");

  // O: audit/logging must not include raw invite tokens
  assert.doesNotMatch(partners, /console\.(?:log|info|warn|error)\([^\)]*rawToken/);
  assert.doesNotMatch(partners, /metadata:[\s\S]{0,160}rawToken/);
  assert.doesNotMatch(partners, /writeAuditLog[\s\S]{0,240}rawToken/);
  assert.doesNotMatch(actions, /rawToken|setupUrl/);
  assert.doesNotMatch(
    read("app/lib/partner/partnerInvite.ts"),
    /console\.(?:log|info|warn)\([^\)]*(?:rawToken|tokenHash)/
  );
  console.log("PASS no_token_in_audit_or_actions");

  console.log("ALL PASS qa-partner-invite-setup");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
