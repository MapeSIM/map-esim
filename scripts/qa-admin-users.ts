/**
 * Offline QA for Admin Users invite / deactivate / reactivate.
 * Does not mutate production DB or send email.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  const {
    resolveAdminAccountStatus,
    isActiveAdminForProtection,
  } = await import("../app/lib/auth/adminAccessShared");

  assert.equal(
    resolveAdminAccountStatus({
      role: "ADMIN",
      deletedAt: new Date(),
      adminDisabledAt: null,
      passwordHash: "x",
      emailVerifiedAt: new Date(),
    }),
    "DELETED"
  );
  assert.equal(
    resolveAdminAccountStatus({
      role: "ADMIN",
      deletedAt: null,
      adminDisabledAt: new Date(),
      passwordHash: null,
      emailVerifiedAt: new Date(),
    }),
    "DISABLED"
  );
  assert.equal(
    resolveAdminAccountStatus({
      role: "ADMIN",
      deletedAt: null,
      adminDisabledAt: null,
      passwordHash: null,
      emailVerifiedAt: new Date(),
    }),
    "INVITED"
  );
  assert.equal(
    resolveAdminAccountStatus({
      role: "ADMIN",
      deletedAt: null,
      adminDisabledAt: null,
      passwordHash: "hash",
      emailVerifiedAt: new Date(),
    }),
    "ACTIVE"
  );
  assert.equal(
    isActiveAdminForProtection({
      role: "ADMIN",
      deletedAt: null,
      adminDisabledAt: null,
      passwordHash: null,
      emailVerifiedAt: new Date(),
    }),
    false,
    "INVITED must not count toward last-active protection"
  );
  assert.equal(
    isActiveAdminForProtection({
      role: "ADMIN",
      deletedAt: null,
      adminDisabledAt: null,
      passwordHash: "hash",
      emailVerifiedAt: new Date(),
    }),
    true
  );
  console.log("PASS status_resolution_and_last_active_definition");

  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260815140000_add_admin_user_management_fields/migration.sql"
  );
  assert.match(schema, /adminDisabledAt\s+DateTime\?/);
  assert.match(schema, /adminStatusVersion\s+Int\s+@default\(0\)/);
  assert.doesNotMatch(schema, /adminDisabledByAdminId/);
  assert.match(migration, /ADD COLUMN "adminDisabledAt"/);
  assert.match(migration, /ADD COLUMN "adminStatusVersion"/);
  assert.match(migration, /User_adminDisabledAt_idx/);
  assert.doesNotMatch(migration, /DROP |DELETE FROM/i);
  console.log("PASS schema_and_migration_additive");

  const service = read("app/lib/admin/adminUsers.ts");
  assert.match(service, /admin\.invited/);
  assert.match(service, /admin\.deactivated/);
  assert.match(service, /admin\.reactivated/);
  assert.match(service, /admin\.management_action_blocked/);
  assert.match(service, /customer_collision/);
  assert.match(service, /already_active_admin/);
  assert.match(service, /duplicate_invitation/);
  assert.match(service, /disabled_use_reactivate/);
  assert.match(service, /self_deactivate/);
  assert.match(service, /last_active_admin/);
  assert.match(service, /stale_version/);
  assert.match(service, /passwordHash:\s*null/);
  assert.match(service, /emailVerifiedAt:\s*now/);
  assert.match(service, /OtpPurpose\.PASSWORD_RESET/);
  assert.match(service, /sendOtpEmail/);
  assert.match(service, /kind:\s*["']admin_invite["']/);
  assert.match(service, /inviteMethod:\s*["']password_reset_otp["']/);
  assert.doesNotMatch(
    service.slice(
      service.indexOf("sendOtpEmail"),
      service.indexOf("sendOtpEmail") + 280
    ),
    /kind:\s*["']password_reset["']/
  );
  assert.match(service, /disableActiveAdminUnderLock/);
  assert.match(service, /acquireAdminStatusXactLock/);
  assert.match(service, /invitation email could not be sent|Forgot Password/);
  assert.match(service, /adminStatusVersion: expectedVersion/);
  assert.match(service, /session\.deleteMany/);
  assert.match(service, /credentialsChangedAt/);
  assert.match(service, /adminSessionVersion/);
  assert.match(service, /tx\.auditLog\.create/);
  assert.doesNotMatch(service, /temporaryPassword|plainTextPassword|INITIAL_ADMIN_PASSWORD/);
  assert.doesNotMatch(service, /console\.(log|info|debug)\([^\)]*issued\.code/);
  console.log("PASS invite_deactivate_reactivate_rules");

  const lockSrc = read("app/lib/admin/adminUsersLock.ts");
  assert.match(lockSrc, /pg_advisory_xact_lock\(774201,\s*1001\)/);
  assert.match(lockSrc, /ADMIN_STATUS_LOCK_CLASS\s*=\s*774201/);
  assert.match(lockSrc, /ADMIN_STATUS_LOCK_OBJ\s*=\s*1001/);
  assert.match(lockSrc, /countActiveAdminsTx|activeAdminWhere/);
  assert.match(lockSrc, /activeCount <= 1/);
  assert.match(lockSrc, /passwordHash:\s*\{\s*not:\s*null\s*\}/);
  assert.match(lockSrc, /emailVerifiedAt:\s*\{\s*not:\s*null\s*\}/);
  assert.match(lockSrc, /runDisableActiveAdminTransaction/);
  console.log("PASS advisory_lock_last_active_mechanism");

  const forgot = read("app/lib/auth/actions.ts");
  assert.match(forgot, /forgotPasswordAction/);
  assert.match(forgot, /OtpPurpose\.PASSWORD_RESET|PASSWORD_RESET/);
  assert.match(forgot, /kind:\s*["']password_reset["']/);
  assert.doesNotMatch(forgot, /kind:\s*["']admin_invite["']/);
  assert.doesNotMatch(
    forgot.slice(forgot.indexOf("forgotPasswordAction"), forgot.indexOf("forgotPasswordAction") + 1200),
    /passwordHash/
  );
  console.log("PASS invited_passwordHash_null_can_use_forgot_password");

  const otpTemplate = read("app/lib/email/otpTemplate.ts");
  assert.match(otpTemplate, /admin_invite/);
  assert.match(otpTemplate, /Set up your \$\{BRAND_NAME\} Admin account|Set up your .* Admin account/);
  assert.match(otpTemplate, /Admin account setup code/);
  assert.match(
    otpTemplate,
    /You have been invited to become a \$\{BRAND_NAME\} administrator/
  );
  assert.match(
    otpTemplate,
    /set your password and activate your administrator account/
  );
  assert.match(
    otpTemplate,
    /If you were not expecting this administrator invitation/
  );
  assert.match(otpTemplate, /Password reset code/);
  assert.match(otpTemplate, /Your \$\{BRAND_NAME\} password reset code/);
  assert.doesNotMatch(
    otpTemplate.slice(
      otpTemplate.indexOf('kind === "admin_invite"'),
      otpTemplate.indexOf('kind === "password_reset"')
    ),
    /requested a password reset|Password reset code/
  );
  console.log("PASS admin_invite_email_wording_distinct_from_password_reset");

  // Runtime template render checks (no SMTP).
  const {
    otpEmailSubject,
    renderOtpEmailHtml,
    renderOtpEmailText,
  } = await import("../app/lib/email/otpTemplate");
  const inviteHtml = renderOtpEmailHtml({
    kind: "admin_invite",
    code: "123456",
    recipientEmail: "invitee@example.com",
  });
  const inviteText = renderOtpEmailText({
    kind: "admin_invite",
    code: "123456",
    recipientEmail: "invitee@example.com",
  });
  const inviteSubject = otpEmailSubject("admin_invite");
  assert.match(inviteSubject, /Set up your MAP eSIM Admin account/);
  assert.match(inviteHtml, /Admin account setup code/);
  assert.match(inviteHtml, /You have been invited to become a MAP eSIM administrator/);
  assert.match(inviteHtml, /This code expires in 10 minutes/);
  assert.match(
    inviteHtml,
    /If you were not expecting this administrator invitation/
  );
  assert.doesNotMatch(inviteHtml, /Password reset code/);
  assert.doesNotMatch(inviteHtml, /requested a password reset/i);
  assert.doesNotMatch(inviteText, /Password reset code/);
  assert.match(inviteText, /Admin account setup code/);

  const resetHtml = renderOtpEmailHtml({
    kind: "password_reset",
    code: "654321",
    recipientEmail: "user@example.com",
  });
  const resetSubject = otpEmailSubject("password_reset");
  assert.match(resetSubject, /password reset code/i);
  assert.match(resetHtml, /Password reset code/);
  assert.match(resetHtml, /reset your MAP eSIM password/);
  assert.doesNotMatch(resetHtml, /Admin account setup code/);
  assert.doesNotMatch(resetHtml, /invited to become a MAP eSIM administrator/);
  console.log("PASS otp_template_admin_invite_vs_password_reset_render");

  // Success audits are created inside the same $transaction as the mutation.
  assert.match(service, /\$transaction\(async \(tx\) => \{/);
  assert.match(service, /tx\.user\.create\([\s\S]*ADMIN_INVITED_AUDIT|action: ADMIN_INVITED_AUDIT/);
  assert.match(service, /tx\.auditLog\.create\([\s\S]*ADMIN_INVITED_AUDIT|ADMIN_DEACTIVATED_AUDIT|ADMIN_REACTIVATED_AUDIT/);
  assert.match(service, /disableActiveAdminUnderLock[\s\S]*tx\.auditLog\.create/);
  assert.match(service, /acquireAdminStatusXactLock[\s\S]*tx\.auditLog\.create/);
  // Do not use fire-and-forget writeAuditLog for success mutations.
  assert.doesNotMatch(
    service,
    /writeAuditLog\(\{\s*actorUserId:[\s\S]{0,80}action: ADMIN_INVITED_AUDIT/
  );
  assert.doesNotMatch(
    service,
    /writeAuditLog\(\{\s*actorUserId:[\s\S]{0,80}action: ADMIN_DEACTIVATED_AUDIT/
  );
  console.log("PASS success_audit_atomicity_structure");

  const authSrc = read("auth.ts");
  assert.match(authSrc, /adminDisabledAt/);
  assert.match(
    authSrc,
    /user\.role === ["']ADMIN["'] && user\.adminDisabledAt/
  );
  assert.match(
    authSrc,
    /dbUser\.role === ["']ADMIN["'] && dbUser\.adminDisabledAt/
  );
  assert.match(authSrc, /adminSessionVersion:\s*\{\s*increment:\s*1\s*\}/);
  console.log("PASS auth_signin_and_jwt_deny_disabled");

  const sessionSrc = read("app/lib/auth/session.ts");
  assert.match(sessionSrc, /adminDisabledAt/);
  assert.match(sessionSrc, /requireRole/);
  console.log("PASS requireRole_rechecks_disabled");

  const gate = read("app/lib/auth/adminAccess.ts");
  assert.match(gate, /findActiveAdminActor/);
  assert.match(gate, /adminDisabledAt/);
  console.log("PASS central_active_admin_gate");

  const page = read("app/admin/admin-users/page.tsx");
  const panel = read("app/components/admin/AdminUsersPanel.tsx");
  const nav = read("app/components/admin/AdminNav.tsx");
  assert.match(nav, /\/admin\/admin-users/);
  assert.match(nav, /Admin Users/);
  assert.match(page, /InviteAdminForm/);
  assert.match(page, /AdminUsersTable/);
  assert.match(panel, /Invite Admin/);
  assert.match(panel, /ACTIVE|INVITED|DISABLED/);
  assert.match(panel, /Deactivate/);
  assert.match(panel, /Reactivate/);
  assert.match(panel, /Invitation pending/);
  assert.match(panel, /isSelf/);
  assert.doesNotMatch(panel, /passwordHash|resetToken|adminSessionVersion/);
  assert.doesNotMatch(page, /passwordHash|resetToken|adminSessionVersion/);
  assert.match(page, /never\s+shown/i);
  console.log("PASS admin_users_ui");

  const actions = read("app/lib/admin/adminUsersActions.ts");
  assert.match(actions, /inviteAdminAction/);
  assert.match(actions, /deactivateAdminAction/);
  assert.match(actions, /reactivateAdminAction/);
  assert.match(actions, /requireRole\(["']ADMIN["']\)/);
  console.log("PASS server_actions_admin_only");

  const seed = read("scripts/seed-admin.ts");
  assert.match(seed, /admin\.bootstrap_seeded/);
  assert.match(seed, /CUSTOMER account\. Manual review required/);
  assert.doesNotMatch(seed, /admin\.invited/);
  console.log("PASS admin_seed_remains_bootstrap_only");

  const pkg = read("package.json");
  assert.match(pkg, /"qa:admin-users"/);
  assert.match(pkg, /"qa:admin-users-concurrency"/);
  assert.doesNotMatch(service, /walletAccount|vesim|simpaisa|safepay|calculateRetail/i);
  assert.doesNotMatch(actions, /walletAccount|vesim|simpaisa|safepay/i);
  console.log("PASS package_script_and_scope");

  // Structural: password-set path → ACTIVE (invite sets verified; reset sets hash)
  const resetActions = read("app/lib/auth/actions.ts");
  assert.match(resetActions, /passwordHash/);
  assert.match(resetActions, /credentialsChangedAt/);
  assert.match(resetActions, /admin\.password_reset_completed|validateAdminPassword/);
  // Invite sets emailVerifiedAt; reset sets passwordHash → ACTIVE.
  assert.match(service, /emailVerifiedAt:\s*now/);
  assert.match(service, /passwordHash:\s*null/);
  console.log("PASS password_set_path_compatible_with_active");

  // API routes that use auth() must also check adminDisabledAt (not JWT alone).
  const providerWalletApi = read("app/api/admin/provider-wallet/route.ts");
  const usageApi = read("app/api/admin/orders/[orderId]/usage/route.ts");
  const iccidApi = read("app/api/admin/orders/[orderId]/iccid/route.ts");
  for (const [label, src] of [
    ["provider-wallet", providerWalletApi],
    ["usage", usageApi],
    ["iccid", iccidApi],
  ] as const) {
    assert.match(src, /auth\(\)/);
    assert.match(src, /adminDisabledAt/, `${label} must DB-check adminDisabledAt`);
  }
  console.log("PASS admin_api_auth_plus_db_disabled_check");

  console.log("ALL PASS qa-admin-users");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
