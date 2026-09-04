/**
 * Partner purchase sequencing regression QA (pre-debit gates + post-debit safety).
 * DATABASE_URL must be 127.0.0.1:55439 / map_esim_partner_phase2_uat.
 * No live VeSIM — injected verifyOffer + providerCheckout mocks.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  OperationalControlKey,
  PartnerEsimPurchaseStatus,
  PartnerWalletTransactionType,
  PrismaClient,
  Role,
} from "@prisma/client";
import { hashPassword } from "../app/lib/auth/password";
import {
  PartnerEsimPurchaseError,
  preparePartnerEsimPurchase,
  reservePartnerEsimPurchase,
  type PartnerOfferVerifier,
} from "../app/lib/partner/partnerEsimPurchase";
import {
  executePartnerEsimProviderPurchase,
  refundNeverStartedPartnerEsimPurchase,
  recoverStaleNeverStartedPartnerPurchases,
  type PartnerProviderCheckoutExecutor,
} from "../app/lib/partner/partnerEsimPurchaseProvider";
import { evaluatePartnerRefundLocalEligibility } from "../app/lib/admin/reconciliationCaseShared";
import type { CreditCheckoutResult } from "../app/lib/vesim/creditCheckout";
import type { VerifiedCheckoutOffer } from "../app/lib/vesim/server";

function assertLocalPhase2Db(url: string): void {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing non-local host: ${host}`);
  }
  const port = parsed.port || "5432";
  const db = parsed.pathname.replace(/^\//, "");
  if (port !== "55439" || db !== "map_esim_partner_phase2_uat") {
    throw new Error(`Refusing unexpected target port=${port} db=${db}`);
  }
  console.log(`CONFIRMED_LOCAL_DB host=${host} port=${port} db=${db}`);
}

function idem(tag: string): string {
  return `pep_seq_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 128);
}

function makeOffer(
  overrides?: Partial<VerifiedCheckoutOffer>
): VerifiedCheckoutOffer {
  return {
    offerId: "ESIM-PK-QA-SEQ-1",
    name: "QA Pakistan 1GB Seq",
    countryCode: "PK",
    countryName: "Pakistan",
    dataFormatted: "1 GB",
    durationDays: 7,
    priceUSD: 10,
    providerPriceUSD: 8,
    currency: "USD",
    ...overrides,
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  assertLocalPhase2Db(url);
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const pw = await hashPassword(`Uat${randomBytes(18).toString("base64url")}!9`);

  let offerState = makeOffer();
  const verifyOffer: PartnerOfferVerifier = async ({ offerId }) => {
    if (offerId !== offerState.offerId) return null;
    return { ...offerState };
  };

  let providerCalls = 0;
  let nextCheckout: CreditCheckoutResult = {
    kind: "success",
    providerOrderId: `PO-SEQ-${stamp}-A`,
    payload: {
      orderId: `PO-SEQ-${stamp}-A`,
      iccid: "8900000000000000099",
    },
  };
  const providerCheckout: PartnerProviderCheckoutExecutor = async () => {
    providerCalls += 1;
    return nextCheckout;
  };

  try {
    await prisma.operationalControl.upsert({
      where: { key: OperationalControlKey.PARTNER_WALLET_PURCHASES },
      create: {
        id: "opsctl_partner_wallet_purchases",
        key: OperationalControlKey.PARTNER_WALLET_PURCHASES,
        paused: false,
        version: 0,
      },
      update: { paused: false },
    });
    await prisma.operationalControl.upsert({
      where: { key: OperationalControlKey.PROVIDER_ORDER_CREATION },
      create: {
        id: "opsctl_provider_order_creation",
        key: OperationalControlKey.PROVIDER_ORDER_CREATION,
        paused: false,
        version: 0,
      },
      update: { paused: false },
    });
    await prisma.operationalControl.upsert({
      where: { key: OperationalControlKey.TRANSACTION_MAINTENANCE },
      create: {
        id: "opsctl_transaction_maintenance",
        key: OperationalControlKey.TRANSACTION_MAINTENANCE,
        paused: false,
        version: 0,
      },
      update: { paused: false },
    });

    const partnerUser = await prisma.user.create({
      data: {
        name: "Seq QA Partner",
        email: `p2.seq.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 500,
            // Match Partner create / schema default (0). Provider must accept this.
            discountVersion: 0,
            walletAccount: {
              create: { balanceCents: 50_000, version: 0 },
            },
          },
        },
      },
      select: {
        id: true,
        partnerProfile: { select: { id: true } },
      },
    });
    const partnerUserId = partnerUser.id;
    const partnerId = partnerUser.partnerProfile!.id;

    async function balance(): Promise<number> {
      return (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents;
    }

    // 1. PROVIDER_ORDER_CREATION disabled before debit
    await prisma.operationalControl.update({
      where: { key: OperationalControlKey.PROVIDER_ORDER_CREATION },
      data: { paused: true },
    });
    const bal1 = await balance();
    providerCalls = 0;
    const prep1 = await preparePartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("1"),
      verifyOffer,
    });
    try {
      await reservePartnerEsimPurchase({
        partnerUserId,
        purchaseId: prep1.purchaseId,
        verifyOffer,
      });
      assert.fail("expected UNAVAILABLE");
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "UNAVAILABLE");
    }
    const row1 = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: prep1.purchaseId },
    });
    assert.equal(row1.debitTransactionId, null);
    assert.notEqual(row1.status, PartnerEsimPurchaseStatus.PROVIDER_PENDING);
    assert.equal(await balance(), bal1);
    assert.equal(providerCalls, 0);
    await prisma.operationalControl.update({
      where: { key: OperationalControlKey.PROVIDER_ORDER_CREATION },
      data: { paused: false },
    });
    console.log("PASS 1_gate_disabled_no_debit");

    // 2. Deterministic pre-provider config / partner purchase control failure → no debit
    await prisma.operationalControl.update({
      where: { key: OperationalControlKey.PARTNER_WALLET_PURCHASES },
      data: { paused: true },
    });
    const bal2 = await balance();
    try {
      await preparePartnerEsimPurchase({
        partnerUserId,
        offerId: offerState.offerId,
        idempotencyKey: idem("2"),
        verifyOffer,
      });
      assert.fail("expected UNAVAILABLE");
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "UNAVAILABLE");
    }
    assert.equal(await balance(), bal2);
    await prisma.operationalControl.update({
      where: { key: OperationalControlKey.PARTNER_WALLET_PURCHASES },
      data: { paused: false },
    });
    console.log("PASS 2_partner_purchase_paused_no_debit");

    // 3. Provider success → debit once + order once
    providerCalls = 0;
    nextCheckout = {
      kind: "success",
      providerOrderId: `PO-SEQ-${stamp}-S`,
      payload: {
        orderId: `PO-SEQ-${stamp}-S`,
        iccid: "8900000000000000100",
      },
    };
    const bal3 = await balance();
    const prep3 = await preparePartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("3"),
      verifyOffer,
    });
    const reserved3 = await reservePartnerEsimPurchase({
      partnerUserId,
      purchaseId: prep3.purchaseId,
      verifyOffer,
    });
    assert.equal(reserved3.status, PartnerEsimPurchaseStatus.PROVIDER_PENDING);
    const charge3 = (
      await prisma.partnerEsimPurchase.findUniqueOrThrow({
        where: { id: prep3.purchaseId },
        select: { partnerChargeCents: true },
      })
    ).partnerChargeCents;
    assert.equal(await balance(), bal3 - charge3);
    const exec3 = await executePartnerEsimProviderPurchase({
      partnerUserId,
      purchaseId: prep3.purchaseId,
      providerCheckout,
    });
    assert.equal(exec3.status, PartnerEsimPurchaseStatus.COMPLETED);
    assert.equal(providerCalls, 1);
    assert.equal(await balance(), bal3 - charge3);
    assert.equal(
      await prisma.order.count({
        where: { providerOrderId: `PO-SEQ-${stamp}-S` },
      }),
      1
    );
    const debitCount3 = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT,
        referenceId: prep3.purchaseId,
      },
    });
    assert.equal(debitCount3, 1);
    console.log("PASS 3_provider_success_debit_once_order_once");

    // 4. Provider timeout/unknown → RECONCILIATION_REQUIRED, no auto-refund
    providerCalls = 0;
    nextCheckout = {
      kind: "uncertain",
      category: "provider_timeout",
      code: "timeout",
    };
    const bal4 = await balance();
    const prep4 = await preparePartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("4"),
      verifyOffer,
    });
    await reservePartnerEsimPurchase({
      partnerUserId,
      purchaseId: prep4.purchaseId,
      verifyOffer,
    });
    const charge4 = (
      await prisma.partnerEsimPurchase.findUniqueOrThrow({
        where: { id: prep4.purchaseId },
        select: { partnerChargeCents: true },
      })
    ).partnerChargeCents;
    try {
      await executePartnerEsimProviderPurchase({
        partnerUserId,
        purchaseId: prep4.purchaseId,
        providerCheckout,
      });
      assert.fail("expected RECONCILIATION_REQUIRED");
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "RECONCILIATION_REQUIRED");
    }
    const row4 = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: prep4.purchaseId },
    });
    assert.equal(row4.status, PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED);
    assert.equal(row4.refundTransactionId, null);
    assert.equal(await balance(), bal4 - charge4);
    assert.equal(providerCalls, 1);
    console.log("PASS 4_timeout_recon_no_auto_refund");

    // 5. Confirmed provider failure after debit → refund exactly once
    providerCalls = 0;
    nextCheckout = {
      kind: "declined",
      httpStatus: 402,
      payload: { error: "declined" },
    };
    const bal5 = await balance();
    const prep5 = await preparePartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("5"),
      verifyOffer,
    });
    await reservePartnerEsimPurchase({
      partnerUserId,
      purchaseId: prep5.purchaseId,
      verifyOffer,
    });
    const charge5 = (
      await prisma.partnerEsimPurchase.findUniqueOrThrow({
        where: { id: prep5.purchaseId },
        select: { partnerChargeCents: true },
      })
    ).partnerChargeCents;
    try {
      await executePartnerEsimProviderPurchase({
        partnerUserId,
        purchaseId: prep5.purchaseId,
        providerCheckout,
      });
      assert.fail("expected PROVIDER_FAILED");
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "PROVIDER_FAILED");
    }
    const row5 = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: prep5.purchaseId },
    });
    assert.equal(row5.status, PartnerEsimPurchaseStatus.FAILED_REFUNDED);
    assert.ok(row5.refundTransactionId);
    assert.equal(await balance(), bal5);
    const refundCount5 = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
        referenceId: prep5.purchaseId,
      },
    });
    assert.equal(refundCount5, 1);
    console.log("PASS 5_confirmed_failure_refund_once");

    // 6. Duplicate/retry: no duplicate debit/refund/order; never-started recovery idempotent
    providerCalls = 0;
    nextCheckout = {
      kind: "success",
      providerOrderId: `PO-SEQ-${stamp}-D`,
      payload: {
        orderId: `PO-SEQ-${stamp}-D`,
        iccid: "8900000000000000101",
      },
    };
    const prep6 = await preparePartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("6"),
      verifyOffer,
    });
    await reservePartnerEsimPurchase({
      partnerUserId,
      purchaseId: prep6.purchaseId,
      verifyOffer,
    });
    await executePartnerEsimProviderPurchase({
      partnerUserId,
      purchaseId: prep6.purchaseId,
      providerCheckout,
    });
    const bal6 = await balance();
    const again6 = await executePartnerEsimProviderPurchase({
      partnerUserId,
      purchaseId: prep6.purchaseId,
      providerCheckout,
    });
    assert.equal(again6.duplicate, true);
    assert.equal(providerCalls, 1);
    assert.equal(await balance(), bal6);
    assert.equal(
      await prisma.order.count({
        where: { providerOrderId: `PO-SEQ-${stamp}-D` },
      }),
      1
    );

    // Never-started refund idempotency + recon eligibility without providerOrderId
    const prep7 = await preparePartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("7"),
      verifyOffer,
    });
    await reservePartnerEsimPurchase({
      partnerUserId,
      purchaseId: prep7.purchaseId,
      verifyOffer,
    });
    // Simulate stuck never-started PROVIDER_PENDING (no claim)
    const stuck = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: prep7.purchaseId },
      select: {
        partnerChargeCents: true,
        debitTransactionId: true,
        status: true,
      },
    });
    assert.equal(stuck.status, PartnerEsimPurchaseStatus.PROVIDER_PENDING);
    const bal7 = await balance();
    const r1 = await refundNeverStartedPartnerEsimPurchase({
      purchaseId: prep7.purchaseId,
      partnerUserId,
      expectedPartnerChargeCents: stuck.partnerChargeCents,
    });
    const r2 = await refundNeverStartedPartnerEsimPurchase({
      purchaseId: prep7.purchaseId,
      partnerUserId,
      expectedPartnerChargeCents: stuck.partnerChargeCents,
    });
    assert.equal(r2.idempotent, true);
    assert.equal(r1.refundTransactionId, r2.refundTransactionId);
    assert.equal(await balance(), bal7 + stuck.partnerChargeCents);
    const refundCount7 = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
        referenceId: prep7.purchaseId,
      },
    });
    assert.equal(refundCount7, 1);

    const elig = evaluatePartnerRefundLocalEligibility({
      sourceType: "partner_purchase",
      alreadyResolved: false,
      locked: true,
      lockedByAdminId: "admin-seq",
      currentAdminId: "admin-seq",
      status: "PROVIDER_PENDING",
      fundingSource: "PARTNER_BALANCE",
      orderId: null,
      orderStatus: null,
      providerOrderId: null,
      offerId: offerState.offerId,
      partnerId,
      partnerChargeCents: stuck.partnerChargeCents,
      debitAmountCents: stuck.partnerChargeCents,
      debitStatus: "COMPLETED",
      debitTransactionId: stuck.debitTransactionId,
      refundTransactionId: null,
      fulfilmentIccidPresent: false,
      providerInstallDataPresent: false,
      providerRefreshInProgress: false,
      providerNeverStarted: true,
    });
    assert.equal(elig.allowed, true);
    console.log("PASS 6_duplicate_and_never_started_idempotent");

    // 8. Exception after debit before provider claim → refund once, no VeSIM call
    providerCalls = 0;
    const bal8 = await balance();
    const prep8 = await preparePartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("8"),
      verifyOffer,
    });
    await reservePartnerEsimPurchase({
      partnerUserId,
      purchaseId: prep8.purchaseId,
      verifyOffer,
    });
    const charge8 = (
      await prisma.partnerEsimPurchase.findUniqueOrThrow({
        where: { id: prep8.purchaseId },
        select: { partnerChargeCents: true },
      })
    ).partnerChargeCents;
    try {
      await executePartnerEsimProviderPurchase({
        partnerUserId,
        purchaseId: prep8.purchaseId,
        providerCheckout,
        beforeProviderClaim: async () => {
          throw new Error("simulated_abort_before_claim");
        },
      });
      assert.fail("expected PROVIDER_FAILED");
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "PROVIDER_FAILED");
    }
    assert.equal(providerCalls, 0);
    const row8 = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: prep8.purchaseId },
    });
    assert.equal(row8.status, PartnerEsimPurchaseStatus.FAILED_REFUNDED);
    assert.ok(row8.refundTransactionId);
    assert.equal(row8.providerRefreshClaimedAt, null);
    assert.equal(await balance(), bal8);
    const refundCount8 = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
        referenceId: prep8.purchaseId,
      },
    });
    assert.equal(refundCount8, 1);
    console.log("PASS 8_abort_before_claim_refund_once");

    // 9. Stale never-started recovery → refund once
    const prep9 = await preparePartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("9"),
      verifyOffer,
    });
    await reservePartnerEsimPurchase({
      partnerUserId,
      purchaseId: prep9.purchaseId,
      verifyOffer,
    });
    // Age the row so stale recovery is eligible.
    await prisma.partnerEsimPurchase.update({
      where: { id: prep9.purchaseId },
      data: { updatedAt: new Date(Date.now() - 120_000) },
    });
    const bal9 = await balance();
    const charge9 = (
      await prisma.partnerEsimPurchase.findUniqueOrThrow({
        where: { id: prep9.purchaseId },
        select: { partnerChargeCents: true },
      })
    ).partnerChargeCents;
    const recovered = await recoverStaleNeverStartedPartnerPurchases({
      partnerId,
      olderThanMs: 60_000,
      limit: 20,
    });
    assert.ok(recovered.purchaseIds.includes(prep9.purchaseId));
    const row9 = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: prep9.purchaseId },
    });
    assert.equal(row9.status, PartnerEsimPurchaseStatus.FAILED_REFUNDED);
    assert.equal(await balance(), bal9 + charge9);
    const recoveredAgain = await recoverStaleNeverStartedPartnerPurchases({
      partnerId,
      olderThanMs: 60_000,
      limit: 20,
    });
    assert.equal(recoveredAgain.purchaseIds.includes(prep9.purchaseId), false);
    assert.equal(await balance(), bal9 + charge9);
    console.log("PASS 9_stale_never_started_recovery");

    console.log("ALL PASS qa-partner-purchase-sequencing");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
