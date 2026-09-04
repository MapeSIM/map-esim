/**
 * Isolated LOCAL Partner eSIM provider execution QA (Slice 5).
 * DATABASE_URL must be 127.0.0.1:55439 / map_esim_partner_phase2_uat.
 * No live VeSIM — injected providerCheckout mock.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  OperationalControlKey,
  OrderFundingSource,
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
  type PartnerProviderCheckoutExecutor,
} from "../app/lib/partner/partnerEsimPurchaseProvider";
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
  return `pep_prov_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 128);
}

function makeOffer(
  overrides?: Partial<VerifiedCheckoutOffer>
): VerifiedCheckoutOffer {
  return {
    offerId: "ESIM-PK-QA-PROV-1",
    name: "QA Pakistan 1GB Prov",
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

function successCheckout(
  providerOrderId: string
): CreditCheckoutResult {
  return {
    kind: "success",
    providerOrderId,
    payload: {
      orderId: providerOrderId,
      iccid: "8900000000000000001",
    },
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
  let nextCheckout: CreditCheckoutResult = successCheckout(`PO-QA-${stamp}-A`);
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
        name: "P2 Prov Partner",
        email: `p2.prov.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 500,
            discountVersion: 2,
            walletAccount: { create: { balanceCents: 100_000, version: 0 } },
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

    const customer = await prisma.user.create({
      data: {
        name: "P2 Prov Customer",
        email: `p2.prov.cust.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
        walletAccount: { create: { balanceCents: 77_777, version: 0 } },
      },
      select: { id: true },
    });
    const customerWalletBefore = (
      await prisma.walletAccount.findUniqueOrThrow({
        where: { userId: customer.id },
      })
    ).balanceCents;

    async function prepareAndReserve(tag: string) {
      const key = idem(tag);
      const prep = await preparePartnerEsimPurchase({
        partnerUserId,
        offerId: offerState.offerId,
        idempotencyKey: key,
        countryHint: "PK",
        verifyOffer,
      });
      const reserved = await reservePartnerEsimPurchase({
        partnerUserId,
        purchaseId: prep.purchaseId,
        verifyOffer,
      });
      assert.equal(reserved.status, PartnerEsimPurchaseStatus.PROVIDER_PENDING);
      assert.ok(reserved.debitTransactionId);
      return reserved.purchaseId;
    }

    // A. success path
    providerCalls = 0;
    nextCheckout = successCheckout(`PO-QA-${stamp}-A`);
    const purchaseA = await prepareAndReserve("a");
    const balBeforeA = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    const resultA = await executePartnerEsimProviderPurchase({
      partnerUserId,
      purchaseId: purchaseA,
      providerCheckout,
    });
    assert.equal(resultA.duplicate, false);
    assert.equal(resultA.status, PartnerEsimPurchaseStatus.COMPLETED);
    assert.ok(resultA.orderId);
    assert.equal(providerCalls, 1);
    const rowA = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchaseA },
    });
    assert.equal(rowA.status, PartnerEsimPurchaseStatus.COMPLETED);
    assert.equal(rowA.orderId, resultA.orderId);
    assert.equal(rowA.providerOrderId, `PO-QA-${stamp}-A`);
    assert.equal(rowA.providerResultKind, "success");
    assert.equal(rowA.refundTransactionId, null);
    const orderA = await prisma.order.findUniqueOrThrow({
      where: { id: resultA.orderId! },
    });
    assert.equal(orderA.fundingSource, OrderFundingSource.PARTNER_BALANCE);
    assert.equal(orderA.providerOrderId, `PO-QA-${stamp}-A`);
    const balAfterA = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    assert.equal(balAfterA, balBeforeA);
    const refundCountA = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
        referenceId: purchaseA,
      },
    });
    assert.equal(refundCountA, 0);
    console.log("PASS A_provider_success_completed");

    // B. repeated success handler
    providerCalls = 0;
    const resultB = await executePartnerEsimProviderPurchase({
      partnerUserId,
      purchaseId: purchaseA,
      providerCheckout,
    });
    assert.equal(resultB.duplicate, true);
    assert.equal(resultB.orderId, resultA.orderId);
    assert.equal(providerCalls, 0);
    assert.equal(
      await prisma.order.count({
        where: { providerOrderId: `PO-QA-${stamp}-A` },
      }),
      1
    );
    console.log("PASS B_repeat_success_no_provider_no_money");

    // C. confirmed failure → exact refund
    providerCalls = 0;
    nextCheckout = {
      kind: "declined",
      httpStatus: 402,
      payload: { error: "declined" },
    };
    const purchaseC = await prepareAndReserve("c");
    const snapC = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchaseC },
      select: { partnerChargeCents: true },
    });
    const balBeforeC = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    let failedC = false;
    try {
      await executePartnerEsimProviderPurchase({
        partnerUserId,
        purchaseId: purchaseC,
        providerCheckout,
      });
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "PROVIDER_FAILED");
      failedC = true;
    }
    assert.equal(failedC, true);
    assert.equal(providerCalls, 1);
    const rowC = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchaseC },
    });
    assert.equal(rowC.status, PartnerEsimPurchaseStatus.FAILED_REFUNDED);
    assert.ok(rowC.refundTransactionId);
    assert.equal(rowC.providerResultKind, "declined");
    const refundC = await prisma.partnerWalletTransaction.findUniqueOrThrow({
      where: { id: rowC.refundTransactionId! },
    });
    assert.equal(refundC.type, PartnerWalletTransactionType.ESIM_PURCHASE_REFUND);
    assert.equal(refundC.amountCents, snapC.partnerChargeCents);
    const balAfterC = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    assert.equal(balAfterC, balBeforeC + snapC.partnerChargeCents);
    console.log("PASS C_confirmed_failure_exact_refund");

    // D. repeat confirmed failure → no second refund
    providerCalls = 0;
    let failedD = false;
    try {
      await executePartnerEsimProviderPurchase({
        partnerUserId,
        purchaseId: purchaseC,
        providerCheckout,
      });
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "PROVIDER_FAILED");
      failedD = true;
    }
    assert.equal(failedD, true);
    assert.equal(providerCalls, 0);
    assert.equal(
      await prisma.partnerWalletTransaction.count({
        where: {
          wallet: { partnerId },
          type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
          referenceId: purchaseC,
        },
      }),
      1
    );
    console.log("PASS D_repeat_failure_no_second_refund");

    // E. discount changed after debit → refund still original partnerChargeCents
    providerCalls = 0;
    nextCheckout = {
      kind: "declined",
      httpStatus: 400,
      payload: {},
    };
    const purchaseE = await prepareAndReserve("e");
    const snapE = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchaseE },
      select: { partnerChargeCents: true, discountBps: true },
    });
    assert.equal(snapE.partnerChargeCents, 950);
    await prisma.partnerProfile.update({
      where: { id: partnerId },
      data: { discountBps: 2000, discountVersion: { increment: 1 } },
    });
    const balBeforeE = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    try {
      await executePartnerEsimProviderPurchase({
        partnerUserId,
        purchaseId: purchaseE,
        providerCheckout,
      });
      assert.fail("expected PROVIDER_FAILED");
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "PROVIDER_FAILED");
    }
    const rowE = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchaseE },
    });
    assert.equal(rowE.status, PartnerEsimPurchaseStatus.FAILED_REFUNDED);
    const refundE = await prisma.partnerWalletTransaction.findUniqueOrThrow({
      where: { id: rowE.refundTransactionId! },
    });
    assert.equal(refundE.amountCents, 950);
    assert.notEqual(refundE.amountCents, 800);
    const balAfterE = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    assert.equal(balAfterE, balBeforeE + 950);
    // restore discount for later prepares
    await prisma.partnerProfile.update({
      where: { id: partnerId },
      data: { discountBps: 500, discountVersion: { increment: 1 } },
    });
    console.log("PASS E_refund_ignores_current_discount");

    // F. uncertain timeout → RECON, no refund
    providerCalls = 0;
    nextCheckout = {
      kind: "uncertain",
      category: "provider_timeout",
      code: "checkout_transport_error",
      providerOrderId: `PO-QA-${stamp}-F`,
    };
    const purchaseF = await prepareAndReserve("f");
    const balBeforeF = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    try {
      await executePartnerEsimProviderPurchase({
        partnerUserId,
        purchaseId: purchaseF,
        providerCheckout,
      });
      assert.fail("expected RECONCILIATION_REQUIRED");
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "RECONCILIATION_REQUIRED");
    }
    assert.equal(providerCalls, 1);
    const rowF = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchaseF },
    });
    assert.equal(rowF.status, PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED);
    assert.equal(rowF.refundTransactionId, null);
    assert.equal(rowF.providerOrderId, `PO-QA-${stamp}-F`);
    assert.equal(rowF.providerResultKind, "uncertain");
    assert.equal(rowF.safeProviderStatusCode, "checkout_transport_error");
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents,
      balBeforeF
    );
    assert.equal(
      await prisma.partnerWalletTransaction.count({
        where: {
          wallet: { partnerId },
          type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
          referenceId: purchaseF,
        },
      }),
      0
    );
    console.log("PASS F_uncertain_recon_no_refund");

    // G. providerOrderId + safe snapshot (covered by A/F; assert explicitly)
    assert.equal(rowA.providerOrderId, `PO-QA-${stamp}-A`);
    assert.equal(rowA.providerResultKind, "success");
    assert.ok(rowA.providerObservedAt);
    assert.equal(rowF.providerResultKind, "uncertain");
    assert.ok(rowF.safeProviderStatusCode);
    console.log("PASS G_provider_snapshot_persisted");

    // H. concurrent provider execution → one winner
    providerCalls = 0;
    let concurrentGate: (() => void) | null = null;
    const gatePromise = new Promise<void>((resolve) => {
      concurrentGate = resolve;
    });
    nextCheckout = successCheckout(`PO-QA-${stamp}-H`);
    const slowCheckout: PartnerProviderCheckoutExecutor = async () => {
      providerCalls += 1;
      await gatePromise;
      return nextCheckout;
    };
    const purchaseH = await prepareAndReserve("h");
    const p1 = executePartnerEsimProviderPurchase({
      partnerUserId,
      purchaseId: purchaseH,
      providerCheckout: slowCheckout,
    });
    // Allow claim to land
    await new Promise((r) => setTimeout(r, 50));
    const p2 = executePartnerEsimProviderPurchase({
      partnerUserId,
      purchaseId: purchaseH,
      providerCheckout,
    });
    let loserCode: string | null = null;
    let loserDuplicate = false;
    const loser = p2.then(
      (res) => {
        loserDuplicate = res.duplicate === true;
      },
      (error: unknown) => {
        assert.ok(error instanceof PartnerEsimPurchaseError);
        loserCode = error.code;
      }
    );
    await new Promise((r) => setTimeout(r, 50));
    concurrentGate!();
    const winner = await p1;
    await loser;
    assert.equal(winner.status, PartnerEsimPurchaseStatus.COMPLETED);
    assert.equal(providerCalls, 1);
    assert.ok(
      loserDuplicate ||
        loserCode === "PROVIDER_IN_FLIGHT" ||
        loserCode === "RECONCILIATION_REQUIRED"
    );
    // If loser raced after completion, duplicate return is also acceptable —
    // but our loser path throws; ensure single order.
    assert.equal(
      await prisma.order.count({
        where: { providerOrderId: `PO-QA-${stamp}-H` },
      }),
      1
    );
    console.log("PASS H_concurrent_single_flight");

    // I. finalize tx failure → no corrupt Order linkage
    providerCalls = 0;
    nextCheckout = successCheckout(`PO-QA-${stamp}-I`);
    const purchaseI = await prepareAndReserve("i");
    try {
      await executePartnerEsimProviderPurchase({
        partnerUserId,
        purchaseId: purchaseI,
        providerCheckout,
        afterOrderPersistInTx: async () => {
          throw new Error("SIMULATED_FINALIZE_FAILURE");
        },
      });
      assert.fail("expected RECONCILIATION_REQUIRED");
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "RECONCILIATION_REQUIRED");
    }
    assert.equal(providerCalls, 1);
    const rowI = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchaseI },
    });
    assert.equal(rowI.status, PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED);
    assert.equal(rowI.orderId, null);
    assert.equal(rowI.providerOrderId, `PO-QA-${stamp}-I`);
    assert.equal(rowI.failureCategory, "local_finalize_failed");
    // Order may exist from a committed upsert only if outside tx — our persist is in-tx so rolled back
    assert.equal(
      await prisma.order.count({
        where: { providerOrderId: `PO-QA-${stamp}-I` },
      }),
      0
    );
    console.log("PASS I_finalize_failure_no_order_link");

    // J. refund tx failure → wallet/ledger/status roll back; then recon
    providerCalls = 0;
    nextCheckout = {
      kind: "declined",
      httpStatus: 403,
      payload: {},
    };
    const purchaseJ = await prepareAndReserve("j");
    const balBeforeJ = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    try {
      await executePartnerEsimProviderPurchase({
        partnerUserId,
        purchaseId: purchaseJ,
        providerCheckout,
        afterRefundInTx: async () => {
          throw new Error("SIMULATED_REFUND_FAILURE");
        },
      });
      assert.fail("expected RECONCILIATION_REQUIRED");
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "RECONCILIATION_REQUIRED");
    }
    const rowJ = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchaseJ },
    });
    assert.equal(rowJ.status, PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED);
    assert.equal(rowJ.refundTransactionId, null);
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents,
      balBeforeJ
    );
    assert.equal(
      await prisma.partnerWalletTransaction.count({
        where: {
          wallet: { partnerId },
          type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
          referenceId: purchaseJ,
        },
      }),
      0
    );
    console.log("PASS J_refund_tx_failure_rolls_back");

    // K. invalid status / missing debit → provider not called
    providerCalls = 0;
    const prepK = await preparePartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("k"),
      verifyOffer,
    });
    try {
      await executePartnerEsimProviderPurchase({
        partnerUserId,
        purchaseId: prepK.purchaseId,
        providerCheckout,
      });
      assert.fail("expected INVALID_STATE");
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "INVALID_STATE");
    }
    assert.equal(providerCalls, 0);
    console.log("PASS K_invalid_status_no_provider");

    // L. paused provider order creation after debit (legacy stuck path) →
    // never-started refund once; provider not called.
    providerCalls = 0;
    const purchaseL = await prepareAndReserve("l");
    const balBeforeL = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    const chargeL = (
      await prisma.partnerEsimPurchase.findUniqueOrThrow({
        where: { id: purchaseL },
        select: { partnerChargeCents: true },
      })
    ).partnerChargeCents;
    await prisma.operationalControl.update({
      where: { key: OperationalControlKey.PROVIDER_ORDER_CREATION },
      data: { paused: true },
    });
    try {
      await executePartnerEsimProviderPurchase({
        partnerUserId,
        purchaseId: purchaseL,
        providerCheckout,
      });
      assert.fail("expected PROVIDER_FAILED");
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "PROVIDER_FAILED");
    }
    assert.equal(providerCalls, 0);
    const rowL = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchaseL },
    });
    assert.equal(rowL.status, PartnerEsimPurchaseStatus.FAILED_REFUNDED);
    assert.ok(rowL.refundTransactionId);
    const balAfterL = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    assert.equal(balAfterL, balBeforeL + chargeL);
    await prisma.operationalControl.update({
      where: { key: OperationalControlKey.PROVIDER_ORDER_CREATION },
      data: { paused: false },
    });
    console.log("PASS L_provider_creation_paused_never_started_refund");

    // L2. paused BEFORE debit → no permanent wallet debit / no PROVIDER_PENDING
    await prisma.operationalControl.update({
      where: { key: OperationalControlKey.PROVIDER_ORDER_CREATION },
      data: { paused: true },
    });
    const balBeforeL2 = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    const prepL2 = await preparePartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("l2"),
      verifyOffer,
    });
    try {
      await reservePartnerEsimPurchase({
        partnerUserId,
        purchaseId: prepL2.purchaseId,
        verifyOffer,
      });
      assert.fail("expected UNAVAILABLE before debit");
    } catch (error) {
      assert.ok(error instanceof PartnerEsimPurchaseError);
      assert.equal(error.code, "UNAVAILABLE");
    }
    const rowL2 = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: prepL2.purchaseId },
    });
    assert.notEqual(rowL2.status, PartnerEsimPurchaseStatus.PROVIDER_PENDING);
    assert.equal(rowL2.debitTransactionId, null);
    const balAfterL2 = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    assert.equal(balAfterL2, balBeforeL2);
    await prisma.operationalControl.update({
      where: { key: OperationalControlKey.PROVIDER_ORDER_CREATION },
      data: { paused: false },
    });
    console.log("PASS L2_provider_creation_paused_before_debit");

    // M. customer wallet untouched
    const customerWalletAfter = (
      await prisma.walletAccount.findUniqueOrThrow({
        where: { userId: customer.id },
      })
    ).balanceCents;
    assert.equal(customerWalletAfter, customerWalletBefore);
    assert.equal(
      await prisma.walletTransaction.count({
        where: { wallet: { userId: customer.id } },
      }),
      0
    );
    console.log("PASS M_customer_wallet_untouched");

    console.log("ALL PASS qa-partner-purchase-provider");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
