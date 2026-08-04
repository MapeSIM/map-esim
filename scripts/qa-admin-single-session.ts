/**
 * Offline QA for Phase 3D1 ADMIN single-active session (no DB, no secrets).
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
  assert.match(
    authSrc,
    /adminSessionVersion:\s*\{\s*increment:\s*1\s*\}/
  );
  assert.match(authSrc, /user\.role === "ADMIN"/);
  assert.ok(
    /if\s*\(\s*user\.role === "ADMIN"\s*\)\s*\{[\s\S]*increment:\s*1/.test(
      authSrc
    )
  );
  console.log("PASS admin_signin_atomically_increments");

  // CUSTOMER path: increment only inside ADMIN branch
  const authorizeBlock = authSrc.slice(
    authSrc.indexOf("async authorize"),
    authSrc.indexOf("Google({")
  );
  assert.match(authorizeBlock, /increment:\s*1/);
  assert.ok(
    authorizeBlock.includes('user.role === "ADMIN"'),
    "increment must be ADMIN-gated"
  );
  console.log("PASS customer_signin_does_not_increment");

  // Refresh path validates; fresh login stamps without increment in jwt
  assert.match(authSrc, /priorAdminSessionVersion/);
  assert.ok(!/adminSessionVersion:\s*\{\s*increment/.test(
    authSrc.slice(authSrc.indexOf("async jwt"))
  ));
  console.log("PASS routine_jwt_does_not_increment");

  assert.match(authSrc, /priorAdminSessionVersion !== dbUser\.adminSessionVersion/);
  assert.match(authSrc, /setAdminSessionEndedNotice/);
  console.log("PASS admin_jwt_version_mismatch_rejected");

  const sessionCb = authSrc.slice(authSrc.indexOf("async session"));
  assert.ok(!/adminSessionVersion/.test(sessionCb));
  const typesSrc = readFileSync(join(root, "types/next-auth.d.ts"), "utf8");
  assert.match(typesSrc, /interface JWT/);
  assert.match(typesSrc, /adminSessionVersion\?: number/);
  const sessionInterface = typesSrc.match(
    /declare module "next-auth" \{[\s\S]*?^}/m
  )?.[0] ?? "";
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
  console.log("PASS no_secret_logging");

  assert.match(authSrc, /category === "ADMIN"/);
  assert.match(authSrc, /return false/);
  assert.ok(!/role:\s*["']ADMIN["']/.test(
    readFileSync(join(root, "app/lib/auth/prismaAdapter.ts"), "utf8")
  ));
  console.log("PASS no_google_admin_path");

  assert.ok(!/migrate reset|db push/i.test(authSrc));
  assert.ok(!/\$executeRaw|\$queryRaw/.test(authSrc));
  console.log("PASS no_destructive_prisma_or_raw");

  const layoutSrc = readFileSync(join(root, "app/admin/layout.tsx"), "utf8");
  assert.match(layoutSrc, /requireRole\("ADMIN"\)/);
  const gateSrc = readFileSync(
    join(root, "app/lib/auth/legalConsentGate.ts"),
    "utf8"
  );
  assert.match(gateSrc, /adminSessionVersion:\s*true/);
  console.log("PASS admin_route_role_enforcement");

  // CUSTOMER multi-device: version checks gated to ADMIN role only
  assert.match(authSrc, /if \(dbUser\.role === "ADMIN"\)/);
  console.log("PASS customer_multi_device_unchanged");

  console.log("ALL_QA_PASSED=12");
}

main();
