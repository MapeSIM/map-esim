/**
 * Safe offline QA for Phase 8C-A ICCID persistence.
 * Uses mocked values only — no VeSIM, no real orders, no backfill apply.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const TEST_KEY = randomBytes(32).toString("hex");
const SAMPLE_ICCID = "8901234567890123456";
const SAMPLE_ICCID_B = "8901234567890123999";

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

type MockOrder = {
  id: string;
  providerOrderId: string;
  iccidHash: string | null;
  iccidEncrypted?: string | null;
  iccidLast4?: string | null;
  iccidCapturedAt?: Date | null;
};

function createMockDb(orders: MockOrder[]) {
  return {
    order: {
      async findUnique(args: {
        where: { providerOrderId?: string; id?: string };
        select?: Record<string, boolean>;
      }) {
        const row =
          orders.find(
            (o) =>
              (args.where.providerOrderId &&
                o.providerOrderId === args.where.providerOrderId) ||
              (args.where.id && o.id === args.where.id)
          ) || null;
        return row;
      },
      async findFirst(args: {
        where: { iccidHash?: string; NOT?: { id: string } };
        select?: Record<string, boolean>;
      }) {
        return (
          orders.find(
            (o) =>
              o.iccidHash === args.where.iccidHash &&
              o.id !== args.where.NOT?.id
          ) || null
        );
      },
      async updateMany(args: {
        where: {
          id: string;
          providerOrderId: string;
          iccidHash: null;
        };
        data: {
          iccidEncrypted: string;
          iccidHash: string;
          iccidLast4: string;
          iccidCapturedAt: Date;
        };
      }) {
        const row = orders.find(
          (o) =>
            o.id === args.where.id &&
            o.providerOrderId === args.where.providerOrderId &&
            o.iccidHash == null
        );
        if (!row) return { count: 0 };
        row.iccidEncrypted = args.data.iccidEncrypted;
        row.iccidHash = args.data.iccidHash;
        row.iccidLast4 = args.data.iccidLast4;
        row.iccidCapturedAt = args.data.iccidCapturedAt;
        return { count: 1 };
      },
    },
  };
}

async function main() {
  process.env.ICCID_ENCRYPTION_KEY = TEST_KEY;

  // Import cores (no server-only) so Node/tsx can exercise crypto + capture.
  const crypto = await import("../app/lib/orders/iccidCryptoCore");
  const { captureIccidForProviderOrder } = await import(
    "../app/lib/orders/iccidCaptureCore"
  );

  console.log("1) normalize + validate");
  assert.equal(crypto.normalizeIccid("8901-2345-6789-0123-456"), SAMPLE_ICCID);
  assert.equal(crypto.validateIccid(SAMPLE_ICCID), true);
  assert.equal(crypto.validateIccid("12345"), false);
  assert.equal(crypto.validateIccid(""), false);

  console.log("2) encrypt/decrypt round trip + non-deterministic ciphertext");
  const a = crypto.encryptIccid(SAMPLE_ICCID);
  const b = crypto.encryptIccid(SAMPLE_ICCID);
  assert.notEqual(a, b);
  assert.equal(crypto.decryptIccid(a), SAMPLE_ICCID);
  assert.equal(crypto.decryptIccid(b), SAMPLE_ICCID);
  assert.ok(!a.includes(SAMPLE_ICCID));
  assert.ok(!b.includes(SAMPLE_ICCID));

  console.log("3) same ICCID → same lookup hash");
  const h1 = crypto.hashIccid(SAMPLE_ICCID);
  const h2 = crypto.hashIccid(` ${SAMPLE_ICCID} `);
  assert.equal(h1, h2);
  assert.notEqual(h1, crypto.hashIccid(SAMPLE_ICCID_B));

  console.log("4) masked display last-4 only");
  const masked = crypto.maskIccidLast4(SAMPLE_ICCID);
  assert.ok(masked.endsWith("3456"));
  assert.ok(!masked.includes("890123456789"));
  assert.equal(crypto.formatIccidLast4Mask("3456"), "•••••••••••••3456");

  console.log("5) missing/invalid key fails closed");
  const saved = process.env.ICCID_ENCRYPTION_KEY;
  delete process.env.ICCID_ENCRYPTION_KEY;
  assert.equal(crypto.isIccidEncryptionConfigured(), false);
  assert.throws(() => crypto.encryptIccid(SAMPLE_ICCID), /ICCID crypto/);
  assert.throws(() => crypto.hashIccid(SAMPLE_ICCID), /ICCID crypto/);
  process.env.ICCID_ENCRYPTION_KEY = "not-a-valid-key";
  assert.equal(crypto.isIccidEncryptionConfigured(), false);
  process.env.ICCID_ENCRYPTION_KEY = saved;

  console.log("6) immediate persist / late fill / conflict / duplicate");
  const orders: MockOrder[] = [
    { id: "o1", providerOrderId: "po-1", iccidHash: null },
    { id: "o2", providerOrderId: "po-2", iccidHash: null },
  ];
  const db = createMockDb(orders) as never;

  const stored = await captureIccidForProviderOrder(
    { providerOrderId: "po-1", iccid: SAMPLE_ICCID },
    db
  );
  assert.equal(stored.status, "stored");
  assert.ok(orders[0].iccidEncrypted);
  assert.equal(orders[0].iccidLast4, "3456");
  assert.ok(orders[0].iccidHash);

  const again = await captureIccidForProviderOrder(
    { providerOrderId: "po-1", iccid: SAMPLE_ICCID },
    db
  );
  assert.equal(again.status, "already_same");

  const conflict = await captureIccidForProviderOrder(
    { providerOrderId: "po-1", iccid: SAMPLE_ICCID_B },
    db
  );
  assert.equal(conflict.status, "conflict");
  assert.equal(orders[0].iccidLast4, "3456");

  const dup = await captureIccidForProviderOrder(
    { providerOrderId: "po-2", iccid: SAMPLE_ICCID },
    db
  );
  assert.equal(dup.status, "duplicate_other_order");
  assert.equal(orders[1].iccidHash, null);

  const empty = await captureIccidForProviderOrder(
    { providerOrderId: "po-2", iccid: null },
    db
  );
  assert.equal(empty.status, "skipped_empty");
  assert.equal(orders[1].iccidEncrypted ?? null, null);

  const late = await captureIccidForProviderOrder(
    {
      providerOrderId: "po-2",
      checkoutPayload: { icc_id: SAMPLE_ICCID_B },
    },
    db
  );
  assert.equal(late.status, "stored");
  assert.equal(orders[1].iccidLast4, "3999");

  console.log("7) static wiring — shared capture, no forced null");
  const persistAssigned = read("app/lib/orders/persistAssignedOrder.ts");
  const persistGuest = read("app/lib/orders/persistGuestOrder.ts");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const adminAssign = read("app/lib/esim/adminPackageAssignment.ts");
  const guestRoute = read("app/api/vesim/checkout/route.ts");
  const deliver = read("app/lib/email/deliverAfterCheckout.ts");
  const orderDetails = read("app/api/vesim/order-details/route.ts");
  const adminOrders = read("app/lib/admin/orders.ts");
  const cryptoSrc = read("app/lib/orders/iccidCrypto.ts");
  const backfill = read("scripts/backfill-order-iccids.ts");
  const envExample = read(".env.example");
  const readme = read("README.md");
  const pkg = read("package.json");

  assert.match(persistAssigned, /captureIccidForProviderOrder/);
  assert.doesNotMatch(persistAssigned, /iccidEncrypted:\s*null/);
  assert.match(persistGuest, /captureIccidForProviderOrder/);
  assert.match(wallet, /checkoutPayload:\s*successCheckout\.payload/);
  assert.match(adminAssign, /checkoutPayload:\s*checkoutData/);
  assert.match(guestRoute, /checkoutPayload:\s*checkoutData/);
  assert.match(guestRoute, /isGuestVesimCheckoutEnabled/);
  assert.match(deliver, /captureIccidForProviderOrder/);
  assert.match(orderDetails, /iccidMasked,/);
  assert.ok(
    !/const safeOrder = \{[\s\S]*?\biccid:\s*install\.iccid/.test(orderDetails),
    "safeOrder must not expose full install.iccid"
  );
  assert.match(orderDetails, /"Cache-Control":\s*"private, no-store"/);
  assert.match(adminOrders, /formatStoredIccidLast4|adminIccidDisplay/);
  assert.match(adminOrders, /Pending from provider/);
  assert.doesNotMatch(adminOrders, /On file \(hidden\)/);
  assert.match(cryptoSrc, /import "server-only"/);
  const cryptoCoreSrc = read("app/lib/orders/iccidCryptoCore.ts");
  assert.match(cryptoCoreSrc, /aes-256-gcm/i);
  assert.match(cryptoCoreSrc, /ICCID_ENCRYPTION_KEY/);
  assert.doesNotMatch(cryptoCoreSrc, /NEXT_PUBLIC_/);
  assert.match(read("app/lib/orders/iccidCapture.ts"), /import "server-only"/);
  assert.match(envExample, /ICCID_ENCRYPTION_KEY=/);
  assert.match(readme, /ICCID_ENCRYPTION_KEY/);
  assert.match(backfill, /--apply/);
  assert.match(backfill, /DRY_RUN|dry_run/);
  assert.doesNotMatch(backfill, /console\.log\([^\n]*iccid/i);
  assert.match(pkg, /qa:iccid-persistence/);

  console.log("8) no plaintext ICCID in public success path");
  const success = read("app/success/page.tsx");
  assert.match(success, /iccidMasked/);
  assert.doesNotMatch(success, /payload\.iccid\b/);

  // Ensure sample ICCID bytes never appear in serialized "public" mock response shape.
  const publicJson = JSON.stringify({
    success: true,
    order: { iccidMasked: masked },
  });
  assert.ok(!publicJson.includes(SAMPLE_ICCID));
  assert.ok(
    !createHash("sha256").update(publicJson).digest("hex").includes(SAMPLE_ICCID)
  );

  console.log("ALL_QA_PASSED=iccid-persistence");
}

main().catch((error) => {
  console.error("QA failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
