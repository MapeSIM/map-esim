/**
 * Isolated LOCAL Partner purchase wallet debit/refund QA.
 * Requires DATABASE_URL → 127.0.0.1:55439 / map_esim_partner_phase2_uat only.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  PartnerWalletTransactionType,
  PrismaClient,
  Role,
} from "@prisma/client";
import { hashPassword } from "../app/lib/auth/password";
import {
  PartnerPurchaseWalletError,
  refundPartnerPurchaseFundsInTx,
  reservePartnerPurchaseFundsInTx,
} from "../app/lib/partner/partnerPurchaseWallet";

function assertLocalPhase2Db(url: string): void {
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
  const port = parsed.port || "5432";
  const db = parsed.pathname.replace(/^\//, "");
  if (port !== "55439" || db !== "map_esim_partner_phase2_uat") {
    throw new Error(
      `Refusing unexpected Phase 2 UAT target port=${port} db=${db}`
    );
  }
  console.log(`CONFIRMED_LOCAL_DB host=${host} port=${port} db=${db}`);
}

function purchaseId(tag: string): string {
  return `pep_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 64);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  assertLocalPhase2Db(url);

  const prisma = new PrismaClient();
  const stamp = Date.now();

  try {
    const adminHash = await hashPassword(
      `Uat${randomBytes(18).toString("base64url")}!9`
    );
    const partnerUser = await prisma.user.create({
      data: {
        name: "Phase2 Wallet QA Partner",
        email: `p2.wallet.${stamp}@example.com`,
        passwordHash: adminHash,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 500,
            discountVersion: 1,
            walletAccount: {
              create: {
                balanceCents: 10_000,
                version: 0,
              },
            },
          },
        },
      },
      select: {
        id: true,
        partnerProfile: { select: { id: true } },
      },
    });
    const partnerId = partnerUser.partnerProfile!.id;
    const pepA = purchaseId("a");

    // A. debit $9.50 from $100
    const debit1 = await prisma.$transaction((tx) =>
      reservePartnerPurchaseFundsInTx(tx, {
        partnerId,
        partnerEsimPurchaseId: pepA,
        amountCents: 950,
      })
    );
    assert.equal(debit1.outcome, "created");
    assert.equal(debit1.amountCents, 950);
    assert.equal(debit1.balanceAfterCents, 9_050);
    const walletA = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId },
      select: { balanceCents: true },
    });
    assert.equal(walletA.balanceCents, 9_050);
    const debitRows = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT,
        referenceId: pepA,
      },
    });
    assert.equal(debitRows, 1);
    console.log("PASS A_debit_950_from_10000");

    // B. repeat same debit key
    const debit2 = await prisma.$transaction((tx) =>
      reservePartnerPurchaseFundsInTx(tx, {
        partnerId,
        partnerEsimPurchaseId: pepA,
        amountCents: 950,
      })
    );
    assert.equal(debit2.outcome, "already_applied");
    assert.equal(debit2.transactionId, debit1.transactionId);
    const walletB = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId },
      select: { balanceCents: true },
    });
    assert.equal(walletB.balanceCents, 9_050);
    assert.equal(
      await prisma.partnerWalletTransaction.count({
        where: {
          wallet: { partnerId },
          type: PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT,
          referenceId: pepA,
        },
      }),
      1
    );
    console.log("PASS B_repeat_debit_idempotent");

    // C. insufficient funds
    const pepC = purchaseId("c");
    let insuf: unknown = null;
    try {
      await prisma.$transaction((tx) =>
        reservePartnerPurchaseFundsInTx(tx, {
          partnerId,
          partnerEsimPurchaseId: pepC,
          amountCents: 50_000,
        })
      );
    } catch (e) {
      insuf = e;
    }
    assert.ok(insuf instanceof PartnerPurchaseWalletError);
    assert.equal(
      (insuf as PartnerPurchaseWalletError).code,
      "INSUFFICIENT_FUNDS"
    );
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents,
      9_050
    );
    assert.equal(
      await prisma.partnerWalletTransaction.count({
        where: { referenceId: pepC },
      }),
      0
    );
    console.log("PASS C_insufficient_funds");

    // D. exact refund $9.50
    const refund1 = await prisma.$transaction((tx) =>
      refundPartnerPurchaseFundsInTx(tx, {
        partnerId,
        partnerEsimPurchaseId: pepA,
        amountCents: 950,
      })
    );
    assert.equal(refund1.outcome, "created");
    assert.equal(refund1.balanceAfterCents, 10_000);
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents,
      10_000
    );
    assert.equal(
      await prisma.partnerWalletTransaction.count({
        where: {
          wallet: { partnerId },
          type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
          referenceId: pepA,
        },
      }),
      1
    );
    console.log("PASS D_exact_refund_950");

    // E. repeat refund
    const refund2 = await prisma.$transaction((tx) =>
      refundPartnerPurchaseFundsInTx(tx, {
        partnerId,
        partnerEsimPurchaseId: pepA,
        amountCents: 950,
      })
    );
    assert.equal(refund2.outcome, "already_applied");
    assert.equal(refund2.transactionId, refund1.transactionId);
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents,
      10_000
    );
    console.log("PASS E_repeat_refund_idempotent");

    // F. conflicting debit key / amount
    let conflictDebit: unknown = null;
    try {
      await prisma.$transaction((tx) =>
        reservePartnerPurchaseFundsInTx(tx, {
          partnerId,
          partnerEsimPurchaseId: pepA,
          amountCents: 1_000,
        })
      );
    } catch (e) {
      conflictDebit = e;
    }
    assert.ok(conflictDebit instanceof PartnerPurchaseWalletError);
    assert.equal(
      (conflictDebit as PartnerPurchaseWalletError).code,
      "IDEMPOTENCY_CONFLICT"
    );
    console.log("PASS F_debit_key_amount_conflict");

    // G. conflicting refund key / amount
    let conflictRefund: unknown = null;
    try {
      await prisma.$transaction((tx) =>
        refundPartnerPurchaseFundsInTx(tx, {
          partnerId,
          partnerEsimPurchaseId: pepA,
          amountCents: 1_000,
        })
      );
    } catch (e) {
      conflictRefund = e;
    }
    assert.ok(conflictRefund instanceof PartnerPurchaseWalletError);
    assert.equal(
      (conflictRefund as PartnerPurchaseWalletError).code,
      "IDEMPOTENCY_CONFLICT"
    );
    console.log("PASS G_refund_key_amount_conflict");

    // H. concurrent debits against limited balance ($20, 8x $5 attempts)
    const partnerH = await prisma.user.create({
      data: {
        name: "Phase2 Concurrent Partner",
        email: `p2.conc.${stamp}@example.com`,
        passwordHash: adminHash,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 0,
            walletAccount: { create: { balanceCents: 2_000, version: 0 } },
          },
        },
      },
      select: { partnerProfile: { select: { id: true } } },
    });
    const partnerHId = partnerH.partnerProfile!.id;
    const concurrent = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        prisma.$transaction((tx) =>
          reservePartnerPurchaseFundsInTx(tx, {
            partnerId: partnerHId,
            partnerEsimPurchaseId: purchaseId(`h${i}`),
            amountCents: 500,
          })
        )
      )
    );
    const won = concurrent.filter((r) => r.status === "fulfilled");
    const lost = concurrent.filter((r) => r.status === "rejected");
    assert.equal(won.length, 4);
    assert.equal(lost.length, 4);
    for (const r of lost) {
      assert.ok(r.status === "rejected");
      assert.ok(r.reason instanceof PartnerPurchaseWalletError);
      assert.ok(
        r.reason.code === "INSUFFICIENT_FUNDS" ||
          r.reason.code === "UNAVAILABLE"
      );
    }
    const walletH = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId: partnerHId },
    });
    assert.equal(walletH.balanceCents, 0);
    assert.ok(walletH.balanceCents >= 0);
    const debitH = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId: partnerHId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT,
      },
    });
    assert.equal(debitH, 4);
    console.log("PASS H_concurrent_debits_no_overdraw");

    // I. concurrent refunds (exact-once) + credits
    const pepI = purchaseId("i");
    await prisma.$transaction((tx) =>
      reservePartnerPurchaseFundsInTx(tx, {
        partnerId,
        partnerEsimPurchaseId: pepI,
        amountCents: 1_000,
      })
    );
    const beforeI = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    const refundConc = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        prisma.$transaction((tx) =>
          refundPartnerPurchaseFundsInTx(tx, {
            partnerId,
            partnerEsimPurchaseId: pepI,
            amountCents: 1_000,
          })
        )
      )
    );
    const refundOk = refundConc.filter((r) => r.status === "fulfilled");
    assert.ok(refundOk.length >= 1);
    for (const r of refundOk) {
      assert.ok(r.status === "fulfilled");
      assert.ok(
        r.value.outcome === "created" || r.value.outcome === "already_applied"
      );
    }
    assert.equal(
      await prisma.partnerWalletTransaction.count({
        where: {
          wallet: { partnerId },
          type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
          referenceId: pepI,
        },
      }),
      1
    );
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents,
      beforeI + 1_000
    );
    console.log("PASS I_concurrent_refunds_exact_once");

    // J. ledger reconstruction equals balance delta
    const startBal = 10_000; // partner started here; after A–I track delta via ledger
    const ledger = await prisma.partnerWalletTransaction.findMany({
      where: { wallet: { partnerId } },
      select: { type: true, amountCents: true },
      orderBy: { createdAt: "asc" },
    });
    let reconstructed = startBal;
    for (const row of ledger) {
      if (
        row.type === PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT ||
        row.type === PartnerWalletTransactionType.ADMIN_DEBIT
      ) {
        reconstructed -= row.amountCents;
      } else if (
        row.type === PartnerWalletTransactionType.ESIM_PURCHASE_REFUND ||
        row.type === PartnerWalletTransactionType.ADMIN_CREDIT
      ) {
        reconstructed += row.amountCents;
      }
    }
    const live = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    assert.equal(reconstructed, live);
    console.log("PASS J_ledger_reconstructs_balance");

    // K. rollback after mutation
    const beforeK = live;
    const pepK = purchaseId("k");
    let rolled: unknown = null;
    try {
      await prisma.$transaction(async (tx) => {
        await reservePartnerPurchaseFundsInTx(tx, {
          partnerId,
          partnerEsimPurchaseId: pepK,
          amountCents: 200,
        });
        throw new Error("SIMULATED_CALLER_FAILURE");
      });
    } catch (e) {
      rolled = e;
    }
    assert.ok(rolled instanceof Error);
    assert.match((rolled as Error).message, /SIMULATED_CALLER_FAILURE/);
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents,
      beforeK
    );
    assert.equal(
      await prisma.partnerWalletTransaction.count({
        where: { referenceId: pepK },
      }),
      0
    );
    console.log("PASS K_caller_tx_rollback");

    // No ADMIN_* types used for purchase paths
    assert.equal(
      await prisma.partnerWalletTransaction.count({
        where: {
          wallet: { partnerId: { in: [partnerId, partnerHId] } },
          type: {
            in: [
              PartnerWalletTransactionType.ADMIN_CREDIT,
              PartnerWalletTransactionType.ADMIN_DEBIT,
            ],
          },
        },
      }),
      0
    );
    console.log("PASS no_admin_ledger_types_for_purchase");

    console.log("ALL PASS qa-partner-purchase-wallet");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
