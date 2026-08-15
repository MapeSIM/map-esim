/**
 * Isolated LOCAL-ONLY Partner Phase 1 validation:
 * schema checks, real credit/debit/concurrency, UAT seed.
 *
 * Requires process DATABASE_URL → 127.0.0.1 / localhost only.
 * Never point at Production / db.prisma.io.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../app/lib/auth/password";
import {
  creditPartnerWalletByAdmin,
  debitPartnerWalletByAdmin,
  PartnerWalletDebitError,
} from "../app/lib/partner/partnerWallet";

function assertLocalDatabaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL unparseable");
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing non-local DATABASE_URL host: ${host}`);
  }
  if (/prisma|neon|supabase|vercel|amazonaws/.test(host)) {
    throw new Error(`Refusing remote host pattern: ${host}`);
  }
  console.log(
    `CONFIRMED_LOCAL_DB host=${host} port=${parsed.port || "5432"} db=${parsed.pathname.replace(/^\//, "")}`
  );
}

function idem(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  assertLocalDatabaseUrl(url);

  const prisma = new PrismaClient();

  try {
    // --- Schema verification ---
    const roles = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = 'Role'
      ORDER BY e.enumsortorder
    `;
    const roleLabels = roles.map((r) => r.enumlabel);
    assert.deepEqual(roleLabels.sort(), ["ADMIN", "CUSTOMER", "PARTNER"].sort());
    console.log("PASS role_enum_customer_admin_partner");

    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('PartnerProfile','PartnerWalletAccount','PartnerWalletTransaction','User','WalletAccount')
      ORDER BY tablename
    `;
    const tableNames = tables.map((t) => t.tablename);
    for (const t of [
      "PartnerProfile",
      "PartnerWalletAccount",
      "PartnerWalletTransaction",
      "User",
      "WalletAccount",
    ]) {
      assert.ok(tableNames.includes(t), `missing table ${t}`);
    }
    console.log("PASS partner_and_existing_tables_present");

    const uniques = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND (
          indexname LIKE '%PartnerProfile_userId%'
          OR indexname LIKE '%PartnerWalletAccount_partnerId%'
          OR indexname LIKE '%PartnerWalletTransaction_idempotencyKey%'
        )
      ORDER BY indexname
    `;
    const defs = uniques.map((u) => u.indexdef).join("\n");
    assert.match(defs, /UNIQUE.*PartnerProfile.*userId/i);
    assert.match(defs, /UNIQUE.*PartnerWalletAccount.*partnerId/i);
    assert.match(defs, /UNIQUE.*idempotencyKey/i);
    console.log("PASS unique_indexes_partner");

    const cols = await prisma.$queryRaw<
      Array<{
        table_name: string;
        column_name: string;
        column_default: string | null;
      }>
    >`
      SELECT table_name, column_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'PartnerProfile' AND column_name IN ('discountBps','discountVersion','statusVersion'))
          OR (table_name = 'PartnerWalletAccount' AND column_name IN ('balanceCents','version'))
        )
      ORDER BY table_name, column_name
    `;
    const byKey = Object.fromEntries(
      cols.map((c) => [`${c.table_name}.${c.column_name}`, c.column_default])
    );
    assert.match(String(byKey["PartnerProfile.discountBps"]), /0/);
    assert.match(String(byKey["PartnerProfile.discountVersion"]), /0/);
    assert.match(String(byKey["PartnerProfile.statusVersion"]), /0/);
    assert.match(String(byKey["PartnerWalletAccount.balanceCents"]), /0/);
    assert.match(String(byKey["PartnerWalletAccount.version"]), /0/);
    console.log("PASS partner_defaults");

    // --- Seed ACTIVE admin + accounting Partner ---
    // Passwords are random (or from env) and never logged. Set UAT_ADMIN_PASSWORD /
    // UAT_PARTNER_PASSWORD only when you need known local login credentials.
    function randomLocalPassword(): string {
      return `Uat${randomBytes(18).toString("base64url")}!9`;
    }
    const adminPassword =
      process.env.UAT_ADMIN_PASSWORD?.trim() || randomLocalPassword();
    const partnerPassword =
      process.env.UAT_PARTNER_PASSWORD?.trim() || randomLocalPassword();
    if (adminPassword.length < 12 || partnerPassword.length < 12) {
      throw new Error("UAT_*_PASSWORD must be at least 12 characters when set");
    }
    const adminHash = await hashPassword(adminPassword);
    const partnerHash = await hashPassword(partnerPassword);

    const admin = await prisma.user.create({
      data: {
        name: "MAP Local UAT Admin",
        email: `uat-admin-${Date.now()}@example.invalid`,
        role: Role.ADMIN,
        passwordHash: adminHash,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });

    const partnerUser = await prisma.user.create({
      data: {
        name: "MAP Test Partner",
        email: `uat-partner-${Date.now()}@example.invalid`,
        role: Role.PARTNER,
        passwordHash: partnerHash,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true, name: true },
    });

    const partner = await prisma.partnerProfile.create({
      data: {
        userId: partnerUser.id,
        discountBps: 500,
        discountVersion: 1,
      },
      select: { id: true, discountBps: true, disabledAt: true },
    });

    console.log(`SEEDED_ADMIN_ID=${admin.id}`);
    console.log(`SEEDED_PARTNER_ID=${partner.id}`);
    console.log(`SEEDED_PARTNER_USER_ID=${partnerUser.id}`);
    console.log(`SEEDED_PARTNER_EMAIL=${partnerUser.email}`);
    console.log(`SEEDED_ADMIN_EMAIL=${admin.email}`);

    // A. Credit $500
    const creditA = await creditPartnerWalletByAdmin({
      adminUserId: admin.id,
      partnerId: partner.id,
      amountCents: 50_000,
      reason: "UAT isolated credit five hundred",
      internalReference: null,
      idempotencyKey: idem("uat_credit_a"),
    });
    assert.equal(creditA.duplicate, false);
    assert.equal(creditA.balanceCents, 50_000);
    console.log("PASS real_credit_500");

    // B. Debit $125
    const debitB = await debitPartnerWalletByAdmin({
      adminUserId: admin.id,
      partnerId: partner.id,
      amountCents: 12_500,
      reason: "UAT isolated debit one twenty five",
      internalReference: null,
      idempotencyKey: idem("uat_debit_b"),
    });
    assert.equal(debitB.duplicate, false);
    assert.equal(debitB.balanceCents, 37_500);
    console.log("PASS real_debit_125_balance_375");

    // C. Insufficient debit
    const beforeInsuf = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId: partner.id },
      select: { balanceCents: true, version: true },
    });
    let insufFailed = false;
    try {
      await debitPartnerWalletByAdmin({
        adminUserId: admin.id,
        partnerId: partner.id,
        amountCents: 40_000,
        reason: "UAT isolated overdraft attempt",
        internalReference: null,
        idempotencyKey: idem("uat_debit_over"),
      });
    } catch (e) {
      assert.ok(e instanceof PartnerWalletDebitError);
      assert.equal(e.code, "INSUFFICIENT_FUNDS");
      insufFailed = true;
    }
    assert.equal(insufFailed, true);
    const afterInsuf = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId: partner.id },
      select: { balanceCents: true, version: true },
    });
    assert.equal(afterInsuf.balanceCents, beforeInsuf.balanceCents);
    assert.equal(afterInsuf.version, beforeInsuf.version);
    console.log("PASS real_insufficient_debit_unchanged");

    // D. Ledger reconstruction
    async function reconcile(partnerId: string) {
      const wallet = await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
        select: { balanceCents: true, id: true },
      });
      const txs = await prisma.partnerWalletTransaction.findMany({
        where: { partnerWalletAccountId: wallet.id },
        orderBy: { createdAt: "asc" },
        select: {
          type: true,
          amountCents: true,
          balanceBeforeCents: true,
          balanceAfterCents: true,
        },
      });
      let reconstructed = 0;
      for (const tx of txs) {
        const delta =
          tx.type === "ADMIN_CREDIT" ? tx.amountCents : -tx.amountCents;
        assert.equal(tx.balanceBeforeCents, reconstructed);
        reconstructed += delta;
        assert.equal(tx.balanceAfterCents, reconstructed);
        assert.ok(tx.balanceAfterCents >= 0);
      }
      assert.equal(reconstructed, wallet.balanceCents);
      return { balanceCents: wallet.balanceCents, txCount: txs.length };
    }

    const recon1 = await reconcile(partner.id);
    assert.equal(recon1.balanceCents, 37_500);
    assert.equal(recon1.txCount, 2);
    console.log("PASS ledger_reconciles_to_balance");

    // E. Concurrent mutations (real service + PostgreSQL)
    const concurrentCredits = 8;
    const concurrentDebits = 6;
    const creditAmt = 1_000;
    const debitAmt = 500;

    const beforeConc = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId: partner.id },
      select: { balanceCents: true },
    });

    type ConcResult =
      | { ok: true; kind: "credit" | "debit"; amountCents: number }
      | { ok: false; kind: "credit" | "debit"; code: string };

    async function runConcOp(
      kind: "credit" | "debit",
      amountCents: number,
      key: string,
      reason: string
    ): Promise<ConcResult> {
      try {
        if (kind === "credit") {
          await creditPartnerWalletByAdmin({
            adminUserId: admin.id,
            partnerId: partner.id,
            amountCents,
            reason,
            internalReference: null,
            idempotencyKey: key,
          });
        } else {
          await debitPartnerWalletByAdmin({
            adminUserId: admin.id,
            partnerId: partner.id,
            amountCents,
            reason,
            internalReference: null,
            idempotencyKey: key,
          });
        }
        return { ok: true, kind, amountCents };
      } catch (e) {
        const code =
          e instanceof PartnerWalletDebitError ||
          (typeof e === "object" &&
            e !== null &&
            "code" in e &&
            typeof (e as { code: unknown }).code === "string")
            ? String((e as { code: string }).code)
            : "UNKNOWN";
        // Retry UNAVAILABLE a few times (CAS pressure under parallel load).
        if (code === "UNAVAILABLE") {
          for (let r = 0; r < 5; r++) {
            try {
              if (kind === "credit") {
                await creditPartnerWalletByAdmin({
                  adminUserId: admin.id,
                  partnerId: partner.id,
                  amountCents,
                  reason,
                  internalReference: null,
                  idempotencyKey: key,
                });
              } else {
                await debitPartnerWalletByAdmin({
                  adminUserId: admin.id,
                  partnerId: partner.id,
                  amountCents,
                  reason,
                  internalReference: null,
                  idempotencyKey: key,
                });
              }
              return { ok: true, kind, amountCents };
            } catch (e2) {
              const code2 =
                typeof e2 === "object" &&
                e2 !== null &&
                "code" in e2 &&
                typeof (e2 as { code: unknown }).code === "string"
                  ? String((e2 as { code: string }).code)
                  : "UNKNOWN";
              if (code2 !== "UNAVAILABLE") {
                return { ok: false, kind, code: code2 };
              }
            }
          }
        }
        return { ok: false, kind, code };
      }
    }

    const ops: Array<Promise<ConcResult>> = [];
    for (let i = 0; i < concurrentCredits; i++) {
      ops.push(
        runConcOp(
          "credit",
          creditAmt,
          idem(`uat_conc_c_${i}`),
          `UAT concurrent credit ${i}`
        )
      );
    }
    for (let i = 0; i < concurrentDebits; i++) {
      ops.push(
        runConcOp(
          "debit",
          debitAmt,
          idem(`uat_conc_d_${i}`),
          `UAT concurrent debit ${i}`
        )
      );
    }

    const results = await Promise.all(ops);
    const failedHard = results.filter(
      (r) => !r.ok && r.code !== "UNAVAILABLE" && r.code !== "INSUFFICIENT_FUNDS"
    );
    assert.equal(
      failedHard.length,
      0,
      `unexpected concurrent failures: ${JSON.stringify(failedHard)}`
    );

    let credited = 0;
    let debited = 0;
    for (const r of results) {
      if (!r.ok) continue;
      if (r.kind === "credit") credited += r.amountCents;
      else debited += r.amountCents;
    }
    // Under CAS pressure every op should eventually succeed via retries.
    assert.equal(credited, concurrentCredits * creditAmt);
    assert.equal(debited, concurrentDebits * debitAmt);

    const afterConc = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId: partner.id },
      select: { balanceCents: true, version: true },
    });
    assert.equal(
      afterConc.balanceCents,
      beforeConc.balanceCents + credited - debited
    );
    assert.ok(afterConc.balanceCents >= 0);

    const recon2 = await reconcile(partner.id);
    assert.equal(recon2.balanceCents, afterConc.balanceCents);

    // Duplicate idempotency must not double-credit
    const dupKey = idem("uat_dup");
    const first = await creditPartnerWalletByAdmin({
      adminUserId: admin.id,
      partnerId: partner.id,
      amountCents: 2_000,
      reason: "UAT duplicate idempotency first",
      internalReference: null,
      idempotencyKey: dupKey,
    });
    const second = await creditPartnerWalletByAdmin({
      adminUserId: admin.id,
      partnerId: partner.id,
      amountCents: 2_000,
      reason: "UAT duplicate idempotency second",
      internalReference: null,
      idempotencyKey: dupKey,
    });
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.transactionId, first.transactionId);
    const afterDup = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId: partner.id },
      select: { balanceCents: true },
    });
    assert.equal(afterDup.balanceCents, first.balanceCents);
    await reconcile(partner.id);
    console.log("PASS real_concurrent_cas_and_idempotency");

    // --- Visual UAT Partner: set balance exactly to $500 with ledger history ---
    // Create a fresh UAT display partner at exactly $500 / 5% for screens.
    const uatPartnerUser = await prisma.user.create({
      data: {
        name: "MAP Test Partner",
        email: "partner.uat.local@example.invalid",
        role: Role.PARTNER,
        passwordHash: partnerHash,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true, name: true },
    });
    const uatPartner = await prisma.partnerProfile.create({
      data: {
        userId: uatPartnerUser.id,
        discountBps: 500,
        discountVersion: 1,
      },
      select: { id: true },
    });

    // Also ensure a stable admin login for UAT UI
    const uatAdmin = await prisma.user.upsert({
      where: { email: "admin.uat.local@example.invalid" },
      create: {
        name: "MAP Local UAT Admin",
        email: "admin.uat.local@example.invalid",
        role: Role.ADMIN,
        passwordHash: adminHash,
        emailVerifiedAt: new Date(),
      },
      update: {
        passwordHash: adminHash,
        emailVerifiedAt: new Date(),
        adminDisabledAt: null,
        deletedAt: null,
      },
      select: { id: true, email: true },
    });

    await creditPartnerWalletByAdmin({
      adminUserId: uatAdmin.id,
      partnerId: uatPartner.id,
      amountCents: 60_000,
      reason: "UAT visual seed credit six hundred",
      internalReference: null,
      idempotencyKey: idem("uat_visual_credit"),
    });
    await debitPartnerWalletByAdmin({
      adminUserId: uatAdmin.id,
      partnerId: uatPartner.id,
      amountCents: 10_000,
      reason: "UAT visual seed debit one hundred",
      internalReference: null,
      idempotencyKey: idem("uat_visual_debit"),
    });

    const visualWallet = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId: uatPartner.id },
      select: { balanceCents: true },
    });
    assert.equal(visualWallet.balanceCents, 50_000);
    await reconcile(uatPartner.id);

    const fingerprint = createHash("sha256")
      .update(`${uatPartner.id}:${visualWallet.balanceCents}`)
      .digest("hex")
      .slice(0, 12);

    console.log("UAT_VISUAL_PARTNER_ID=" + uatPartner.id);
    console.log("UAT_VISUAL_PARTNER_EMAIL=" + uatPartnerUser.email);
    console.log("UAT_VISUAL_ADMIN_EMAIL=" + uatAdmin.email);
    console.log("UAT_VISUAL_DISCOUNT_BPS=500");
    console.log("UAT_VISUAL_BALANCE_CENTS=50000");
    console.log("UAT_VISUAL_STATUS=ACTIVE");
    console.log("UAT_VISUAL_FINGERPRINT=" + fingerprint);
    console.log(
      "UAT_PASSWORDS=not_printed (set UAT_ADMIN_PASSWORD / UAT_PARTNER_PASSWORD for known local logins)"
    );
    console.log("ALL PASS uat-partner-phase1-isolated");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
