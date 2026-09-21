/**
 * Offline QA: Admin Audit Logs are a permanent, strictly read-only security record.
 * Asserts view/search/filter/pagination only — no edit/delete/clear mutations.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_AUDIT_ACTOR_FILTERS,
  adminAuditActorFilterLabel,
  buildAdminAuditLogsHref,
  normalizeAdminAuditSearchQuery,
  parseAdminAuditActorFilter,
  parseAdminAuditLogsPage,
} from "../app/lib/admin/auditLogsShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(existsSync(join(root, "app/admin/audit-logs/page.tsx")));
  assert.ok(existsSync(join(root, "app/lib/admin/auditLogs.ts")));
  assert.ok(existsSync(join(root, "app/lib/admin/auditLogsShared.ts")));

  const page = read("app/admin/audit-logs/page.tsx");
  const service = read("app/lib/admin/auditLogs.ts");
  const shared = read("app/lib/admin/auditLogsShared.ts");
  const nav = read("app/components/admin/AdminNav.tsx");
  const access = read("app/lib/admin/adminPageAccess.ts");
  const writeAudit = read("app/lib/auth/audit.ts");
  const pkg = read("package.json");

  assert.match(page, /requireActiveAdminForAuditLogs/);
  assert.match(page, /getAdminAuditLogsPage/);
  assert.match(page, /Permanent security record/);
  assert.match(page, /Strictly read-only/);
  assert.match(page, /data-audit-logs-readonly/);
  assert.match(page, /data-audit-logs-filters/);
  assert.match(page, /method="get"/);
  assert.match(page, /name="q"/);
  assert.match(page, /name="actor"/);
  assert.match(page, /Audit log pagination|Previous|Next/);
  assert.match(page, /cannot be edited, deleted,\s*or cleared/i);
  assert.match(nav, /href: "\/admin\/audit-logs"/);
  assert.match(access, /\/admin\/audit-logs/);
  assert.match(access, /AUDIT_LOGS/);
  console.log("PASS view_search_filter_pagination_ui");

  assert.equal(parseAdminAuditActorFilter("ADMIN"), "admin");
  assert.equal(parseAdminAuditActorFilter("nope"), "all");
  assert.equal(parseAdminAuditLogsPage("3"), 3);
  assert.equal(parseAdminAuditLogsPage("0"), 1);
  assert.equal(normalizeAdminAuditSearchQuery("  ab  "), "ab");
  assert.equal(adminAuditActorFilterLabel("system"), "System / unknown");
  assert.deepEqual([...ADMIN_AUDIT_ACTOR_FILTERS], [
    "all",
    "admin",
    "customer",
    "system",
  ]);
  assert.equal(
    buildAdminAuditLogsHref({ q: "wallet", actor: "admin", page: 2 }),
    "/admin/audit-logs?q=wallet&actor=admin&page=2"
  );
  assert.equal(buildAdminAuditLogsHref({}), "/admin/audit-logs");
  console.log("PASS shared_query_helpers");

  assert.match(service, /import "server-only"/);
  assert.match(service, /requireAdminPermission\("AUDIT_LOGS"\)/);
  assert.match(service, /prisma\.auditLog\.count/);
  assert.match(service, /prisma\.auditLog\.findMany/);
  assert.match(service, /Read-only: findMany \+ count only/);
  assert.doesNotMatch(service, /auditLog\.(create|update|delete|deleteMany|upsert)/);
  assert.doesNotMatch(service, /prisma\.\$executeRaw|prisma\.\$queryRawUnsafe/);
  assert.doesNotMatch(service, /writeAuditLog/);
  assert.doesNotMatch(page, /"use server"/);
  assert.doesNotMatch(page, /formAction|action=\{/);
  assert.doesNotMatch(
    page,
    /Delete log|Edit log|Clear logs|Clear all|Purge|Remove event|Erase audit/i
  );
  assert.doesNotMatch(page, /auditLog\.(create|update|delete)/);
  assert.doesNotMatch(shared, /prisma|writeAuditLog|"use server"/);
  // Filter reset control is allowed; clearing audit records is not.
  assert.match(page, /Clear filters/);
  assert.doesNotMatch(page, /Clear logs/i);
  console.log("PASS no_mutation_actions_view_only");

  assert.match(writeAudit, /export async function writeAuditLog/);
  assert.match(writeAudit, /prisma\.auditLog\.create/);
  assert.doesNotMatch(writeAudit, /auditLog\.delete/);
  console.log("PASS audit_creation_unchanged_elsewhere");

  assert.match(pkg, /qa:admin-audit-logs/);
  console.log("PASS package_script");

  console.log("ALL_QA_PASSED=admin-audit-logs");
}

main();
