/**
 * Offline QA for Super Admin team access / permission guards.
 * Does not mutate production DB or send email.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_PERMISSIONS,
  grantsFromPermissionSelection,
  hasAdminPermission,
  parseAdminTeamRole,
  resolveAdminPermissions,
} from "../app/lib/admin/adminPermissions";
import {
  canAccessAdminPath,
  requiredAdminAccessForPath,
} from "../app/lib/admin/adminPageAccess";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(parseAdminTeamRole("SUPPORT"), "SUPPORT");
  assert.equal(parseAdminTeamRole("nope"), null);

  const superPerms = resolveAdminPermissions({ teamRole: "SUPER_ADMIN" });
  assert.equal(superPerms.size, ADMIN_PERMISSIONS.length);
  assert.equal(hasAdminPermission(superPerms, "MANAGE_ADMINS"), true);

  const support = resolveAdminPermissions({ teamRole: "SUPPORT" });
  assert.equal(hasAdminPermission(support, "CUSTOMERS_VIEW"), true);
  assert.equal(hasAdminPermission(support, "ORDERS_VIEW"), true);
  assert.equal(hasAdminPermission(support, "SUPPORT_EMAILS"), true);
  assert.equal(hasAdminPermission(support, "MANAGE_ADMINS"), false);
  assert.equal(hasAdminPermission(support, "REVENUE_VIEW"), false);
  assert.equal(hasAdminPermission(support, "EMAIL_CAMPAIGNS"), false);

  const operations = resolveAdminPermissions({ teamRole: "OPERATIONS" });
  assert.equal(hasAdminPermission(operations, "ORDERS_MANAGE"), true);
  assert.equal(hasAdminPermission(operations, "ESIM_FULFILLMENT"), true);
  assert.equal(hasAdminPermission(operations, "INSTALL_ISSUES"), true);
  assert.equal(hasAdminPermission(operations, "CUSTOMERS_VIEW"), false);

  const finance = resolveAdminPermissions({ teamRole: "FINANCE" });
  assert.equal(hasAdminPermission(finance, "REVENUE_VIEW"), true);
  assert.equal(hasAdminPermission(finance, "TRANSACTIONS_VIEW"), true);
  assert.equal(hasAdminPermission(finance, "REFUNDS_MANAGE"), true);
  assert.equal(hasAdminPermission(finance, "ORDERS_VIEW"), false);

  const marketing = resolveAdminPermissions({ teamRole: "MARKETING" });
  assert.equal(hasAdminPermission(marketing, "EMAIL_CAMPAIGNS"), true);
  assert.equal(hasAdminPermission(marketing, "CUSTOMER_ANNOUNCEMENTS"), true);
  assert.equal(hasAdminPermission(marketing, "SUPPORT_EMAILS"), false);

  const granted = resolveAdminPermissions({
    teamRole: "SUPPORT",
    grants: [{ permission: "REVENUE_VIEW", effect: "GRANT" }],
  });
  assert.equal(hasAdminPermission(granted, "REVENUE_VIEW"), true);
  assert.equal(hasAdminPermission(granted, "MANAGE_ADMINS"), false);

  const denied = resolveAdminPermissions({
    teamRole: "SUPPORT",
    grants: [{ permission: "CUSTOMERS_VIEW", effect: "DENY" }],
  });
  assert.equal(hasAdminPermission(denied, "CUSTOMERS_VIEW"), false);

  const cannotGrantManage = resolveAdminPermissions({
    teamRole: "FINANCE",
    grants: [{ permission: "MANAGE_ADMINS", effect: "GRANT" }],
  });
  assert.equal(hasAdminPermission(cannotGrantManage, "MANAGE_ADMINS"), false);

  const unknownRole = resolveAdminPermissions({ teamRole: "CUSTOMER" });
  assert.equal(unknownRole.size, 0);

  const selection = grantsFromPermissionSelection({
    teamRole: "SUPPORT",
    selected: ["CUSTOMERS_VIEW", "REVENUE_VIEW"],
  });
  assert.ok(selection.some((g) => g.permission === "REVENUE_VIEW" && g.effect === "GRANT"));
  assert.ok(selection.some((g) => g.permission === "ORDERS_VIEW" && g.effect === "DENY"));
  assert.ok(!selection.some((g) => g.permission === "MANAGE_ADMINS"));
  console.log("PASS permission_resolver_role_defaults_and_overrides");

  assert.equal(requiredAdminAccessForPath("/admin").mode, "any-admin");
  assert.deepEqual(
    requiredAdminAccessForPath("/admin/admin-users").mode === "any-of"
      ? requiredAdminAccessForPath("/admin/admin-users")
      : null,
    { mode: "any-of", permissions: ["MANAGE_ADMINS"] }
  );
  assert.equal(canAccessAdminPath(support, "/admin"), true);
  assert.equal(canAccessAdminPath(support, "/admin/customers"), true);
  assert.equal(canAccessAdminPath(support, "/admin/emails"), true);
  assert.equal(canAccessAdminPath(support, "/admin/orders"), true);
  assert.equal(canAccessAdminPath(support, "/admin/admin-users"), false);
  assert.equal(canAccessAdminPath(support, "/admin/revenue"), false);
  assert.equal(canAccessAdminPath(support, "/admin/email-campaigns"), false);
  assert.equal(canAccessAdminPath(operations, "/admin/operations"), true);
  assert.equal(canAccessAdminPath(operations, "/admin/customers/x/esim/assign"), true);
  assert.equal(canAccessAdminPath(finance, "/admin/revenue"), true);
  assert.equal(canAccessAdminPath(finance, "/admin/refund-requests"), true);
  assert.equal(canAccessAdminPath(marketing, "/admin/email-campaigns"), true);
  assert.equal(canAccessAdminPath(superPerms, "/admin/settings"), true);
  assert.equal(canAccessAdminPath(support, "/admin/unknown-future"), false);
  console.log("PASS path_guards_are_permission_based");

  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260913120000_add_admin_team_access/migration.sql"
  );
  assert.match(schema, /enum AdminTeamRole/);
  assert.match(schema, /enum AdminPermission/);
  assert.match(schema, /adminTeamRole\s+AdminTeamRole\s+@default\(SUPER_ADMIN\)/);
  assert.match(schema, /lastAdminLoginAt\s+DateTime\?/);
  assert.match(schema, /model AdminPermissionGrant/);
  const roleEnum = schema.match(/enum Role \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(roleEnum, /CUSTOMER/);
  assert.match(roleEnum, /ADMIN/);
  assert.match(roleEnum, /PARTNER/);
  assert.doesNotMatch(
    roleEnum,
    /SUPPORT|OPERATIONS|FINANCE|MARKETING|SUPER_ADMIN/
  );
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  assert.match(migration, /ADD COLUMN "adminTeamRole"/);
  assert.match(migration, /ADD COLUMN "lastAdminLoginAt"/);
  assert.match(migration, /CREATE TABLE "AdminPermissionGrant"/);
  console.log("PASS schema_additive_keeps_role_admin");

  const users = read("app/lib/admin/adminUsers.ts");
  assert.match(users, /requireAdminManager/);
  assert.match(users, /export async function listAdminUsers[\s\S]*requireAdminManager/);
  assert.match(users, /MANAGE_ADMINS/);
  assert.match(users, /assignAdminTeamRole/);
  assert.match(users, /updateAdminPermissions/);
  assert.match(users, /admin\.team_role_changed/);
  assert.match(users, /admin\.permissions_changed/);
  assert.match(users, /last Super Admin/);
  assert.match(users, /self_role_change/);
  assert.match(users, /adminTeamRole: teamRole/);
  assert.doesNotMatch(users, /walletAccount|vesim|simpaisa|safepay/i);
  console.log("PASS admin_users_super_admin_only_management");

  const lock = read("app/lib/admin/adminUsersLock.ts");
  assert.match(lock, /countActiveSuperAdminsTx|activeSuperAdminWhere/);
  assert.match(lock, /AdminTeamRole\.SUPER_ADMIN/);
  console.log("PASS last_super_admin_protection");

  const authSrc = read("auth.ts");
  assert.match(authSrc, /lastAdminLoginAt/);
  assert.match(authSrc, /admin\.signed_in/);
  assert.match(
    authSrc,
    /user\.role === ["']ADMIN["'] && user\.adminDisabledAt/
  );
  console.log("PASS last_login_and_disabled_cannot_signin");

  const sessionSrc = read("app/lib/auth/session.ts");
  assert.match(sessionSrc, /adminDisabledAt/);
  assert.match(sessionSrc, /role === "ADMIN"/);
  console.log("PASS disabled_admins_lose_portal_access");

  const layout = read("app/admin/layout.tsx");
  const nav = read("app/components/admin/AdminNav.tsx");
  const access = read("app/lib/admin/adminPermissionAccess.ts");
  const middleware = read("middleware.ts");
  assert.match(layout, /loadAdminAccess/);
  assert.match(layout, /canAccessAdminPath/);
  assert.match(layout, /x-map-pathname/);
  assert.match(layout, /MANAGE_ADMINS/);
  assert.doesNotMatch(layout, /x-map-pathname"\) \|\| "\/admin"/);
  assert.match(nav, /canAccessAdminPath/);
  assert.match(access, /assertAdminPermission/);
  assert.match(access, /requireRole\("ADMIN"\)/);
  assert.match(middleware, /x-map-pathname/);
  console.log("PASS layout_nav_permission_guards");

  const actions = read("app/lib/admin/emailCampaignActions.ts");
  const walletCredit = read("app/lib/wallet/adminCreditActions.ts");
  const fulfillment = read("app/lib/esim/adminWalletPurchaseActions.ts");
  const customerDetail = read("app/admin/customers/[id]/page.tsx");
  const orderDetail = read("app/admin/orders/[id]/page.tsx");
  assert.match(actions, /EMAIL_CAMPAIGNS/);
  assert.match(walletCredit, /WALLET_ADJUST/);
  assert.match(fulfillment, /ESIM_FULFILLMENT/);
  assert.match(fulfillment, /prepareWalletEsimPurchase/);
  assert.match(customerDetail, /canFulfill/);
  assert.match(customerDetail, /canAdjustWallet/);
  assert.match(orderDetail, /canRevealIccid/);
  assert.match(orderDetail, /canFulfill && detail.addDataEligible/);
  console.log("PASS mutation_guards_without_changing_purchase_engine");

  const pkg = read("package.json");
  assert.match(pkg, /"qa:admin-team-access"/);
  console.log("PASS package_script");

  console.log("ALL PASS qa-admin-team-access");
}

main();
