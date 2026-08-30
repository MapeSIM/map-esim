/**
 * Temporary Preview-only wallet eSIM local-finalization UAT harness.
 * Creates TEST-labelled fixtures and invokes the same finalize path as production
 * AFTER synthetic provider success. Never calls VeSIM / gateway / real emails.
 */
import "server-only";

import {
  OrderFundingSource,
  Role,
  WalletCurrency,
  WalletEsimPurchaseStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/app/lib/db";
import {
  finalizeWalletPurchaseAfterProviderSuccess,
  reserveWalletPurchaseFundsInTx,
  WALLET_PURCHASE_DEBIT_REF,
  WalletEsimPurchaseError,
} from "@/app/lib/esim/walletPurchase";
import {
  assertPreviewWalletFinalizeUatGate,
  PREVIEW_WALLET_FINALIZE_UAT_EMAIL_MARKER,
  PREVIEW_WALLET_FINALIZE_UAT_IDEMPOTENCY_PREFIX,
  PREVIEW_WALLET_FINALIZE_UAT_PROVIDER_PREFIX,
} from "@/app/lib/esim/previewWalletFinalizeUatGate";
import type { VerifiedCheckoutOffer } from "@/app/lib/vesim/server";

export type PreviewWalletFinalizeUatScenario =
  | "happy"
  | "replay"
  | "post_commit_promo_failure"
  | "critical_failure";

export type PreviewWalletFinalizeUatResult = {
  scenario: PreviewWalletFinalizeUatScenario;
  runId: string;
  purchaseId: string;
  customerUserId: string;
  debitTransactionId: string;
  providerOrderId: string;
  orderId: string | null;
  purchaseStatus: WalletEsimPurchaseStatus;
  debitStatus: WalletTransactionStatus | null;
  providerResultKind: string | null;
  failureCategory: string | null;
  orderCountForProvider: number;
  debitCompletedCount: number;
  pass: boolean;
  notes: string[];
};

function testOffer(): VerifiedCheckoutOffer {
  return {
    offerId: "TEST-WLF-OFFER-001",
    name: "TEST WLF Package",
    countryCode: "PK",
    countryName: "Pakistan",
    dataFormatted: "1 GB",
    durationDays: 7,
    priceUSD: 5,
    providerPriceUSD: 2.5,
    currency: "USD",
  };
}

function newRunId(): string {
  return randomBytes(6).toString("hex");
}

async function createPostProviderSuccessFixture(options: {
  runId: string;
  adminUserId: string;
}): Promise<{
  purchaseId: string;
  customerUserId: string;
  debitTransactionId: string;
  providerOrderId: string;
  priceCents: number;
}> {
  assertPreviewWalletFinalizeUatGate();
  const offer = testOffer();
  const priceCents = Math.round(offer.priceUSD * 100);
  const email = `test-wlf-${options.runId}@${PREVIEW_WALLET_FINALIZE_UAT_EMAIL_MARKER}`;
  const providerOrderId = `${PREVIEW_WALLET_FINALIZE_UAT_PROVIDER_PREFIX}-${options.runId}`;
  const idempotencyKey = `${PREVIEW_WALLET_FINALIZE_UAT_IDEMPOTENCY_PREFIX}${options.runId}`;

  const created = await prisma.$transaction(async (tx) => {
    const customer = await tx.user.create({
      data: {
        email,
        name: `TEST WLF ${options.runId}`,
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });

    await tx.walletAccount.create({
      data: {
        userId: customer.id,
        balanceCents: priceCents + 2500,
        currency: WalletCurrency.USD,
      },
    });

    const purchase = await tx.walletEsimPurchase.create({
      data: {
        customerUserId: customer.id,
        adminUserId: options.adminUserId,
        assistedPurchaseReason: `TEST WLF preview harness ${options.runId}`,
        offerId: offer.offerId,
        destinationCode: offer.countryCode,
        destinationName: offer.countryName,
        planName: offer.name,
        dataAllowance: offer.dataFormatted,
        validity: `${offer.durationDays} Days`,
        priceCents,
        promoDiscountCents: 0,
        useWallet: true,
        useRewards: false,
        rewardPointsRedeemed: 0,
        walletAppliedCents: priceCents,
        gatewayAmountCents: 0,
        currency: "USD",
        fundingSource: OrderFundingSource.CUSTOMER_WALLET,
        status: WalletEsimPurchaseStatus.FUNDS_RESERVED,
        idempotencyKey,
      },
      select: { id: true },
    });

    const reserved = await reserveWalletPurchaseFundsInTx(tx, {
      purchaseId: purchase.id,
      customerUserId: customer.id,
      amountCents: priceCents,
      debitIdempotencyKey: `debit_${idempotencyKey}`,
    });

    await tx.walletEsimPurchase.update({
      where: { id: purchase.id },
      data: {
        status: WalletEsimPurchaseStatus.PROVIDER_PENDING,
        debitTransactionId: reserved.debitTransactionId,
      },
    });

    return {
      purchaseId: purchase.id,
      customerUserId: customer.id,
      debitTransactionId: reserved.debitTransactionId,
      providerOrderId,
      priceCents,
      customerEmail: customer.email,
    };
  });

  return created;
}

async function snapshotOutcome(options: {
  scenario: PreviewWalletFinalizeUatScenario;
  runId: string;
  purchaseId: string;
  customerUserId: string;
  debitTransactionId: string;
  providerOrderId: string;
  orderId: string | null;
  notes: string[];
  pass: boolean;
}): Promise<PreviewWalletFinalizeUatResult> {
  const purchase = await prisma.walletEsimPurchase.findUnique({
    where: { id: options.purchaseId },
    select: {
      status: true,
      orderId: true,
      providerResultKind: true,
      failureCategory: true,
      providerOrderId: true,
    },
  });
  const debit = await prisma.walletTransaction.findUnique({
    where: { id: options.debitTransactionId },
    select: { status: true },
  });
  const orderCountForProvider = await prisma.order.count({
    where: { providerOrderId: options.providerOrderId },
  });
  const debitCompletedCount = await prisma.walletTransaction.count({
    where: {
      id: options.debitTransactionId,
      status: WalletTransactionStatus.COMPLETED,
      type: WalletTransactionType.PURCHASE_DEBIT,
      referenceType: WALLET_PURCHASE_DEBIT_REF,
    },
  });

  return {
    scenario: options.scenario,
    runId: options.runId,
    purchaseId: options.purchaseId,
    customerUserId: options.customerUserId,
    debitTransactionId: options.debitTransactionId,
    providerOrderId: options.providerOrderId,
    orderId: purchase?.orderId ?? options.orderId,
    purchaseStatus:
      purchase?.status ?? WalletEsimPurchaseStatus.PROVIDER_PENDING,
    debitStatus: debit?.status ?? null,
    providerResultKind: purchase?.providerResultKind ?? null,
    failureCategory: purchase?.failureCategory ?? null,
    orderCountForProvider,
    debitCompletedCount,
    pass: options.pass,
    notes: options.notes,
  };
}

function evaluateHappy(result: Omit<PreviewWalletFinalizeUatResult, "pass" | "notes" | "scenario" | "runId"> & {
  notes: string[];
}): boolean {
  const ok =
    result.orderCountForProvider === 1 &&
    result.debitStatus === WalletTransactionStatus.COMPLETED &&
    result.purchaseStatus === WalletEsimPurchaseStatus.COMPLETED &&
    result.failureCategory == null &&
    result.providerResultKind === "success" &&
    result.debitCompletedCount === 1;
  if (!ok) {
    result.notes.push("happy_path_assertions_failed");
  }
  return ok;
}

/**
 * Run one UAT scenario. Never calls VeSIM.
 */
export async function runPreviewWalletFinalizeUat(options: {
  adminUserId: string;
  scenario: PreviewWalletFinalizeUatScenario;
  /** For replay: reuse an existing happy-path purchase id from this harness. */
  existingPurchaseId?: string | null;
}): Promise<PreviewWalletFinalizeUatResult> {
  assertPreviewWalletFinalizeUatGate();
  const adminUserId = options.adminUserId.trim();
  if (!adminUserId) {
    throw new Error("WALLET_FINALIZE_UAT_REFUSED: missing_admin");
  }

  const offer = testOffer();
  const notes: string[] = [];

  if (options.scenario === "replay") {
    const purchaseId = (options.existingPurchaseId ?? "").trim();
    if (!purchaseId) {
      throw new Error("WALLET_FINALIZE_UAT_REFUSED: replay_requires_purchase_id");
    }
    const existing = await prisma.walletEsimPurchase.findUnique({
      where: { id: purchaseId },
      select: {
        id: true,
        customerUserId: true,
        debitTransactionId: true,
        providerOrderId: true,
        orderId: true,
        priceCents: true,
        currency: true,
        offerId: true,
        customer: { select: { email: true } },
        assistedPurchaseReason: true,
      },
    });
    if (
      !existing?.providerOrderId?.startsWith(
        PREVIEW_WALLET_FINALIZE_UAT_PROVIDER_PREFIX
      ) ||
      !existing.debitTransactionId ||
      !existing.customer.email.includes(PREVIEW_WALLET_FINALIZE_UAT_EMAIL_MARKER)
    ) {
      throw new Error("WALLET_FINALIZE_UAT_REFUSED: not_a_test_fixture");
    }

    const beforeOrders = await prisma.order.count({
      where: { providerOrderId: existing.providerOrderId },
    });
    const finalized = await finalizeWalletPurchaseAfterProviderSuccess({
      purchaseId: existing.id,
      customerUserId: existing.customerUserId,
      customerEmail: existing.customer.email,
      actorUserId: adminUserId,
      assisted: true,
      assistedAdminUserId: adminUserId,
      assistedReason: existing.assistedPurchaseReason,
      snapshot: {
        offerId: existing.offerId,
        priceCents: existing.priceCents,
        currency: existing.currency,
      },
      verifiedOffer: offer,
      successCheckout: {
        providerOrderId: existing.providerOrderId,
        payload: { uat: true, source: "preview_wallet_finalize_uat" },
      },
      uat: {
        skipEmail: true,
        skipWalletNotification: true,
      },
    });
    const after = await snapshotOutcome({
      scenario: "replay",
      runId: "replay",
      purchaseId: existing.id,
      customerUserId: existing.customerUserId,
      debitTransactionId: existing.debitTransactionId,
      providerOrderId: existing.providerOrderId,
      orderId: finalized.orderId,
      notes,
      pass: false,
    });
    const pass =
      after.orderCountForProvider === 1 &&
      after.orderCountForProvider === beforeOrders &&
      after.debitCompletedCount === 1 &&
      after.purchaseStatus === WalletEsimPurchaseStatus.COMPLETED;
    if (!pass) notes.push("replay_produced_duplicate_or_incomplete");
    return { ...after, pass, notes };
  }

  const runId = newRunId();
  const fixture = await createPostProviderSuccessFixture({
    runId,
    adminUserId,
  });

  const uatFlags =
    options.scenario === "critical_failure"
      ? {
          skipEmail: true,
          skipWalletNotification: true,
          injectCriticalTxFailure: true,
        }
      : options.scenario === "post_commit_promo_failure"
        ? {
            skipEmail: true,
            skipWalletNotification: true,
            injectPostCommitPromoFailure: true,
          }
        : {
            skipEmail: true,
            skipWalletNotification: true,
          };

  let orderId: string | null = null;
  let caughtRecon = false;
  try {
    const finalized = await finalizeWalletPurchaseAfterProviderSuccess({
      purchaseId: fixture.purchaseId,
      customerUserId: fixture.customerUserId,
      customerEmail: `test-wlf-${runId}@${PREVIEW_WALLET_FINALIZE_UAT_EMAIL_MARKER}`,
      actorUserId: adminUserId,
      assisted: true,
      assistedAdminUserId: adminUserId,
      assistedReason: `TEST WLF preview harness ${runId}`,
      snapshot: {
        offerId: offer.offerId,
        priceCents: fixture.priceCents,
        currency: "USD",
      },
      verifiedOffer: offer,
      successCheckout: {
        providerOrderId: fixture.providerOrderId,
        payload: { uat: true, source: "preview_wallet_finalize_uat" },
      },
      uat: uatFlags,
    });
    orderId = finalized.orderId;
  } catch (error) {
    if (
      error instanceof WalletEsimPurchaseError &&
      error.code === "RECONCILIATION_REQUIRED"
    ) {
      caughtRecon = true;
      notes.push("caught_reconciliation_required");
    } else {
      throw error;
    }
  }

  const after = await snapshotOutcome({
    scenario: options.scenario,
    runId,
    purchaseId: fixture.purchaseId,
    customerUserId: fixture.customerUserId,
    debitTransactionId: fixture.debitTransactionId,
    providerOrderId: fixture.providerOrderId,
    orderId,
    notes,
    pass: false,
  });

  if (options.scenario === "critical_failure") {
    const pass =
      caughtRecon &&
      after.providerResultKind === "success" &&
      after.purchaseStatus ===
        WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED &&
      after.orderCountForProvider === 0 &&
      after.debitStatus === WalletTransactionStatus.PENDING &&
      Boolean(after.providerOrderId?.startsWith(PREVIEW_WALLET_FINALIZE_UAT_PROVIDER_PREFIX));
    if (!pass) notes.push("critical_failure_assertions_failed");
    return { ...after, pass, notes };
  }

  if (options.scenario === "post_commit_promo_failure") {
    const pass = evaluateHappy(after);
    if (pass) notes.push("order_debit_survived_injected_promo_failure");
    return { ...after, pass, notes };
  }

  // happy
  const pass = evaluateHappy(after);
  return { ...after, pass, notes };
}

/**
 * Delete ONLY TEST WLF fixture rows created by this harness.
 */
export async function cleanupPreviewWalletFinalizeUatFixtures(): Promise<{
  purchasesDeleted: number;
  ordersDeleted: number;
  usersDeleted: number;
  debitsDeleted: number;
}> {
  assertPreviewWalletFinalizeUatGate();

  const purchases = await prisma.walletEsimPurchase.findMany({
    where: {
      OR: [
        {
          providerOrderId: {
            startsWith: PREVIEW_WALLET_FINALIZE_UAT_PROVIDER_PREFIX,
          },
        },
        {
          idempotencyKey: {
            startsWith: PREVIEW_WALLET_FINALIZE_UAT_IDEMPOTENCY_PREFIX,
          },
        },
        {
          customer: {
            email: { contains: PREVIEW_WALLET_FINALIZE_UAT_EMAIL_MARKER },
          },
        },
      ],
    },
    select: {
      id: true,
      orderId: true,
      debitTransactionId: true,
      customerUserId: true,
      providerOrderId: true,
    },
  });

  const orderIds = purchases
    .map((p) => p.orderId)
    .filter((id): id is string => Boolean(id));
  const debitIds = purchases
    .map((p) => p.debitTransactionId)
    .filter((id): id is string => Boolean(id));
  const customerIds = [...new Set(purchases.map((p) => p.customerUserId))];
  const providerOrderIds = purchases
    .map((p) => p.providerOrderId)
    .filter(
      (id): id is string =>
        Boolean(id?.startsWith(PREVIEW_WALLET_FINALIZE_UAT_PROVIDER_PREFIX))
    );

  const extraOrders = await prisma.order.findMany({
    where: {
      OR: [
        { id: { in: orderIds } },
        { providerOrderId: { in: providerOrderIds } },
      ],
    },
    select: { id: true },
  });
  const allOrderIds = [...new Set(extraOrders.map((o) => o.id))];

  await prisma.$transaction(async (tx) => {
    if (purchases.length) {
      await tx.walletEsimPurchase.deleteMany({
        where: { id: { in: purchases.map((p) => p.id) } },
      });
    }
    if (allOrderIds.length) {
      await tx.order.deleteMany({ where: { id: { in: allOrderIds } } });
    }
    if (debitIds.length) {
      await tx.walletTransaction.deleteMany({
        where: {
          id: { in: debitIds },
          referenceType: WALLET_PURCHASE_DEBIT_REF,
        },
      });
    }
    if (customerIds.length) {
      await tx.walletAccount.deleteMany({
        where: { userId: { in: customerIds } },
      });
      await tx.user.deleteMany({
        where: {
          id: { in: customerIds },
          email: { contains: PREVIEW_WALLET_FINALIZE_UAT_EMAIL_MARKER },
          role: Role.CUSTOMER,
        },
      });
    }
  });

  return {
    purchasesDeleted: purchases.length,
    ordersDeleted: allOrderIds.length,
    usersDeleted: customerIds.length,
    debitsDeleted: debitIds.length,
  };
}
