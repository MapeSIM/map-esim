/**
 * Offline QA for ADMIN session versioning across multi-domain hosts.
 * Version bumps on credential change / disable / lock — NOT routine sign-in
 * (so mapesim.com / partneresim.com / mapesim.store cookies stay independent).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function main() {
  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  assert.match(schema, /adminSessionVersion\s+Int\s+@default\(0\)/);
  const migration = readFileSync(
    join(
      root,
      "prisma/migrations/20260804120000_add_admin_session_version/migration.sql"
    ),
    "utf8"
  );
  assert.match(migration, /adminSessionVersion/);
  assert.match(migration, /DEFAULT 0/);
  console.log("PASS adminSessionVersion_default_0");

  const authSrc = readFileSync(join(root, "auth.ts"), "utf8");
  const authorizeBlock = authSrc.slice(
    authSrc.indexOf("async authorize"),
    authSrc.indexOf("Google({")
  );
  // Routine credentials sign-in must NOT rotate adminSessionVersion.
  assert.ok(
    !/adminSessionVersion:\s*\{\s*increment:\s*1\s*\}/.test(authorizeBlock),
    "authorize must not increment adminSessionVersion on sign-in"
  );
  console.log("PASS admin_signin_does_not_increment");

  // Refresh path still validates generation; revoke paths bump version.
  assert.match(authSrc, /priorAdminSessionVersion/);
  assert.ok(
    !/adminSessionVersion:\s*\{\s*increment/.test(
      authSrc.slice(authSrc.indexOf("async jwt"))
    )
  );
  console.log("PASS routine_jwt_does_not_increment");

  assert.match(
    authSrc,
    /priorAdminSessionVersion !== dbUser\.adminSessionVersion/
  );
  assert.match(authSrc, /setAdminSessionEndedNotice/);
  console.log("PASS admin_jwt_version_mismatch_rejected");

  const adminUsers = readFileSync(
    join(root, "app/lib/admin/adminUsers.ts"),
    "utf8"
  );
  assert.match(adminUsers, /adminSessionVersion:\s*\{\s*increment:\s*1\s*\}/);
  const adminLock = readFileSync(
    join(root, "app/lib/admin/adminUsersLock.ts"),
    "utf8"
  );
  assert.match(adminLock, /adminSessionVersion:\s*\{\s*increment:\s*1\s*\}/);
  console.log("PASS revoke_paths_still_increment");

  const sessionCb = authSrc.slice(authSrc.indexOf("async session"));
  assert.ok(!/adminSessionVersion/.test(sessionCb));
  const typesSrc = readFileSync(join(root, "types/next-auth.d.ts"), "utf8");
  assert.match(typesSrc, /interface JWT/);
  assert.match(typesSrc, /adminSessionVersion\?: number/);
  const sessionInterface =
    typesSrc.match(/declare module "next-auth" \{[\s\S]*?^}/m)?.[0] ?? "";
  assert.ok(
    !/adminSessionVersion/.test(sessionInterface),
    "adminSessionVersion must not appear on Session"
  );
  console.log("PASS version_not_on_client_session");

  assert.match(authSrc, /deletedAt/);
  assert.match(authSrc, /return invalidate\(\)/);
  console.log("PASS deleted_admin_remains_blocked");

  assert.ok(!/console\.(log|info|debug)\([^\)]*token/i.test(authSrc));
  assert.ok(!/console\.(log|info|debug)\([^\)]*password/i.test(authSrc));
  assert.ok(!/console\.(log|info|debug)\([^\)]*JWT/i.test(authSrc));
  console.log("PASS no_token_password_logging");

  console.log("OK qa-admin-single-session");
}

main();
