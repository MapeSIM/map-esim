/**
 * Partner self-service wallet Add Funds (Simpaisa Easypaisa/JazzCash).
 * Parallel to customer WalletTopup — never shares rows or customer ledger.
 * Browser return never credits. Fee never enters Partner balance (v1 fee=0).
 */
import "server-only";

import {
  PaymentGatewayProvider,
  PartnerWalletTopupStatus,
  PartnerWalletTransactionType,
  Prisma,
  Role,
  WalletCurrency,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import type {
  NormalizedPaymentEvent,
  PaymentGatewayProviderName,
} from "@/app/lib/payments/adapter";
import { getActivePaymentAdapter } from "@/app/lib/payments/disabledAdapter";
import { resumeSimpaisaWalletCheckout } from "@/app/lib/payments/simpaisaAdapter";
import { maskSimpaisaMsisdn } from "@/app/lib/payments/simpaisaPolicy";
import {
  parseSimpaisaWalletCheckoutFields,
  quoteSimpaisaPkrChargeFromUsdCents,
  simpaisaChargeMatchesQuote,
} from "@/app/lib/payments/simpaisaPkrQuote";
import {
  PARTNER_TOPUP_CHECKOUT_CREATED,
  PARTNER_TOPUP_CREDIT_REFERENCE_TYPE,
  PARTNER_TOPUP_CREDITED,
  PARTNER_TOPUP_DRAFT_CREATED,
  PARTNER_TOPUP_FAILED,
  PARTNER_TOPUP_MAX_CENTS,
  PARTNER_TOPUP_MIN_CENTS,
  PARTNER_TOPUP_PAYMENT_CONFIRMED,
  PARTNER_TOPUP_PAYMENT_PENDING,
  PARTNER_TOPUP_RECONCILIATION,
  PARTNER_TOPUP_WEBHOOK_DUPLICATE,
  browserReturnMustNotCreditPartnerWallet,
  parsePartnerTopupIdFromMerchantUserKey,
  partnerTopupCreditIdempotencyKey,
} from "@/app/lib/partner/partnerWalletTopupConstants";
import {
  PARTNER_WALLET_CAS_MAX_ATTEMPTS,
} from "@/app/lib/partner/partnerWallet";
import { formatUsdCents } from "@/app/lib/wallet/display";

export {
  browserReturnMustNotCreditPartnerWallet,
  PARTNER_TOPUP_MIN_CENTS,
  PARTNER_TOPUP_MAX_CENTS,
  parsePartnerTopupIdFromMerchantUserKey,
  partnerTopupMerchantUserKey,
} from "@/app/lib/partner/partnerWalletTopupConstants";

export type CreatePartnerWalletTopupDraftInput = {
  partnerId: string;
  actorUserId: string;
  baseAmountCents: number;
  checkoutIdempotencyKey: string;
};

export type CreatePartnerWalletTopupDraftResult = {
  duplicate: boolean;
  topupId: string;
  baseAmountCents: number;
  baseAmountLabel: string;
  status: PartnerWalletTopupStatus;
};

export type StartPartnerWalletTopupCheckoutResult = {
  topupId: string;
  checkoutUrl: string;
  reusedTracker: boolean;
  chargeCurrency: string;
  chargeAmountMinor: number;
};

export type ApplyVerifiedPartnerTopupPaymentResult = {
  duplicate: boolean;
  topupId: string;
  status: PartnerWalletTopupStatus;
  walletTransactionId: string | null;
  baseAmountCents: number | null;
};

export class PartnerWalletTopupError extends Error {
  readonly code:
    | "PARTNER_UNAVAILABLE"
    | "WALLET_UNAVAILABLE"
    | "INVALID_AMOUNT"
    | "INVALID_IDEMPOTENCY"
    | "GATEWAY_UNAVAILABLE"
    | "TOPUP_UNAVAILABLE"
    | "UNAVAILABLE";

  constructor(code: PartnerWalletTopupError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "PartnerWalletTopupError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function providerFromName(
  name: PaymentGatewayProviderName | NormalizedPaymentEvent["provider"]
): PaymentGatewayProvider | null {
  switch (name) {
    case "SIMPAISA":
      return PaymentGatewayProvider.SIMPAISA;
    case "SAFEPAY":
      return PaymentGatewayProvider.SAFEPAY;
    case "PAYFAST":
      return PaymentGatewayProvider.PAYFAST;
    case "JAZZCASH":
      return PaymentGatewayProvider.JAZZCASH;
    case "EASYPAISA":
      return PaymentGatewayProvider.EASYPAISA;
    case "MANUAL_TEST":
      return PaymentGatewayProvider.MANUAL_TEST;
    default:
      return null;
  }
}

function topupReturnPath(topupId: string): string {
  return `/partner/wallet/top-up/${topupId}`;
}

function isCancelFailureCategory(category: string | null | undefined): boolean {
  const value = (category ?? "").toLowerCase();
  return value.includes("cancel");
}

async function assertActivePartnerProfile(partnerId: string) {
  const profile = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      disabledAt: true,
      user: { select: { id: true, role: true, deletedAt: true } },
    },
  });
  if (
    !profile ||
    profile.disabledAt ||
    !profile.user ||
    profile.user.deletedAt ||
    profile.user.role !== Role.PARTNER
  ) {
    throw new PartnerWalletTopupError(
      "PARTNER_UNAVAILABLE",
      "Partner access is unavailable."
    );
  }
  return profile;
}

/**
 * Create DRAFT Partner top-up. Fee fields reserved: fee=0, total=base, policy=null.
 * Does not call gateway or credit wallet.
 */
export async function createPartnerWalletTopupDraft(
  input: CreatePartnerWalletTopupDraftInput
): Promise<CreatePartnerWalletTopupDraftResult> {
  const partnerId = input.partnerId.trim();
  const actorUserId = input.actorUserId.trim();
  const idempotencyKey = input.checkoutIdempotencyKey.trim();
  const baseAmountCents = input.baseAmountCents;

  if (!partnerId || partnerId.length > 64) {
    throw new PartnerWalletTopupError(
      "PARTNER_UNAVAILABLE",
      "Partner access is unavailable."
    );
  }
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
  ) {
    throw new PartnerWalletTopupError(
      "INVALID_IDEMPOTENCY",
      "This top-up request could not be processed. Please reload and try again."
    );
  }
  if (
    !Number.isInteger(baseAmountCents) ||
    !Number.isSafeInteger(baseAmountCents) ||
    baseAmountCents < PARTNER_TOPUP_MIN_CENTS ||
    baseAmountCents > PARTNER_TOPUP_MAX_CENTS
  ) {
    throw new PartnerWalletTopupError(
      "INVALID_AMOUNT",
      "Enter a top-up amount between $0.10 and $500.00."
    );
  }

  const existing = await prisma.partnerWalletTopup.findUnique({
    where: { checkoutIdempotencyKey: idempotencyKey },
    select: {
      id: true,
      partnerId: true,
      baseAmountCents: true,
      status: true,
    },
  });
  if (existing) {
    if (existing.partnerId !== partnerId) {
      throw new PartnerWalletTopupError(
        "INVALID_IDEMPOTENCY",
        "This top-up request could not be processed. Please reload and try again."
      );
    }
    return {
      duplicate: true,
      topupId: existing.id,
      baseAmountCents: existing.baseAmountCents,
      baseAmountLabel: formatUsdCents(existing.baseAmountCents),
      status: existing.status,
    };
  }

  await assertActivePartnerProfile(partnerId);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const wallet = await tx.partnerWalletAccount.findUnique({
        where: { partnerId },
        select: { id: true },
      });
      if (!wallet) {
        await tx.partnerWalletAccount.create({
          data: {
            partnerId,
            currency: WalletCurrency.USD,
            balanceCents: 0,
            version: 0,
          },
        });
      }

      const topup = await tx.partnerWalletTopup.create({
        data: {
          partnerId,
          baseAmountCents,
          processingFeeAmountCents: 0,
          totalPayableCents: baseAmountCents,
          feePolicyVersion: null,
          chargeCurrency: null,
          chargeAmountMinor: null,
          fxRateSnapshot: null,
          gatewayProvider: null,
          status: PartnerWalletTopupStatus.DRAFT,
          checkoutIdempotencyKey: idempotencyKey,
        },
        select: { id: true, baseAmountCents: true, status: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actorUserId || null,
          action: PARTNER_TOPUP_DRAFT_CREATED,
          targetType: "PartnerWalletTopup",
          targetId: topup.id,
          metadata: {
            method: "partner_wallet_topup",
            amountCents: topup.baseAmountCents,
            currency: "USD",
            processingFeeAmountCents: 0,
            failureCategory: null,
          },
        },
      });

      return topup;
    });

    return {
      duplicate: false,
      topupId: created.id,
      baseAmountCents: created.baseAmountCents,
      baseAmountLabel: formatUsdCents(created.baseAmountCents),
      status: created.status,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const again = await prisma.partnerWalletTopup.findUnique({
        where: { checkoutIdempotencyKey: idempotencyKey },
        select: {
          id: true,
          partnerId: true,
          baseAmountCents: true,
          status: true,
        },
      });
      if (again && again.partnerId === partnerId) {
        return {
          duplicate: true,
          topupId: again.id,
          baseAmountCents: again.baseAmountCents,
          baseAmountLabel: formatUsdCents(again.baseAmountCents),
          status: again.status,
        };
      }
    }
    throw new PartnerWalletTopupError(
      "UNAVAILABLE",
      "Partner wallet top-up is temporarily unavailable. Please try again shortly."
    );
  }
}

export async function expirePartnerWalletTopupCheckout(options: {
  topupId: string;
}): Promise<{ topupId: string; status: PartnerWalletTopupStatus }> {
  const topupId = options.topupId.trim();
  if (!topupId || topupId.length > 64) {
    throw new PartnerWalletTopupError(
      "TOPUP_UNAVAILABLE",
      "This top-up is unavailable."
    );
  }

  const updated = await prisma.partnerWalletTopup.updateMany({
    where: {
      id: topupId,
      status: {
        in: [
          PartnerWalletTopupStatus.DRAFT,
          PartnerWalletTopupStatus.AWAITING_PAYMENT,
          PartnerWalletTopupStatus.PAYMENT_PENDING,
        ],
      },
      walletTransactionId: null,
    },
    data: {
      status: PartnerWalletTopupStatus.EXPIRED,
      failureCategory: "checkout_expired",
    },
  });

  if (updated.count !== 1) {
    const current = await prisma.partnerWalletTopup.findUnique({
      where: { id: topupId },
      select: { id: true, status: true },
    });
    if (!current) {
      throw new PartnerWalletTopupError(
        "TOPUP_UNAVAILABLE",
        "This top-up is unavailable."
      );
    }
    return { topupId: current.id, status: current.status };
  }

  return { topupId, status: PartnerWalletTopupStatus.EXPIRED };
}

/**
 * Start Simpaisa Verify for DRAFT/AWAITING Partner top-up.
 * Pending with existing gatewayPaymentRef resumes without a second Verify.
 * Never credits the Partner wallet.
 */
export async function startPartnerWalletTopupCheckout(options: {
  partnerId: string;
  actorUserId: string;
  topupId: string;
  walletOperatorId?: string;
  customerMsisdn?: string;
}): Promise<StartPartnerWalletTopupCheckoutResult> {
  browserReturnMustNotCreditPartnerWallet();
  const partnerId = options.partnerId.trim();
  const actorUserId = options.actorUserId.trim();
  const topupId = options.topupId.trim();
  await assertActivePartnerProfile(partnerId);

  const topup = await prisma.partnerWalletTopup.findUnique({
    where: { id: topupId },
    select: {
      id: true,
      partnerId: true,
      baseAmountCents: true,
      totalPayableCents: true,
      processingFeeAmountCents: true,
      checkoutIdempotencyKey: true,
      status: true,
      gatewayProvider: true,
      gatewayPaymentRef: true,
      chargeCurrency: true,
      chargeAmountMinor: true,
      expiresAt: true,
    },
  });
  if (!topup || topup.partnerId !== partnerId) {
    throw new PartnerWalletTopupError(
      "TOPUP_UNAVAILABLE",
      "This top-up is unavailable."
    );
  }
  if (
    topup.status !== PartnerWalletTopupStatus.DRAFT &&
    topup.status !== PartnerWalletTopupStatus.AWAITING_PAYMENT
  ) {
    throw new PartnerWalletTopupError(
      "TOPUP_UNAVAILABLE",
      "This top-up cannot start checkout in its current state."
    );
  }
  if (topup.expiresAt && topup.expiresAt.getTime() <= Date.now()) {
    await expirePartnerWalletTopupCheckout({ topupId: topup.id }).catch(
      () => undefined
    );
    throw new PartnerWalletTopupError(
      "TOPUP_UNAVAILABLE",
      "This top-up checkout expired. Please start a new top-up."
    );
  }

  const returnPath = topupReturnPath(topup.id);
  const existingRef = (topup.gatewayPaymentRef ?? "").trim();

  const adapter = getActivePaymentAdapter();
  if (!adapter.enabled || adapter.provider !== "SIMPAISA") {
    throw new PartnerWalletTopupError(
      "GATEWAY_UNAVAILABLE",
      "Payment gateway is not available yet. Please try again after payment provider setup is complete."
    );
  }

  // No second Verify while same attempt already pending with a provider ref.
  if (
    Boolean(existingRef) &&
    topup.status === PartnerWalletTopupStatus.AWAITING_PAYMENT &&
    topup.gatewayProvider === PaymentGatewayProvider.SIMPAISA
  ) {
    const resumed = resumeSimpaisaWalletCheckout({ returnPath });
    if (!resumed.ok) {
      throw new PartnerWalletTopupError(
        resumed.code === "MISCONFIGURED" ||
          resumed.code === "GATEWAY_UNAVAILABLE"
          ? "GATEWAY_UNAVAILABLE"
          : "UNAVAILABLE",
        resumed.message
      );
    }
    return {
      topupId: topup.id,
      checkoutUrl: resumed.checkoutUrl,
      reusedTracker: true,
      chargeCurrency: (topup.chargeCurrency || "PKR").toUpperCase(),
      chargeAmountMinor: topup.chargeAmountMinor ?? topup.totalPayableCents,
    };
  }

  const quote = quoteSimpaisaPkrChargeFromUsdCents(topup.totalPayableCents);
  if (!quote) {
    throw new PartnerWalletTopupError(
      "GATEWAY_UNAVAILABLE",
      "Payment checkout quote is unavailable. Please try again."
    );
  }
  const walletFields = parseSimpaisaWalletCheckoutFields({
    walletOperatorId: options.walletOperatorId,
    customerMsisdn: options.customerMsisdn,
  });
  if (!walletFields.ok) {
    throw new PartnerWalletTopupError("UNAVAILABLE", walletFields.error);
  }

  const result = await adapter.createCheckoutSession({
    purpose: "PARTNER_WALLET_TOPUP",
    localPartnerTopupId: topup.id,
    customerUserId: actorUserId,
    chargeAmountMinor: quote.chargeAmountMinor,
    chargeCurrency: quote.chargeCurrency,
    checkoutIdempotencyKey: topup.checkoutIdempotencyKey,
    returnPath,
    cancelPath: returnPath,
    walletOperatorId: walletFields.walletOperatorId,
    customerMsisdn: walletFields.customerMsisdn,
  });

  if (!result.ok) {
    throw new PartnerWalletTopupError("GATEWAY_UNAVAILABLE", result.message);
  }

  const providerRef = (result.providerPaymentRef ?? "").trim();
  const chargeCurrency = result.chargeCurrency.trim().toUpperCase();
  const chargeAmountMinor = result.chargeAmountMinor;
  if (
    !providerRef ||
    !Number.isInteger(chargeAmountMinor) ||
    !simpaisaChargeMatchesQuote({
      usdCents: topup.totalPayableCents,
      chargeCurrency,
      chargeAmountMinor,
    })
  ) {
    throw new PartnerWalletTopupError(
      "GATEWAY_UNAVAILABLE",
      "Payment checkout quote did not match the PKR charge. Please try again."
    );
  }

  const masked = maskSimpaisaMsisdn(walletFields.customerMsisdn);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.partnerWalletTopup.updateMany({
      where: {
        id: topup.id,
        partnerId,
        status: {
          in: [
            PartnerWalletTopupStatus.DRAFT,
            PartnerWalletTopupStatus.AWAITING_PAYMENT,
          ],
        },
        walletTransactionId: null,
      },
      data: {
        status: PartnerWalletTopupStatus.AWAITING_PAYMENT,
        gatewayProvider: PaymentGatewayProvider.SIMPAISA,
        gatewayPaymentRef: providerRef,
        chargeCurrency,
        chargeAmountMinor,
        fxRateSnapshot: result.fxRateSnapshot ?? quote.fxRateSnapshot,
        expiresAt: result.expiresAt,
        failureCategory: null,
        failureCode: null,
        walletOperatorId: walletFields.walletOperatorId,
        customerMsisdnMasked: masked,
        processingFeeAmountCents: 0,
        totalPayableCents: topup.baseAmountCents,
        feePolicyVersion: null,
      },
    });
    if (updated.count !== 1) {
      throw new PartnerWalletTopupError(
        "TOPUP_UNAVAILABLE",
        "This top-up cannot start checkout in its current state."
      );
    }

    await tx.auditLog.create({
      data: {
        actorUserId: actorUserId || null,
        action: PARTNER_TOPUP_CHECKOUT_CREATED,
        targetType: "PartnerWalletTopup",
        targetId: topup.id,
        metadata: {
          method: "partner_wallet_topup",
          amountCents: topup.baseAmountCents,
          currency: "USD",
          chargeCurrency,
          chargeAmountMinor,
          gatewayProvider: PaymentGatewayProvider.SIMPAISA,
        },
      },
    });
  });

  return {
    topupId: topup.id,
    checkoutUrl: result.checkoutUrl,
    reusedTracker: false,
    chargeCurrency,
    chargeAmountMinor,
  };
}

function resolvePartnerTopupIdFromEvent(
  event: NormalizedPaymentEvent
): string | null {
  if (event.purpose === "PARTNER_WALLET_TOPUP") {
    const fromLocal = (event.localTopupId ?? "").trim();
    if (fromLocal) return fromLocal;
  }
  return (
    parsePartnerTopupIdFromMerchantUserKey(event.paymentAttemptId) ||
    parsePartnerTopupIdFromMerchantUserKey(event.localTopupId) ||
    null
  );
}

/**
 * Exact-once Partner wallet credit from signature-verified Inquire event.
 * Credits baseAmountCents only — never processingFeeAmountCents.
 */
export async function applyVerifiedPartnerTopupPaymentEvent(
  event: NormalizedPaymentEvent
): Promise<ApplyVerifiedPartnerTopupPaymentResult> {
  if (!event.signatureVerified) {
    throw new PartnerWalletTopupError(
      "UNAVAILABLE",
      "Payment event could not be verified."
    );
  }
  if (
    event.provider === "MANUAL_TEST" ||
    event.provider === "SIMPAISA_CARDS" ||
    event.provider === "UNCONFIGURED"
  ) {
    throw new PartnerWalletTopupError(
      "GATEWAY_UNAVAILABLE",
      "Payment provider is not approved for Partner wallet credit."
    );
  }

  const provider = providerFromName(event.provider);
  if (!provider) {
    throw new PartnerWalletTopupError(
      "GATEWAY_UNAVAILABLE",
      "Payment provider is not approved for Partner wallet credit."
    );
  }

  const eventId = (event.eventId ?? "").trim();
  if (!eventId || eventId.length > 191) {
    throw new PartnerWalletTopupError(
      "UNAVAILABLE",
      "Payment event is missing a durable event id."
    );
  }

  const topupId = resolvePartnerTopupIdFromEvent(event);
  if (!topupId) {
    throw new PartnerWalletTopupError(
      "TOPUP_UNAVAILABLE",
      "Partner top-up was not found."
    );
  }

  const byEvent = await prisma.partnerWalletTopup.findUnique({
    where: { webhookEventId: eventId },
    select: {
      id: true,
      status: true,
      walletTransactionId: true,
      baseAmountCents: true,
    },
  });
  if (byEvent) {
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: PARTNER_TOPUP_WEBHOOK_DUPLICATE,
          targetType: "PartnerWalletTopup",
          targetId: byEvent.id,
          metadata: {
            method: "verified_webhook",
            amountCents: byEvent.baseAmountCents,
            currency: "USD",
            failureCategory: "duplicate_event",
          },
        },
      })
      .catch(() => undefined);
    return {
      duplicate: true,
      topupId: byEvent.id,
      status: byEvent.status,
      walletTransactionId: byEvent.walletTransactionId,
      baseAmountCents: byEvent.baseAmountCents,
    };
  }

  const topup = await prisma.partnerWalletTopup.findUnique({
    where: { id: topupId },
    select: {
      id: true,
      partnerId: true,
      baseAmountCents: true,
      totalPayableCents: true,
      processingFeeAmountCents: true,
      chargeCurrency: true,
      chargeAmountMinor: true,
      gatewayProvider: true,
      gatewayPaymentRef: true,
      status: true,
      walletTransactionId: true,
    },
  });
  if (!topup) {
    throw new PartnerWalletTopupError(
      "TOPUP_UNAVAILABLE",
      "Partner top-up was not found."
    );
  }

  if (
    topup.status === PartnerWalletTopupStatus.CREDITED ||
    topup.walletTransactionId
  ) {
    return {
      duplicate: true,
      topupId: topup.id,
      status: topup.status,
      walletTransactionId: topup.walletTransactionId,
      baseAmountCents: topup.baseAmountCents,
    };
  }

  await assertActivePartnerProfile(topup.partnerId).catch(() => {
    // Still allow fail/recon paths; credit path re-checks wallet.
  });

  const openForPending =
    topup.status === PartnerWalletTopupStatus.DRAFT ||
    topup.status === PartnerWalletTopupStatus.AWAITING_PAYMENT ||
    topup.status === PartnerWalletTopupStatus.PAYMENT_PENDING;

  const openForConfirmedCredit =
    topup.status === PartnerWalletTopupStatus.AWAITING_PAYMENT ||
    topup.status === PartnerWalletTopupStatus.PAYMENT_PENDING ||
    topup.status === PartnerWalletTopupStatus.PAYMENT_CONFIRMED ||
    topup.status === PartnerWalletTopupStatus.FAILED ||
    topup.status === PartnerWalletTopupStatus.CANCELLED;

  if (event.paymentStatus === "pending") {
    if (openForPending) {
      await prisma.partnerWalletTopup.updateMany({
        where: {
          id: topup.id,
          status: {
            in: [
              PartnerWalletTopupStatus.DRAFT,
              PartnerWalletTopupStatus.AWAITING_PAYMENT,
              PartnerWalletTopupStatus.PAYMENT_PENDING,
            ],
          },
          walletTransactionId: null,
        },
        data: {
          status: PartnerWalletTopupStatus.PAYMENT_PENDING,
          gatewayProvider: provider,
          gatewayPaymentRef: event.providerPaymentRef,
          failureCategory: null,
        },
      });
      await prisma.auditLog
        .create({
          data: {
            actorUserId: null,
            action: PARTNER_TOPUP_PAYMENT_PENDING,
            targetType: "PartnerWalletTopup",
            targetId: topup.id,
            metadata: {
              method: "verified_webhook",
              amountCents: topup.baseAmountCents,
              currency: "USD",
              failureCategory: "payment_pending",
            },
          },
        })
        .catch(() => undefined);
    }
    return {
      duplicate: false,
      topupId: topup.id,
      status: PartnerWalletTopupStatus.PAYMENT_PENDING,
      walletTransactionId: null,
      baseAmountCents: null,
    };
  }

  if (event.paymentStatus === "failed") {
    const failedStatus = isCancelFailureCategory(event.failureCategory)
      ? PartnerWalletTopupStatus.CANCELLED
      : PartnerWalletTopupStatus.FAILED;
    await prisma.partnerWalletTopup.updateMany({
      where: {
        id: topup.id,
        status: {
          in: [
            PartnerWalletTopupStatus.DRAFT,
            PartnerWalletTopupStatus.AWAITING_PAYMENT,
            PartnerWalletTopupStatus.PAYMENT_PENDING,
            PartnerWalletTopupStatus.FAILED,
            PartnerWalletTopupStatus.CANCELLED,
          ],
        },
        walletTransactionId: null,
      },
      data: {
        status: failedStatus,
        gatewayProvider: provider,
        gatewayPaymentRef: event.providerPaymentRef,
        failureCategory: event.failureCategory || "payment_failed",
      },
    });
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: PARTNER_TOPUP_FAILED,
          targetType: "PartnerWalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.baseAmountCents,
            currency: "USD",
            failureCategory: event.failureCategory || "payment_failed",
          },
        },
      })
      .catch(() => undefined);
    const current = await prisma.partnerWalletTopup.findUnique({
      where: { id: topup.id },
      select: {
        id: true,
        status: true,
        walletTransactionId: true,
        baseAmountCents: true,
      },
    });
    return {
      duplicate: current?.status === PartnerWalletTopupStatus.CREDITED,
      topupId: topup.id,
      status: current?.status ?? failedStatus,
      walletTransactionId: current?.walletTransactionId ?? null,
      baseAmountCents:
        current?.status === PartnerWalletTopupStatus.CREDITED
          ? current.baseAmountCents
          : null,
    };
  }

  if (event.paymentStatus === "uncertain") {
    await prisma.partnerWalletTopup.updateMany({
      where: {
        id: topup.id,
        status: {
          notIn: [
            PartnerWalletTopupStatus.CREDITED,
            PartnerWalletTopupStatus.PAYMENT_CONFIRMED,
          ],
        },
        walletTransactionId: null,
      },
      data: {
        status: PartnerWalletTopupStatus.RECONCILIATION_REQUIRED,
        gatewayProvider: provider,
        gatewayPaymentRef: event.providerPaymentRef,
        failureCategory: event.failureCategory || "uncertain_payment",
      },
    });
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: PARTNER_TOPUP_RECONCILIATION,
          targetType: "PartnerWalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.baseAmountCents,
            currency: "USD",
            failureCategory: event.failureCategory || "uncertain_payment",
          },
        },
      })
      .catch(() => undefined);
    return {
      duplicate: false,
      topupId: topup.id,
      status: PartnerWalletTopupStatus.RECONCILIATION_REQUIRED,
      walletTransactionId: null,
      baseAmountCents: null,
    };
  }

  // Confirmed — require charge snapshot match on totalPayable (quote basis).
  const snapshotOk =
    topup.chargeCurrency != null &&
    topup.chargeAmountMinor != null &&
    topup.gatewayProvider === PaymentGatewayProvider.SIMPAISA &&
    simpaisaChargeMatchesQuote({
      usdCents: topup.totalPayableCents,
      chargeCurrency: topup.chargeCurrency,
      chargeAmountMinor: topup.chargeAmountMinor,
    });

  if (!openForConfirmedCredit || !snapshotOk) {
    await prisma.partnerWalletTopup.updateMany({
      where: {
        id: topup.id,
        walletTransactionId: null,
        status: { not: PartnerWalletTopupStatus.CREDITED },
      },
      data: {
        status: PartnerWalletTopupStatus.RECONCILIATION_REQUIRED,
        gatewayProvider: provider,
        gatewayPaymentRef: event.providerPaymentRef,
        failureCategory: "missing_checkout_snapshot",
      },
    });
    return {
      duplicate: false,
      topupId: topup.id,
      status: PartnerWalletTopupStatus.RECONCILIATION_REQUIRED,
      walletTransactionId: null,
      baseAmountCents: null,
    };
  }

  const storedRef = (topup.gatewayPaymentRef ?? "").trim();
  const eventRef = (event.providerPaymentRef ?? "").trim();
  const referenceMismatch =
    Boolean(storedRef) && Boolean(eventRef) && storedRef !== eventRef;

  if (
    referenceMismatch ||
    topup.gatewayProvider !== provider ||
    topup.chargeCurrency !== event.chargeCurrency.trim().toUpperCase() ||
    topup.chargeAmountMinor !== event.chargeAmountMinor
  ) {
    const failureCategory = referenceMismatch
      ? "reference_mismatch"
      : "charge_mismatch";
    await prisma.partnerWalletTopup.updateMany({
      where: {
        id: topup.id,
        walletTransactionId: null,
        status: { not: PartnerWalletTopupStatus.CREDITED },
      },
      data: {
        status: PartnerWalletTopupStatus.RECONCILIATION_REQUIRED,
        gatewayProvider: provider,
        gatewayPaymentRef: event.providerPaymentRef,
        failureCategory,
      },
    });
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: PARTNER_TOPUP_RECONCILIATION,
          targetType: "PartnerWalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.baseAmountCents,
            currency: "USD",
            failureCategory,
          },
        },
      })
      .catch(() => undefined);
    return {
      duplicate: false,
      topupId: topup.id,
      status: PartnerWalletTopupStatus.RECONCILIATION_REQUIRED,
      walletTransactionId: null,
      baseAmountCents: null,
    };
  }

  // Exact-once credit of baseAmountCents only (fee never spendable).
  const creditCents = topup.baseAmountCents;
  const ledgerKey = partnerTopupCreditIdempotencyKey(topup.id);

  for (let attempt = 0; attempt < PARTNER_WALLET_CAS_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const claimed = await tx.partnerWalletTopup.updateMany({
          where: {
            id: topup.id,
            status: {
              in: [
                PartnerWalletTopupStatus.AWAITING_PAYMENT,
                PartnerWalletTopupStatus.PAYMENT_PENDING,
                PartnerWalletTopupStatus.PAYMENT_CONFIRMED,
                PartnerWalletTopupStatus.FAILED,
                PartnerWalletTopupStatus.CANCELLED,
              ],
            },
            walletTransactionId: null,
          },
          data: {
            status: PartnerWalletTopupStatus.PAYMENT_CONFIRMED,
            webhookEventId: eventId,
            gatewayPaymentRef: event.providerPaymentRef,
            paymentConfirmedAt: event.confirmedAt || new Date(),
            failureCategory: null,
            failureCode: null,
          },
        });

        if (claimed.count !== 1) {
          const current = await tx.partnerWalletTopup.findUnique({
            where: { id: topup.id },
            select: {
              id: true,
              status: true,
              walletTransactionId: true,
              baseAmountCents: true,
            },
          });
          if (current?.status === PartnerWalletTopupStatus.CREDITED) {
            return {
              duplicate: true,
              topupId: current.id,
              status: current.status,
              walletTransactionId: current.walletTransactionId,
              baseAmountCents: current.baseAmountCents,
            };
          }
          throw new PartnerWalletTopupError(
            "TOPUP_UNAVAILABLE",
            "Partner top-up cannot be credited in its current state."
          );
        }

        const existingTx = await tx.partnerWalletTransaction.findUnique({
          where: { idempotencyKey: ledgerKey },
          select: { id: true, amountCents: true, type: true },
        });
        if (existingTx) {
          if (
            existingTx.type !== PartnerWalletTransactionType.TOPUP_CREDIT ||
            existingTx.amountCents !== creditCents
          ) {
            throw new PartnerWalletTopupError(
              "UNAVAILABLE",
              "Partner top-up credit conflict."
            );
          }
          await tx.partnerWalletTopup.update({
            where: { id: topup.id },
            data: {
              status: PartnerWalletTopupStatus.CREDITED,
              walletTransactionId: existingTx.id,
              walletCreditedAt: new Date(),
            },
          });
          return {
            duplicate: true,
            topupId: topup.id,
            status: PartnerWalletTopupStatus.CREDITED,
            walletTransactionId: existingTx.id,
            baseAmountCents: creditCents,
          };
        }

        let wallet = await tx.partnerWalletAccount.findUnique({
          where: { partnerId: topup.partnerId },
          select: { id: true, balanceCents: true, version: true },
        });
        if (!wallet) {
          wallet = await tx.partnerWalletAccount.create({
            data: {
              partnerId: topup.partnerId,
              currency: WalletCurrency.USD,
              balanceCents: 0,
              version: 0,
            },
            select: { id: true, balanceCents: true, version: true },
          });
        }

        const before = wallet.balanceCents;
        const after = before + creditCents;
        const cas = await tx.partnerWalletAccount.updateMany({
          where: { id: wallet.id, version: wallet.version },
          data: {
            balanceCents: after,
            version: { increment: 1 },
          },
        });
        if (cas.count !== 1) {
          throw new Error("PARTNER_WALLET_CAS_CONFLICT");
        }

        const txRow = await tx.partnerWalletTransaction.create({
          data: {
            partnerWalletAccountId: wallet.id,
            type: PartnerWalletTransactionType.TOPUP_CREDIT,
            amountCents: creditCents,
            balanceBeforeCents: before,
            balanceAfterCents: after,
            reason: "Partner wallet Add Funds",
            referenceType: PARTNER_TOPUP_CREDIT_REFERENCE_TYPE,
            referenceId: topup.id,
            createdByAdminId: null,
            idempotencyKey: ledgerKey,
          },
          select: { id: true },
        });

        await tx.partnerWalletTopup.update({
          where: { id: topup.id },
          data: {
            status: PartnerWalletTopupStatus.CREDITED,
            walletTransactionId: txRow.id,
            walletCreditedAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: null,
            action: PARTNER_TOPUP_PAYMENT_CONFIRMED,
            targetType: "PartnerWalletTopup",
            targetId: topup.id,
            metadata: {
              method: "verified_webhook",
              amountCents: creditCents,
              currency: "USD",
            },
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: null,
            action: PARTNER_TOPUP_CREDITED,
            targetType: "PartnerWalletTopup",
            targetId: topup.id,
            metadata: {
              method: "verified_webhook",
              amountCents: creditCents,
              currency: "USD",
              processingFeeAmountCents: topup.processingFeeAmountCents,
              walletTransactionId: txRow.id,
            },
          },
        });

        return {
          duplicate: false,
          topupId: topup.id,
          status: PartnerWalletTopupStatus.CREDITED,
          walletTransactionId: txRow.id,
          baseAmountCents: creditCents,
        };
      });

      return result;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "PARTNER_WALLET_CAS_CONFLICT"
      ) {
        continue;
      }
      if (isUniqueViolation(error)) {
        const again = await prisma.partnerWalletTopup.findUnique({
          where: { id: topup.id },
          select: {
            id: true,
            status: true,
            walletTransactionId: true,
            baseAmountCents: true,
            webhookEventId: true,
          },
        });
        if (
          again?.status === PartnerWalletTopupStatus.CREDITED ||
          again?.webhookEventId === eventId
        ) {
          return {
            duplicate: true,
            topupId: again.id,
            status: again.status,
            walletTransactionId: again.walletTransactionId,
            baseAmountCents: again.baseAmountCents,
          };
        }
      }
      throw error;
    }
  }

  throw new PartnerWalletTopupError(
    "UNAVAILABLE",
    "Partner wallet top-up is temporarily unavailable. Please try again shortly."
  );
}
