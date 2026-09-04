/**
 * Partner eSIM provider execution + success / confirmed-failure / reconciliation.
 * Debit already happened at reserve. Never debits again. Never auto-refunds uncertain.
 */
import "server-only";

import {
  OrderFundingSource,
  OrderStatus,
  PartnerEsimPurchaseStatus,
  Prisma,
  Role,
} from "@prisma/client";
import {
  OperationalControlBlockedError,
  OperationalControlUnavailableError,
} from "@/app/lib/admin/operationalControlsPolicy";
import { OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE } from "@/app/lib/admin/operationalControlsShared";
import { prisma } from "@/app/lib/db";
import {
  persistPartnerPurchaseProviderObservation,
  type ProviderResultKind,
} from "@/app/lib/esim/providerResultPersist";
import { persistAssignedOrder } from "@/app/lib/orders/persistAssignedOrder";
import { classifyOrderPersistError } from "@/app/lib/orders/orderPersistError";
import { PartnerEsimPurchaseError } from "@/app/lib/partner/partnerEsimPurchase";
import { assertPartnerPreDebitProviderGates } from "@/app/lib/partner/partnerPurchaseGuards";
import {
  PartnerPurchaseWalletError,
  refundPartnerPurchaseFundsInTx,
} from "@/app/lib/partner/partnerPurchaseWallet";
import { schedulePartnerReconciliationRequiredNotification } from "@/app/lib/partner/partnerReconciliationRequiredNotification";
import {
  executeCreditCheckout,
  type CreditCheckoutResult,
} from "@/app/lib/vesim/creditCheckout";
import { VesimEnvironmentError } from "@/app/lib/vesim/environment";
import type { VerifiedCheckoutOffer } from "@/app/lib/vesim/server";

export const PARTNER_ESIM_PURCHASE_COMPLETED_AUDIT =
  "partner.esim_purchase_completed";
export const PARTNER_ESIM_PURCHASE_FAILED_REFUNDED_AUDIT =
  "partner.esim_purchase_failed_refunded";
export const PARTNER_ESIM_PURCHASE_RECONCILIATION_AUDIT =
  "partner.esim_purchase_reconciliation_required";

export type PartnerProviderCheckoutExecutor = (options: {
  offerId: string;
  customerEmail?: string;
}) => Promise<CreditCheckoutResult>;

export type ExecutePartnerEsimProviderPurchaseInput = {
  partnerUserId: string;
  purchaseId: string;
  /** Test seam only — defaults to executeCreditCheckout. */
  providerCheckout?: PartnerProviderCheckoutExecutor;
  /**
   * Test seam only — runs inside the success finalization transaction after Order persist.
   * Throw to force full tx rollback (no Order linkage).
   */
  afterOrderPersistInTx?: (tx: Prisma.TransactionClient) => Promise<void>;
  /**
   * Test seam only — runs inside the confirmed-failure refund transaction after ledger credit.
   * Throw to force full wallet/status rollback.
   */
  afterRefundInTx?: (tx: Prisma.TransactionClient) => Promise<void>;
};

export type ExecutePartnerEsimProviderPurchaseResult = {
  purchaseId: string;
  partnerId: string;
  status: PartnerEsimPurchaseStatus;
  orderId: string | null;
  refundTransactionId: string | null;
  duplicate: boolean;
};

function mapWalletError(error: unknown): never {
  if (error instanceof PartnerPurchaseWalletError) {
    if (error.code === "WALLET_UNAVAILABLE") {
      throw new PartnerEsimPurchaseError(
        "WALLET_UNAVAILABLE",
        "Partner wallet is unavailable."
      );
    }
    if (error.code === "PARTNER_UNAVAILABLE") {
      throw new PartnerEsimPurchaseError(
        "PARTNER_UNAVAILABLE",
        "Partner is unavailable."
      );
    }
    throw new PartnerEsimPurchaseError("UNAVAILABLE", error.message);
  }
  throw error;
}

function isDeterministicPreProviderGateError(error: unknown): boolean {
  return (
    error instanceof OperationalControlBlockedError ||
    error instanceof OperationalControlUnavailableError ||
    error instanceof VesimEnvironmentError ||
    (error instanceof PartnerEsimPurchaseError && error.code === "UNAVAILABLE")
  );
}

function throwMappedPreProviderGateError(error: unknown): never {
  if (
    error instanceof OperationalControlBlockedError ||
    error instanceof OperationalControlUnavailableError
  ) {
    throw new PartnerEsimPurchaseError(
      "UNAVAILABLE",
      OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE
    );
  }
  if (error instanceof VesimEnvironmentError) {
    throw new PartnerEsimPurchaseError(
      "UNAVAILABLE",
      "Provider configuration is unavailable. Please try again later."
    );
  }
  throw error;
}

function assertPositiveCommercial(purchase: {
  retailPriceCents: number;
  partnerChargeCents: number;
  providerCostCents: number;
  discountBps: number;
  discountVersion: number;
}): void {
  if (
    !Number.isInteger(purchase.retailPriceCents) ||
    purchase.retailPriceCents <= 0 ||
    !Number.isInteger(purchase.partnerChargeCents) ||
    purchase.partnerChargeCents <= 0 ||
    !Number.isInteger(purchase.providerCostCents) ||
    purchase.providerCostCents < 0 ||
    !Number.isInteger(purchase.discountBps) ||
    purchase.discountBps < 0 ||
    !Number.isInteger(purchase.discountVersion) ||
    purchase.discountVersion < 1
  ) {
    throw new PartnerEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }
}

/** Rebuild offer snapshot from immutable purchase fields — no live VeSIM. */
export function verifiedOfferFromPartnerPurchase(purchase: {
  offerId: string;
  planName: string | null;
  destinationCode: string | null;
  destinationName: string | null;
  dataAllowance: string | null;
  validity: string | null;
  retailPriceCents: number;
  providerCostCents: number;
  currency: string;
}): VerifiedCheckoutOffer {
  const validity = (purchase.validity ?? "").trim();
  const daysMatch = /^(\d+)\s*Days?$/i.exec(validity);
  return {
    offerId: purchase.offerId,
    name: (purchase.planName ?? "").trim() || "eSIM",
    countryCode: purchase.destinationCode,
    countryName: purchase.destinationName || purchase.destinationCode,
    dataFormatted: (purchase.dataAllowance ?? "").trim(),
    durationDays: daysMatch ? Number(daysMatch[1]) : null,
    priceUSD: purchase.retailPriceCents / 100,
    providerPriceUSD: purchase.providerCostCents / 100,
    currency: (purchase.currency || "USD").trim().toUpperCase() || "USD",
  };
}

async function loadActivePartnerActor(partnerUserId: string) {
  const id = partnerUserId.trim();
  if (!id || id.length > 64) {
    throw new PartnerEsimPurchaseError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      role: true,
      deletedAt: true,
      partnerProfile: {
        select: {
          id: true,
          disabledAt: true,
        },
      },
    },
  });

  if (
    !user ||
    user.deletedAt ||
    user.role !== Role.PARTNER ||
    !user.partnerProfile ||
    user.partnerProfile.disabledAt ||
    !user.email
  ) {
    throw new PartnerEsimPurchaseError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }

  return {
    partnerUserId: user.id,
    partnerEmail: user.email,
    partnerId: user.partnerProfile.id,
  };
}

/**
 * Durable single-flight: claim providerRefreshClaimedAt while PROVIDER_PENDING.
 * Never stale-reclaims — a crash mid-provider must not blind-retry.
 */
async function claimPartnerProviderExecution(
  purchaseId: string
): Promise<boolean> {
  const claimed = await prisma.partnerEsimPurchase.updateMany({
    where: {
      id: purchaseId,
      status: PartnerEsimPurchaseStatus.PROVIDER_PENDING,
      debitTransactionId: { not: null },
      orderId: null,
      refundTransactionId: null,
      providerRefreshClaimedAt: null,
    },
    data: {
      providerRefreshClaimedAt: new Date(),
    },
  });
  return claimed.count === 1;
}

async function markPartnerReconciliationRequired(options: {
  purchaseId: string;
  partnerUserId: string;
  category: string;
  code: string;
  persistDiagnostic?: {
    persistErrorCode: string;
    family: string;
    targetEntity: "Order";
    providerOrderId?: string | null;
  };
  providerObservation?: {
    providerOrderId?: string | null;
    providerResultKind: ProviderResultKind;
    safeProviderStatusCode?: string | null;
  };
}): Promise<never> {
  if (options.providerObservation) {
    await persistPartnerPurchaseProviderObservation(options.purchaseId, {
      providerOrderId: options.providerObservation.providerOrderId,
      providerResultKind: options.providerObservation.providerResultKind,
      safeProviderStatusCode:
        options.providerObservation.safeProviderStatusCode,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.partnerEsimPurchase.update({
      where: { id: options.purchaseId },
      data: {
        status: PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
        failureCategory: options.category,
        failureCode: options.code,
        reconciliationState: "awaiting_manual_review",
        providerRefreshClaimedAt: null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: options.partnerUserId,
        action: PARTNER_ESIM_PURCHASE_RECONCILIATION_AUDIT,
        targetType: "PartnerEsimPurchase",
        targetId: options.purchaseId,
        metadata: {
          purchaseId: options.purchaseId,
          fundingSource: OrderFundingSource.PARTNER_BALANCE,
          failureCategory: options.category,
          failureCode: options.code,
          reconEmail: "scheduled",
          ...(options.persistDiagnostic
            ? {
                persistErrorCode: options.persistDiagnostic.persistErrorCode,
                persistErrorFamily: options.persistDiagnostic.family,
                persistTargetEntity: options.persistDiagnostic.targetEntity,
                ...(options.persistDiagnostic.providerOrderId
                  ? {
                      providerOrderId:
                        options.persistDiagnostic.providerOrderId,
                    }
                  : {}),
              }
            : {}),
        } satisfies Prisma.InputJsonValue,
      },
    });
  });

  schedulePartnerReconciliationRequiredNotification(options.purchaseId);

  throw new PartnerEsimPurchaseError(
    "RECONCILIATION_REQUIRED",
    "This purchase requires reconciliation. Do not retry."
  );
}

async function refundConfirmedProviderFailure(options: {
  purchaseId: string;
  partnerId: string;
  partnerUserId: string;
  /** Immutable snapshot — never recalculate. */
  partnerChargeCents: number;
  providerObservation: {
    providerOrderId?: string | null;
    providerResultKind: ProviderResultKind;
    safeProviderStatusCode?: string | null;
  };
  afterRefundInTx?: (tx: Prisma.TransactionClient) => Promise<void>;
}): Promise<string> {
  try {
    const refundTransactionId = await prisma.$transaction(async (tx) => {
      const current = await tx.partnerEsimPurchase.findUnique({
        where: { id: options.purchaseId },
        select: {
          status: true,
          partnerChargeCents: true,
          refundTransactionId: true,
          debitTransactionId: true,
        },
      });

      if (
        current?.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED &&
        current.refundTransactionId
      ) {
        return current.refundTransactionId;
      }

      if (current?.status !== PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
        throw new PartnerEsimPurchaseError(
          "RECONCILIATION_REQUIRED",
          "This purchase requires reconciliation. Do not retry."
        );
      }

      if (
        !current.debitTransactionId ||
        current.partnerChargeCents !== options.partnerChargeCents
      ) {
        throw new PartnerEsimPurchaseError(
          "INVALID_STATE",
          "This purchase is unavailable."
        );
      }

      const refunded = await refundPartnerPurchaseFundsInTx(tx, {
        partnerId: options.partnerId,
        partnerEsimPurchaseId: options.purchaseId,
        amountCents: options.partnerChargeCents,
      });

      if (options.afterRefundInTx) {
        await options.afterRefundInTx(tx);
      }

      await persistPartnerPurchaseProviderObservation(
        options.purchaseId,
        {
          providerOrderId: options.providerObservation.providerOrderId,
          providerResultKind: options.providerObservation.providerResultKind,
          safeProviderStatusCode:
            options.providerObservation.safeProviderStatusCode,
        },
        tx
      );

      await tx.partnerEsimPurchase.update({
        where: { id: options.purchaseId },
        data: {
          status: PartnerEsimPurchaseStatus.FAILED_REFUNDED,
          refundTransactionId: refunded.transactionId,
          failureCategory: "provider_declined",
          failureCode: "refunded",
          providerRefreshClaimedAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: options.partnerUserId,
          action: PARTNER_ESIM_PURCHASE_FAILED_REFUNDED_AUDIT,
          targetType: "PartnerEsimPurchase",
          targetId: options.purchaseId,
          metadata: {
            purchaseId: options.purchaseId,
            fundingSource: OrderFundingSource.PARTNER_BALANCE,
            partnerChargeCents: options.partnerChargeCents,
            refundTransactionId: refunded.transactionId,
            refundOutcome: refunded.outcome,
          } satisfies Prisma.InputJsonValue,
        },
      });

      return refunded.transactionId;
    });
    return refundTransactionId;
  } catch (error) {
    if (error instanceof PartnerEsimPurchaseError) throw error;
    mapWalletError(error);
  }
}

/**
 * Safe recovery when VeSIM was never claimed/called (no providerOrderId).
 * Uses the same confirmed-failure refund path + partner_esim_refund_<id> idempotency.
 */
export async function refundNeverStartedPartnerEsimPurchase(options: {
  purchaseId: string;
  partnerUserId: string;
  expectedPartnerChargeCents: number;
}): Promise<{ refundTransactionId: string; idempotent: boolean }> {
  const purchaseId = options.purchaseId.trim();
  const purchase = await prisma.partnerEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      partnerId: true,
      status: true,
      partnerChargeCents: true,
      debitTransactionId: true,
      refundTransactionId: true,
      providerOrderId: true,
      orderId: true,
      providerRefreshClaimedAt: true,
      providerResultKind: true,
    },
  });
  if (!purchase) {
    throw new PartnerEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }
  if (
    purchase.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED &&
    purchase.refundTransactionId
  ) {
    return {
      refundTransactionId: purchase.refundTransactionId,
      idempotent: true,
    };
  }
  if (purchase.status !== PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
    throw new PartnerEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }
  if (
    purchase.providerOrderId ||
    purchase.orderId ||
    purchase.providerRefreshClaimedAt ||
    purchase.providerResultKind
  ) {
    throw new PartnerEsimPurchaseError(
      "RECONCILIATION_REQUIRED",
      "This purchase requires reconciliation. Do not retry."
    );
  }
  if (
    !purchase.debitTransactionId ||
    purchase.partnerChargeCents !== options.expectedPartnerChargeCents
  ) {
    throw new PartnerEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  const refundTransactionId = await refundConfirmedProviderFailure({
    purchaseId: purchase.id,
    partnerId: purchase.partnerId,
    partnerUserId: options.partnerUserId,
    partnerChargeCents: purchase.partnerChargeCents,
    providerObservation: {
      providerOrderId: null,
      providerResultKind: "declined",
      safeProviderStatusCode: "provider_never_started",
    },
  });
  return { refundTransactionId, idempotent: false };
}

/**
 * Execute provider PURCHASE for an existing PROVIDER_PENDING Partner purchase.
 * Never debits. Confirmed decline → exact partnerChargeCents refund.
 * Uncertain → RECONCILIATION_REQUIRED (no refund).
 */
export async function executePartnerEsimProviderPurchase(
  input: ExecutePartnerEsimProviderPurchaseInput
): Promise<ExecutePartnerEsimProviderPurchaseResult> {
  const purchaseId = input.purchaseId.trim();
  if (!purchaseId || purchaseId.length > 64) {
    throw new PartnerEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  const partner = await loadActivePartnerActor(input.partnerUserId);
  const checkoutFn = input.providerCheckout ?? executeCreditCheckout;

  const purchase = await prisma.partnerEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      partnerId: true,
      offerId: true,
      status: true,
      retailPriceCents: true,
      discountBps: true,
      discountVersion: true,
      partnerChargeCents: true,
      providerCostCents: true,
      currency: true,
      debitTransactionId: true,
      refundTransactionId: true,
      orderId: true,
      providerOrderId: true,
      providerRefreshClaimedAt: true,
      planName: true,
      destinationCode: true,
      destinationName: true,
      dataAllowance: true,
      validity: true,
    },
  });

  if (!purchase || purchase.partnerId !== partner.partnerId) {
    throw new PartnerEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  if (purchase.status === PartnerEsimPurchaseStatus.COMPLETED) {
    return {
      purchaseId: purchase.id,
      partnerId: partner.partnerId,
      status: PartnerEsimPurchaseStatus.COMPLETED,
      orderId: purchase.orderId,
      refundTransactionId: null,
      duplicate: true,
    };
  }

  if (purchase.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED) {
    throw new PartnerEsimPurchaseError(
      "PROVIDER_FAILED",
      "This purchase failed and the Partner wallet amount was restored."
    );
  }

  if (purchase.status === PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED) {
    throw new PartnerEsimPurchaseError(
      "RECONCILIATION_REQUIRED",
      "This purchase requires reconciliation. Do not retry."
    );
  }

  if (purchase.status !== PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
    throw new PartnerEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is not ready for provider execution."
    );
  }

  if (!purchase.debitTransactionId) {
    throw new PartnerEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is under review. Please contact support."
    );
  }

  assertPositiveCommercial(purchase);

  // Defense in depth: pre-VeSIM gates should already have passed before debit.
  // If they fail here with never-started provider evidence, compensate exactly once.
  try {
    await assertPartnerPreDebitProviderGates();
  } catch (error) {
    const neverStarted =
      !purchase.providerOrderId &&
      !purchase.orderId &&
      !purchase.providerRefreshClaimedAt;
    if (neverStarted && isDeterministicPreProviderGateError(error)) {
      await refundConfirmedProviderFailure({
        purchaseId: purchase.id,
        partnerId: partner.partnerId,
        partnerUserId: partner.partnerUserId,
        partnerChargeCents: purchase.partnerChargeCents,
        providerObservation: {
          providerOrderId: null,
          providerResultKind: "declined",
          safeProviderStatusCode: "pre_provider_gate_blocked",
        },
        afterRefundInTx: input.afterRefundInTx,
      });
      throw new PartnerEsimPurchaseError(
        "PROVIDER_FAILED",
        "The provider could not complete this purchase. The Partner wallet amount was restored."
      );
    }
    throwMappedPreProviderGateError(error);
  }

  const claimed = await claimPartnerProviderExecution(purchase.id);
  if (!claimed) {
    const again = await prisma.partnerEsimPurchase.findUnique({
      where: { id: purchase.id },
      select: {
        status: true,
        orderId: true,
        refundTransactionId: true,
        providerRefreshClaimedAt: true,
      },
    });
    if (again?.status === PartnerEsimPurchaseStatus.COMPLETED && again.orderId) {
      return {
        purchaseId: purchase.id,
        partnerId: partner.partnerId,
        status: PartnerEsimPurchaseStatus.COMPLETED,
        orderId: again.orderId,
        refundTransactionId: null,
        duplicate: true,
      };
    }
    if (
      again?.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED &&
      again.refundTransactionId
    ) {
      throw new PartnerEsimPurchaseError(
        "PROVIDER_FAILED",
        "This purchase failed and the Partner wallet amount was restored."
      );
    }
    if (again?.status === PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED) {
      throw new PartnerEsimPurchaseError(
        "RECONCILIATION_REQUIRED",
        "This purchase requires reconciliation. Do not retry."
      );
    }
    throw new PartnerEsimPurchaseError(
      "PROVIDER_IN_FLIGHT",
      "This purchase is already being processed. Do not retry."
    );
  }

  // External provider write — outside Prisma transaction. Never blind-retry.
  const checkout = await checkoutFn({
    offerId: purchase.offerId,
    customerEmail: partner.partnerEmail,
  });

  if (checkout.kind === "declined") {
    try {
      await refundConfirmedProviderFailure({
        purchaseId: purchase.id,
        partnerId: partner.partnerId,
        partnerUserId: partner.partnerUserId,
        partnerChargeCents: purchase.partnerChargeCents,
        providerObservation: {
          providerOrderId: null,
          providerResultKind: "declined",
          safeProviderStatusCode: `http_${checkout.httpStatus}`,
        },
        afterRefundInTx: input.afterRefundInTx,
      });
    } catch (error) {
      if (error instanceof PartnerEsimPurchaseError) throw error;
      await markPartnerReconciliationRequired({
        purchaseId: purchase.id,
        partnerUserId: partner.partnerUserId,
        category: "refund_failed",
        code: "partner_refund_tx_error",
        providerObservation: {
          providerOrderId: null,
          providerResultKind: "declined",
          safeProviderStatusCode: `http_${checkout.httpStatus}`,
        },
      });
    }
    throw new PartnerEsimPurchaseError(
      "PROVIDER_FAILED",
      "The provider could not complete this purchase. The Partner wallet amount was restored."
    );
  }

  if (checkout.kind !== "success") {
    await markPartnerReconciliationRequired({
      purchaseId: purchase.id,
      partnerUserId: partner.partnerUserId,
      category: checkout.category,
      code: checkout.code,
      providerObservation: {
        providerOrderId: checkout.providerOrderId ?? null,
        providerResultKind: "uncertain",
        safeProviderStatusCode: checkout.code,
      },
    });
    throw new PartnerEsimPurchaseError(
      "RECONCILIATION_REQUIRED",
      "This purchase requires reconciliation. Do not retry."
    );
  }

  const successCheckout = checkout;
  const verifiedOffer = verifiedOfferFromPartnerPurchase(purchase);

  let orderId: string | null = null;
  try {
    const finalized = await prisma.$transaction(async (tx) => {
      const current = await tx.partnerEsimPurchase.findUnique({
        where: { id: purchase.id },
        select: {
          status: true,
          orderId: true,
          debitTransactionId: true,
          partnerChargeCents: true,
        },
      });
      if (
        current?.status === PartnerEsimPurchaseStatus.COMPLETED &&
        current.orderId
      ) {
        return { id: current.orderId };
      }
      if (current?.status !== PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
        throw new PartnerEsimPurchaseError(
          "RECONCILIATION_REQUIRED",
          "This purchase requires reconciliation. Do not retry."
        );
      }

      const order = await persistAssignedOrder(tx, {
        providerOrderId: successCheckout.providerOrderId,
        customerUserId: partner.partnerUserId,
        customerEmail: partner.partnerEmail,
        verifiedOffer,
        fundingSource: OrderFundingSource.PARTNER_BALANCE,
        status: OrderStatus.COMPLETED,
        checkoutPayload: successCheckout.payload,
      });

      if (input.afterOrderPersistInTx) {
        await input.afterOrderPersistInTx(tx);
      }

      await persistPartnerPurchaseProviderObservation(
        purchase.id,
        {
          providerOrderId: order.providerOrderId,
          providerResultKind: "success",
          safeProviderStatusCode: "completed",
        },
        tx
      );

      await tx.partnerEsimPurchase.update({
        where: { id: purchase.id },
        data: {
          status: PartnerEsimPurchaseStatus.COMPLETED,
          orderId: order.id,
          providerOrderId: order.providerOrderId,
          completedAt: new Date(),
          failureCategory: null,
          failureCode: null,
          reconciliationState: null,
          providerRefreshClaimedAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: partner.partnerUserId,
          action: PARTNER_ESIM_PURCHASE_COMPLETED_AUDIT,
          targetType: "PartnerEsimPurchase",
          targetId: purchase.id,
          metadata: {
            purchaseId: purchase.id,
            orderId: order.id,
            offerId: purchase.offerId,
            fundingSource: OrderFundingSource.PARTNER_BALANCE,
            partnerChargeCents: purchase.partnerChargeCents,
            retailPriceCents: purchase.retailPriceCents,
            debitTransactionId: current.debitTransactionId,
          } satisfies Prisma.InputJsonValue,
        },
      });

      return order;
    });
    orderId = finalized.id;
  } catch (error) {
    if (error instanceof PartnerEsimPurchaseError) throw error;
    const persistDiagnostic = classifyOrderPersistError(error);
    console.error(
      "Partner local finalize persist failed",
      persistDiagnostic.persistErrorCode
    );
    await markPartnerReconciliationRequired({
      purchaseId: purchase.id,
      partnerUserId: partner.partnerUserId,
      category: "local_finalize_failed",
      code: "order_persist_error",
      persistDiagnostic: {
        persistErrorCode: persistDiagnostic.persistErrorCode,
        family: persistDiagnostic.family,
        targetEntity: persistDiagnostic.targetEntity,
        providerOrderId: successCheckout.providerOrderId,
      },
      providerObservation: {
        providerOrderId: successCheckout.providerOrderId,
        providerResultKind: "success",
        safeProviderStatusCode: "local_finalize_failed",
      },
    });
  }

  return {
    purchaseId: purchase.id,
    partnerId: partner.partnerId,
    status: PartnerEsimPurchaseStatus.COMPLETED,
    orderId,
    refundTransactionId: null,
    duplicate: false,
  };
}
