/**
 * End-to-end QA: no-OTP alternate eSIM delivery email.
 * Offline source/unit checks, then isolated PostgreSQL 17 on 127.0.0.1:55441.
 * Never Production, Prisma Cloud, localhost:5432, SMTP, VeSIM, or payment.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  OrderFundingSource,
  OrderStatus,
  PrismaClient,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import {
  ALTERNATE_DELIVERY_EMAIL_COPY,
  ALTERNATE_DELIVERY_EMAIL_MAX_LENGTH,
  ALTERNATE_DELIVERY_EMAIL_MESSAGES,
  EsimDeliveryEmailError,
  alternateDeliveryEmailLockClaim,
  assertMatchingAlternateDeliveryEmails,
  parseAlternateDeliveryEmailInput,
  resolveFrozenInstallDeliveryEmail,
  snapshotOrderAlternateDeliveryEmail,
} from "../app/lib/esim/esimDeliveryEmail";

const root = join(__dirname, "..");
const PG_BIN = "C:\\Program Files\\PostgreSQL\\17\\bin";
const PORT = 55441;
const ROLE = "map_esim_test";
const DB = "map_esim_alt_delivery";
const CLUSTER_ROOT = join(
  process.env.TEMP || process.env.TMP || ".",
  "map-esim-pg-alt-delivery-email"
);
const DATA = join(CLUSTER_ROOT, "data");
const LOG = join(CLUSTER_ROOT, "postgres.log");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function lit(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

function pg(exe: string, args: string[], opts?: { timeoutMs?: number }) {
  const r = spawnSync(join(PG_BIN, exe), args, {
    encoding: "utf8",
    env: process.env,
    timeout: opts?.timeoutMs,
  });
  if (r.error) throw new Error(`${exe} error: ${r.error.message}`);
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
  const child = spawn(
    join(PG_BIN, "pg_ctl.exe"),
    ["-D", DATA, "-l", LOG, "-w", "start"],
    { detached: true, stdio: "ignore", windowsHide: true }
  );
  child.unref();
}

function assertLocalUrl(url: string) {
  const parsed = new URL(url);
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.port, String(PORT));
  assert.doesNotMatch(url, /prisma|neon|supabase|vercel|amazonaws|5432/i);
}

function offlineChecks() {
  const confirmForm = read("app/components/account/WalletPurchaseConfirmForm.tsx");
  const deliveryUi = read(
    "app/components/account/CheckoutDeliveryEmailSection.tsx"
  );
  const actions = read("app/lib/esim/walletPurchaseActions.ts");
  const mutations = read("app/lib/esim/esimDeliveryEmailMutations.ts");
  const helper = read("app/lib/esim/esimDeliveryEmail.ts");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const apply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const install = read("app/lib/esim/esimPurchaseInstallEmail.ts");
  const persist = read("app/lib/orders/persistAssignedOrder.ts");
  const resend = read("app/lib/admin/reconciliationEmailResend.ts");
  const localFinalize = read(
    "app/lib/admin/reconciliationLocalFinalization.ts"
  );
  const credit = read("app/lib/vesim/creditCheckout.ts");
  const billing = read("app/lib/email/sendBillingEmail.ts");
  const security = read("app/lib/email/sendSecurityNoticeEmail.ts");
  const guest = read("app/checkout/CheckoutClient.tsx");
  const adminConfirm = read("app/components/admin/AdminWalletBuyConfirmForm.tsx");
  const partnerBuy = read("app/components/partner/PartnerStorefrontBuy.tsx");
  const orders = read("app/lib/orders/customerOrders.ts");
  const pkg = read("package.json");

  assert.match(confirmForm, /CheckoutDeliveryEmailSection/);
  assert.match(confirmForm, /Signed-in account email/);
  assert.match(confirmForm, /purchaseBlocked/);
  assert.match(helper, lit(ALTERNATE_DELIVERY_EMAIL_COPY.option));
  assert.match(helper, lit(ALTERNATE_DELIVERY_EMAIL_COPY.deliveryEmail));
  assert.match(helper, lit(ALTERNATE_DELIVERY_EMAIL_COPY.confirmDeliveryEmail));
  assert.match(helper, lit(ALTERNATE_DELIVERY_EMAIL_COPY.attestation));
  assert.match(helper, lit(ALTERNATE_DELIVERY_EMAIL_COPY.unverified));
  assert.match(deliveryUi, /ALTERNATE_DELIVERY_EMAIL_COPY\.option/);
  assert.match(deliveryUi, /ALTERNATE_DELIVERY_EMAIL_COPY\.deliveryEmail/);
  assert.match(deliveryUi, /ALTERNATE_DELIVERY_EMAIL_COPY\.confirmDeliveryEmail/);
  assert.match(deliveryUi, /ALTERNATE_DELIVERY_EMAIL_COPY\.attestation/);
  assert.match(deliveryUi, /ALTERNATE_DELIVERY_EMAIL_COPY\.unverified/);
  assert.doesNotMatch(deliveryUi, /OTP|one-time|verification code|ownership/i);
  assert.match(deliveryUi, /min-w-0/);
  assert.match(actions, /saveWalletPurchaseAlternateDeliveryEmailAction/);
  assert.match(actions, /clearWalletPurchaseAlternateDeliveryEmailAction/);
  assert.match(actions, /void formData\.get\("deliveryEmail"\)/);
  assert.match(actions, /requireRole\("CUSTOMER"\)/);
  assert.match(mutations, /alternateDeliveryEmailLockedAt:\s*null/);
  assert.match(mutations, /alternateDeliveryEmailConfirmedAt/);
  assert.match(mutations, /Never mutates User\.email/);
  assert.doesNotMatch(mutations, /user\.update\(|prisma\.user\.update/);
  console.log("PASS ui_actions_no_otp_readonly_account");

  assert.doesNotMatch(guest, /Send eSIM details to a different email/);
  assert.doesNotMatch(adminConfirm, /Send eSIM details to a different email/);
  assert.doesNotMatch(partnerBuy, /Send eSIM details to a different email/);
  console.log("PASS no_alternate_ui_on_guest_partner_admin");

  assert.match(wallet, /alternateDeliveryEmailLockClaim/);
  assert.match(wallet, /snapshotOrderAlternateDeliveryEmail/);
  assert.match(apply, /alternateDeliveryEmailLockClaim/);
  assert.match(apply, /status: WalletEsimPurchaseStatus\.FUNDED/);
  assert.match(apply, /snapshotOrderAlternateDeliveryEmail/);
  assert.match(persist, /alternateDeliveryEmail/);
  assert.doesNotMatch(persist, /user\.email\s*=/);
  assert.match(localFinalize, /snapshotOrderAlternateDeliveryEmail\(fresh\)/);
  console.log("PASS lock_and_order_snapshot_wired");

  assert.match(install, /resolveFrozenInstallDeliveryEmail\(purchase\.order\)/);
  assert.match(resend, /resolveFrozenInstallDeliveryEmail\(row\.order\)/);
  assert.doesNotMatch(
    install,
    /purchase\.customer\.email|customer\.email/
  );
  assert.match(
    credit,
    /VESIM_PROVIDER_CUSTOMER_EMAIL = "orders@mapesim\.com"/
  );
  assert.match(orders, /userId:\s*id/);
  assert.doesNotMatch(billing, /alternateDeliveryEmail/);
  assert.doesNotMatch(security, /alternateDeliveryEmail/);
  assert.doesNotMatch(billing, /qrValue|activationCode|LPA:1\$/);
  assert.doesNotMatch(security, /qrValue|activationCode|LPA:1\$/);
  assert.doesNotMatch(helper, /qrValue|activationCode|LPA:1\$/);
  console.log("PASS recipient_matrix_source");

  assert.equal(
    parseAlternateDeliveryEmailInput("  Alt@Example.COM ").ok,
    true
  );
  const parsed = parseAlternateDeliveryEmailInput("  Alt@Example.COM ");
  assert.equal(parsed.ok && parsed.email, "alt@example.com");
  assert.equal(parseAlternateDeliveryEmailInput("not-an-email").ok, false);
  assert.equal(parseAlternateDeliveryEmailInput("foo\n@bar.com").ok, false);
  assert.equal(
    parseAlternateDeliveryEmailInput("a".repeat(255) + "@x.com").ok,
    false
  );
  assert.equal(
    assertMatchingAlternateDeliveryEmails("a@b.co", "a@b.co"),
    "a@b.co"
  );
  assert.throws(
    () => assertMatchingAlternateDeliveryEmails("a@b.co", "c@d.co"),
    (err: unknown) =>
      err instanceof EsimDeliveryEmailError && err.code === "EMAIL_MISMATCH"
  );
  assert.equal(
    snapshotOrderAlternateDeliveryEmail({
      alternateDeliveryEmail: "alt@example.com",
      alternateDeliveryEmailConfirmedAt: new Date("2026-08-19T00:00:00Z"),
    }),
    "alt@example.com"
  );
  assert.equal(
    snapshotOrderAlternateDeliveryEmail({
      alternateDeliveryEmail: "alt@example.com",
      alternateDeliveryEmailConfirmedAt: null,
    }),
    null
  );
  assert.equal(
    resolveFrozenInstallDeliveryEmail({
      alternateDeliveryEmail: "alt@example.com",
      customerEmail: "acct@example.com",
    }),
    "alt@example.com"
  );
  assert.equal(
    resolveFrozenInstallDeliveryEmail({
      alternateDeliveryEmail: null,
      customerEmail: "acct@example.com",
    }),
    "acct@example.com"
  );
  assert.equal(ALTERNATE_DELIVERY_EMAIL_MAX_LENGTH, 254);
  assert.match(pkg, /qa:esim-alternate-delivery-email"/);
  console.log("PASS unit_parse_snapshot_resolver");
}

async function dbChecks() {
  if (!existsSync(join(PG_BIN, "initdb.exe"))) {
    throw new Error("PostgreSQL 17 bin not found for isolated DB tests");
  }

  stopCluster();
  rmSync(CLUSTER_ROOT, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
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
  startClusterDetached();
  waitForReady(PORT);
  pg("createdb.exe", ["-h", "127.0.0.1", "-p", String(PORT), "-U", ROLE, DB]);

  const url = `postgresql://${ROLE}@127.0.0.1:${PORT}/${DB}?schema=public`;
  assertLocalUrl(url);
  process.env.DATABASE_URL = url;

  const migrate = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["prisma", "migrate", "deploy"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: url },
      shell: true,
      timeout: 180_000,
    }
  );
  if (migrate.status !== 0) {
    throw new Error(
      `migrate deploy failed: ${(migrate.stderr || migrate.stdout || "").slice(0, 800)}`
    );
  }

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const {
    saveWalletPurchaseAlternateDeliveryEmail,
    clearWalletPurchaseAlternateDeliveryEmail,
  } = await import("../app/lib/esim/esimDeliveryEmailMutations");
  const tag = Date.now().toString(36);

  async function makeCustomer(suffix: string, email?: string) {
    return prisma.user.create({
      data: {
        name: "Alt delivery QA",
        email: email ?? `alt-${tag}-${suffix}@example.test`,
        role: Role.CUSTOMER,
        passwordHash: "x",
      },
      select: { id: true, email: true },
    });
  }

  async function makePurchase(options: {
    customerId: string;
    key: string;
    status?: WalletEsimPurchaseStatus;
    adminUserId?: string | null;
  }) {
    return prisma.walletEsimPurchase.create({
      data: {
        customerUserId: options.customerId,
        adminUserId: options.adminUserId ?? null,
        offerId: "alt-offer",
        priceCents: 1000,
        walletAppliedCents: 1000,
        gatewayAmountCents: 0,
        idempotencyKey: `alt_${options.key}_${tag}`,
        status: options.status ?? WalletEsimPurchaseStatus.READY,
        fundingSource: OrderFundingSource.CUSTOMER_WALLET,
      },
      select: { id: true },
    });
  }

  try {
    const owner = await makeCustomer("owner", `owner-${tag}@example.test`);
    const other = await makeCustomer("other");
    const ready = await makePurchase({ customerId: owner.id, key: "ready" });

    await saveWalletPurchaseAlternateDeliveryEmail(
      {
        customerUserId: owner.id,
        purchaseId: ready.id,
        deliveryEmail: "  Friend@Example.COM ",
        confirmDeliveryEmail: "friend@example.com",
        attested: true,
      },
      prisma
    );
    let row = await prisma.walletEsimPurchase.findUniqueOrThrow({
      where: { id: ready.id },
    });
    assert.equal(row.alternateDeliveryEmail, "friend@example.com");
    assert.ok(row.alternateDeliveryEmailConfirmedAt);
    console.log("PASS db_save_normalizes_and_confirms");

    await saveWalletPurchaseAlternateDeliveryEmail(
      {
        customerUserId: owner.id,
        purchaseId: ready.id,
        deliveryEmail: "second@example.com",
        confirmDeliveryEmail: "second@example.com",
        attested: true,
      },
      prisma
    );
    row = await prisma.walletEsimPurchase.findUniqueOrThrow({
      where: { id: ready.id },
    });
    assert.equal(row.alternateDeliveryEmail, "second@example.com");
    console.log("PASS db_update_alternate");

    await clearWalletPurchaseAlternateDeliveryEmail(
      { customerUserId: owner.id, purchaseId: ready.id },
      prisma
    );
    row = await prisma.walletEsimPurchase.findUniqueOrThrow({
      where: { id: ready.id },
    });
    assert.equal(row.alternateDeliveryEmail, null);
    assert.equal(row.alternateDeliveryEmailConfirmedAt, null);
    console.log("PASS db_clear_atomic");

    await assert.rejects(
      () =>
        saveWalletPurchaseAlternateDeliveryEmail(
          {
            customerUserId: owner.id,
            purchaseId: ready.id,
            deliveryEmail: "a@example.com",
            confirmDeliveryEmail: "b@example.com",
            attested: true,
          },
          prisma
        ),
      (err: unknown) =>
        err instanceof EsimDeliveryEmailError && err.code === "EMAIL_MISMATCH"
    );
    await assert.rejects(
      () =>
        saveWalletPurchaseAlternateDeliveryEmail(
          {
            customerUserId: owner.id,
            purchaseId: ready.id,
            deliveryEmail: "a@example.com",
            confirmDeliveryEmail: "a@example.com",
            attested: false,
          },
          prisma
        ),
      (err: unknown) =>
        err instanceof EsimDeliveryEmailError &&
        err.code === "ATTESTATION_REQUIRED"
    );
    console.log("PASS db_mismatch_and_attestation_rejected");

    await saveWalletPurchaseAlternateDeliveryEmail(
      {
        customerUserId: owner.id,
        purchaseId: ready.id,
        deliveryEmail: owner.email,
        confirmDeliveryEmail: owner.email,
        attested: true,
      },
      prisma
    );
    row = await prisma.walletEsimPurchase.findUniqueOrThrow({
      where: { id: ready.id },
    });
    assert.equal(row.alternateDeliveryEmail, null);
    assert.equal(row.alternateDeliveryEmailConfirmedAt, null);
    console.log("PASS db_same_as_account_clears");

    for (const bad of [
      "not-an-email",
      "foo\n@bar.com",
      `x${"a".repeat(250)}@b.co`,
    ]) {
      await assert.rejects(
        () =>
          saveWalletPurchaseAlternateDeliveryEmail(
            {
              customerUserId: owner.id,
              purchaseId: ready.id,
              deliveryEmail: bad,
              confirmDeliveryEmail: bad,
              attested: true,
            },
            prisma
          ),
        (err: unknown) =>
          err instanceof EsimDeliveryEmailError && err.code === "INVALID_EMAIL"
      );
    }
    console.log("PASS db_invalid_control_overlength_rejected");

    await assert.rejects(
      () =>
        saveWalletPurchaseAlternateDeliveryEmail(
          {
            customerUserId: other.id,
            purchaseId: ready.id,
            deliveryEmail: "x@example.com",
            confirmDeliveryEmail: "x@example.com",
            attested: true,
          },
          prisma
        ),
      (err: unknown) =>
        err instanceof EsimDeliveryEmailError && err.code === "FORBIDDEN"
    );
    await assert.rejects(
      () =>
        saveWalletPurchaseAlternateDeliveryEmail(
          {
            customerUserId: owner.id,
            purchaseId: "missing_purchase_id_xxx",
            deliveryEmail: "x@example.com",
            confirmDeliveryEmail: "x@example.com",
            attested: true,
          },
          prisma
        ),
      (err: unknown) =>
        err instanceof EsimDeliveryEmailError && err.code === "FORBIDDEN"
    );
    console.log("PASS db_unauthorized_wrong_purchase_rejected");

    const completed = await makePurchase({
      customerId: owner.id,
      key: "done",
      status: WalletEsimPurchaseStatus.COMPLETED,
    });
    await assert.rejects(
      () =>
        saveWalletPurchaseAlternateDeliveryEmail(
          {
            customerUserId: owner.id,
            purchaseId: completed.id,
            deliveryEmail: "x@example.com",
            confirmDeliveryEmail: "x@example.com",
            attested: true,
          },
          prisma
        ),
      (err: unknown) =>
        err instanceof EsimDeliveryEmailError && err.code === "INVALID_STATE"
    );

    const locked = await makePurchase({
      customerId: owner.id,
      key: "locked",
    });
    await prisma.walletEsimPurchase.update({
      where: { id: locked.id },
      data: alternateDeliveryEmailLockClaim(),
    });
    await assert.rejects(
      () =>
        saveWalletPurchaseAlternateDeliveryEmail(
          {
            customerUserId: owner.id,
            purchaseId: locked.id,
            deliveryEmail: "x@example.com",
            confirmDeliveryEmail: "x@example.com",
            attested: true,
          },
          prisma
        ),
      (err: unknown) =>
        err instanceof EsimDeliveryEmailError && err.code === "LOCKED"
    );
    await assert.rejects(
      () =>
        clearWalletPurchaseAlternateDeliveryEmail(
          { customerUserId: owner.id, purchaseId: locked.id },
          prisma
        ),
      (err: unknown) =>
        err instanceof EsimDeliveryEmailError && err.code === "LOCKED"
    );
    console.log("PASS db_locked_and_non_editable_rejected");

    const race = await makePurchase({ customerId: owner.id, key: "race" });
    await prisma.walletEsimPurchase.update({
      where: { id: race.id },
      data: {
        alternateDeliveryEmail: "before@example.com",
        alternateDeliveryEmailConfirmedAt: new Date(),
      },
    });
    const [saveResult, lockResult] = await Promise.allSettled([
      saveWalletPurchaseAlternateDeliveryEmail(
        {
          customerUserId: owner.id,
          purchaseId: race.id,
          deliveryEmail: "after@example.com",
          confirmDeliveryEmail: "after@example.com",
          attested: true,
        },
        prisma
      ),
      prisma.walletEsimPurchase.updateMany({
        where: {
          id: race.id,
          status: WalletEsimPurchaseStatus.READY,
        },
        data: {
          status: WalletEsimPurchaseStatus.FUNDS_RESERVED,
          ...alternateDeliveryEmailLockClaim(),
        },
      }),
    ]);
    const frozen = await prisma.walletEsimPurchase.findUniqueOrThrow({
      where: { id: race.id },
    });
    assert.ok(frozen.alternateDeliveryEmailLockedAt);
    assert.equal(frozen.status, WalletEsimPurchaseStatus.FUNDS_RESERVED);
    if (saveResult.status === "fulfilled") {
      assert.equal(frozen.alternateDeliveryEmail, "after@example.com");
    } else {
      assert.equal(frozen.alternateDeliveryEmail, "before@example.com");
      assert.ok(
        saveResult.reason instanceof EsimDeliveryEmailError &&
          (saveResult.reason.code === "LOCKED" ||
            saveResult.reason.code === "INVALID_STATE")
      );
    }
    assert.equal(lockResult.status, "fulfilled");
    await assert.rejects(
      () =>
        saveWalletPurchaseAlternateDeliveryEmail(
          {
            customerUserId: owner.id,
            purchaseId: race.id,
            deliveryEmail: "late@example.com",
            confirmDeliveryEmail: "late@example.com",
            attested: true,
          },
          prisma
        ),
      (err: unknown) =>
        err instanceof EsimDeliveryEmailError && err.code === "LOCKED"
    );
    console.log("PASS db_concurrent_save_vs_fulfillment_lock");

    const gateway = await makePurchase({
      customerId: owner.id,
      key: "gw",
      status: WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
    });
    await saveWalletPurchaseAlternateDeliveryEmail(
      {
        customerUserId: owner.id,
        purchaseId: gateway.id,
        deliveryEmail: "gw-alt@example.com",
        confirmDeliveryEmail: "gw-alt@example.com",
        attested: true,
      },
      prisma
    );
    await prisma.walletEsimPurchase.updateMany({
      where: {
        id: gateway.id,
        status: WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
      },
      data: {
        status: WalletEsimPurchaseStatus.FUNDED,
        ...alternateDeliveryEmailLockClaim(),
      },
    });
    const gwRow = await prisma.walletEsimPurchase.findUniqueOrThrow({
      where: { id: gateway.id },
    });
    const order = await prisma.order.create({
      data: {
        providerOrderId: `po_wallet_${tag}`,
        userId: owner.id,
        customerEmail: owner.email,
        alternateDeliveryEmail: snapshotOrderAlternateDeliveryEmail(gwRow),
        offerId: "alt-offer",
        status: OrderStatus.COMPLETED,
        fundingSource: OrderFundingSource.CUSTOMER_WALLET,
      },
      select: {
        customerEmail: true,
        alternateDeliveryEmail: true,
        userId: true,
      },
    });
    assert.equal(order.userId, owner.id);
    assert.equal(order.customerEmail, owner.email);
    assert.equal(order.alternateDeliveryEmail, "gw-alt@example.com");
    assert.equal(
      resolveFrozenInstallDeliveryEmail(order),
      "gw-alt@example.com"
    );

    const defaultPurchase = await makePurchase({
      customerId: owner.id,
      key: "acct",
    });
    const defaultRow = await prisma.walletEsimPurchase.findUniqueOrThrow({
      where: { id: defaultPurchase.id },
    });
    const defaultOrder = await prisma.order.create({
      data: {
        providerOrderId: `po_acct_${tag}`,
        userId: owner.id,
        customerEmail: owner.email,
        alternateDeliveryEmail:
          snapshotOrderAlternateDeliveryEmail(defaultRow),
        offerId: "alt-offer",
        status: OrderStatus.COMPLETED,
        fundingSource: OrderFundingSource.CUSTOMER_WALLET,
      },
    });
    assert.equal(defaultOrder.alternateDeliveryEmail, null);
    assert.equal(
      resolveFrozenInstallDeliveryEmail(defaultOrder),
      owner.email
    );
    const liveUser = await prisma.user.findUniqueOrThrow({
      where: { id: owner.id },
    });
    assert.equal(liveUser.email, owner.email);
    console.log("PASS db_wallet_and_gateway_order_snapshot");

    assert.equal(
      ALTERNATE_DELIVERY_EMAIL_MESSAGES.locked.length > 8,
      true
    );
  } finally {
    await prisma.$disconnect();
    stopCluster();
    rmSync(CLUSTER_ROOT, { recursive: true, force: true });
  }
}

async function main() {
  offlineChecks();
  await dbChecks();
  console.log("OK qa-esim-alternate-delivery-email");
}

main().catch((err) => {
  console.error(err);
  try {
    stopCluster();
    rmSync(CLUSTER_ROOT, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(1);
});
