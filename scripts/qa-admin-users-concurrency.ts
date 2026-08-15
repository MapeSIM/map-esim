/**
 * Real concurrent last-ACTIVE-admin protection test against isolated local Postgres.
 * Does NOT touch Production / db.prisma.io.
 *
 * Proves: with exactly 2 ACTIVE admins, concurrent disables of different targets
 * cannot leave 0 ACTIVE admins (advisory xact lock + count-after-lock).
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, Role } from "@prisma/client";
import {
  activeAdminWhere,
  countActiveAdminsTx,
  runDisableActiveAdminTransaction,
} from "../app/lib/admin/adminUsersLock";

const PG_BIN = "C:\\Program Files\\PostgreSQL\\17\\bin";
const PORT = 55434;
const ROLE = "map_esim_test";
const DB = "map_esim_admin_concurrency";
const ROOT = join(
  process.env.TEMP || process.env.TMP || ".",
  "map-esim-pg-admin-concurrency"
);
const DATA = join(ROOT, "data");
const LOG = join(ROOT, "postgres.log");

function pg(exe: string, args: string[], opts?: { timeoutMs?: number }) {
  const r = spawnSync(join(PG_BIN, exe), args, {
    encoding: "utf8",
    env: process.env,
    timeout: opts?.timeoutMs,
  });
  if (r.error) {
    throw new Error(`${exe} error: ${r.error.message}`);
  }
  if (r.status !== 0) {
    throw new Error(
      `${exe} failed (${r.status}): ${(r.stderr || r.stdout || "").slice(0, 500)}`
    );
  }
  return r;
}

function sleepMs(ms: number) {
  spawnSync(
    process.execPath,
    ["-e", `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${ms})`],
    { encoding: "utf8" }
  );
}

function waitForReady(port: number, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    const r = spawnSync(
      join(PG_BIN, "pg_isready.exe"),
      ["-h", "127.0.0.1", "-p", String(port), "-U", ROLE],
      { encoding: "utf8" }
    );
    if (r.status === 0) return;
    sleepMs(500);
  }
  throw new Error(`Postgres not ready on 127.0.0.1:${port}`);
}

function stopCluster() {
  if (!existsSync(DATA)) return;
  spawnSync(join(PG_BIN, "pg_ctl.exe"), ["-D", DATA, "-m", "fast", "stop"], {
    encoding: "utf8",
    timeout: 30_000,
  });
}

function startClusterDetached() {
  // Windows: `pg_ctl start` via spawnSync can hang even after the server is ready.
  // Detach and poll readiness instead.
  const child = spawn(
    join(PG_BIN, "pg_ctl.exe"),
    ["-D", DATA, "-l", LOG, "-o", `-p ${PORT} -h 127.0.0.1`, "start"],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }
  );
  child.unref();
  waitForReady(PORT);
}

async function main() {
  console.log("STEP check_pg_bin");
  if (!existsSync(join(PG_BIN, "initdb.exe"))) {
    console.error("SKIP qa-admin-users-concurrency: PostgreSQL 17 bin not found");
    process.exit(0);
  }

  console.log("STEP stop_old_cluster");
  stopCluster();
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  console.log("STEP initdb", ROOT);
  pg("initdb.exe", [
    "-D",
    DATA,
    "-U",
    ROLE,
    "-A",
    "trust",
    "--locale=C",
    "--encoding=UTF8",
  ]);
  writeFileSync(
    join(DATA, "postgresql.conf"),
    `listen_addresses = '127.0.0.1'\nport = ${PORT}\nmax_connections = 40\n`
  );
  console.log("STEP pg_start");
  startClusterDetached();
  console.log("STEP createdb");
  pg("createdb.exe", ["-h", "127.0.0.1", "-p", String(PORT), "-U", ROLE, DB]);

  const url = `postgresql://${ROLE}@127.0.0.1:${PORT}/${DB}`;
  const host = new URL(url).hostname;
  assert.ok(host === "127.0.0.1" || host === "localhost", "host must be local");
  assert.doesNotMatch(url, /prisma|neon|supabase|vercel|amazonaws/i);
  console.log("STEP migrate_deploy", `127.0.0.1:${PORT}/${DB}`);

  const migrate = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy"],
    {
      cwd: join(__dirname, ".."),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: url },
      shell: true,
      timeout: 180_000,
    }
  );
  console.log("STEP migrate_status", migrate.status);
  if (migrate.status !== 0) {
    throw new Error(
      `migrate deploy failed: ${(migrate.stderr || migrate.stdout || "").slice(0, 800)}`
    );
  }

  console.log("STEP prisma_client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    console.log("STEP seed_admins");
    const now = new Date();
    const hash = "x".repeat(60); // non-null sentinel; not used for login in this test
    const a = await prisma.user.create({
      data: {
        name: "Admin A",
        email: "admin-a-concurrency@example.com",
        role: Role.ADMIN,
        passwordHash: hash,
        emailVerifiedAt: now,
        adminStatusVersion: 0,
      },
      select: { id: true, adminStatusVersion: true },
    });
    const b = await prisma.user.create({
      data: {
        name: "Admin B",
        email: "admin-b-concurrency@example.com",
        role: Role.ADMIN,
        passwordHash: hash,
        emailVerifiedAt: now,
        adminStatusVersion: 0,
      },
      select: { id: true, adminStatusVersion: true },
    });
    // INVITED must not count toward ACTIVE.
    await prisma.user.create({
      data: {
        name: "Admin Invited",
        email: "admin-invited-concurrency@example.com",
        role: Role.ADMIN,
        passwordHash: null,
        emailVerifiedAt: now,
        adminStatusVersion: 0,
      },
    });

    const before = await countActiveAdminsTx(prisma);
    assert.equal(before, 2, "expected exactly 2 ACTIVE admins before race");
    console.log("STEP race_start");

    const [r1, r2] = await Promise.all([
      runDisableActiveAdminTransaction(prisma, {
        actorId: a.id,
        targetId: b.id,
        expectedVersion: b.adminStatusVersion,
      }),
      runDisableActiveAdminTransaction(prisma, {
        actorId: b.id,
        targetId: a.id,
        expectedVersion: a.adminStatusVersion,
      }),
    ]);
    console.log("STEP race_done", r1, r2);

    const okCount = [r1, r2].filter((x) => x === "ok").length;
    const failCount = [r1, r2].filter((x) => x !== "ok").length;
    assert.equal(okCount, 1, `expected exactly one success, got ${r1}/${r2}`);
    assert.equal(failCount, 1, `expected exactly one failure, got ${r1}/${r2}`);
    assert.ok(
      [r1, r2].includes("last_active") || [r1, r2].includes("cas_conflict"),
      `failure should be last_active or cas_conflict, got ${r1}/${r2}`
    );

    const after = await prisma.user.count({ where: activeAdminWhere() });
    assert.equal(after, 1, "must leave exactly 1 ACTIVE admin");
    assert.ok(after >= 1, "ZERO ACTIVE admins is impossible");

    console.log("PASS concurrent_two_active_admin_deactivation");
    console.log(
      `RESULTS ok=${okCount} fail=${failCount} remaining_active=${after}`
    );
    console.log("ALL PASS qa-admin-users-concurrency");
  } finally {
    await prisma.$disconnect();
    stopCluster();
  }
}

main().catch((err) => {
  console.error(err);
  try {
    stopCluster();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
