/**
 * Partner eSIM Hosted Checkout start (Phase 2).
 * Reserves walletAppliedCents (if any), creates PartnerEsimPurchasePaymentAttempt,
 * starts gateway session. Never calls VeSIM / never treats browser return as paid.
 */
import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  OrderFundingSource,
  PartnerEsimPurchaseStatus,
  PaymentGatewayProvider,
  Prisma,
  Role,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  partnerEsimPurchasePaymentCancelPath,
  partnerEsimPurchasePaymentReturnPath,
} from "@/app/lib/partner/partnerEsimPurchaseCheckoutPaths";
import {
  PARTNER_ESIM_PURCHASE_CHECKOUT_CREATED,
  browserReturnMustNotFundPartnerEsimPurchase,
  partnerEsimGatewayCheckoutIdempotencyKey,
} from "@/app/lib/partner/partnerEsimPurchasePaymentConstants";
import { PartnerEsimPurchaseError } from "@/app/lib/partner/partnerEsimPurchase";
import {
  calculatePartnerPurchaseFunding,
  partnerPurchaseRequiresGateway,
} from "@/app/lib/partner/partnerPurchaseFunding";
import {
  PartnerPurchaseWalletError,
  releasePartnerGatewayReservationInTx,
  reservePartnerPurchaseFundsInTx,
} from "@/app/lib/partner/partnerPurchaseWallet";
import {
  getActivePaymentAdapter,
  isPaymentGatewayConfigured,
} from "@/app/lib/payments/disabledAdapter";
import { resumeSimpaisaWalletCheckout } from "@/app/lib/payments/simpaisaAdapter";
import { maskSimpaisaMsisdn } from "@/app/lib/payments/simpaisaPolicy";
import {
  parseSimpaisaWalletCheckoutFields,
  quoteSimpaisaPkrChargeFromUsdCents,
  simpaisaChargeMatchesQuote,
} from "@/app/lib/payments/simpaisaPkrQuote";
import {
  sanitizeCountryHint,
  verifyOfferAuthoritative,
  type VerifiedCheckoutOffer,
} from "@/app/lib/vesim/server";
import { usdPriceToCents } from "@/app/lib/esim/assignmentValidation";
import { calculatePartnerPurchasePricing } from "@/app/lib/partner/partnerPricing";

export class PartnerEsimPurchaseGatewayCheckoutError extends Error {
  readonly code:
    | "PARTNER_UNAVAILABLE"
    | "INVALID_STATE"
    | "INSUFFICIENT_FUNDS"
    | "PRICING_CHANGED"
    | "GATEWAY_UNAVAILABLE"
    | "UNAVAILABLE";

  constructor(
    code: PartnerEsimPurchaseGatewayCheckoutError["code"],
    message: string
  ) {
    super(message);
    this.code = code;
    this.name = "PartnerEsimPurchaseGatewayCheckoutError";
  }
}

export type StartPartnerEsimPurchaseHostedCheckoutInput = {
  partnerUserId: string;
  purchaseId: string;
  countryHint?: string | null;
  /**
   * Server-resolved funding flag. When omitted, uses purchase.useWallet
   * (after setPartnerPurchaseFundingChoice) or defaults to true.
   */
  useWallet?: boolean;
  walletOperatorId?: string;
  customerMsisdn?: string;
  /** Test seam only. */
  verifyOffer?: (options: {
    offerId: string;
    countryHint?: string | null;
    applyAsiaTemporaryMarkup?: boolean;
  }) => Promise<VerifiedCheckoutOffer | null>;
};

export type StartPartnerEsimPurchaseHostedCheckoutResult = {
  purchaseId: string;
  paymentAttemptId: string;
  checkoutUrl: string;
  reusedAttempt: boolean;
  reusedTracker: boolean;
  gatewayAmountCents: number;
  walletAppliedCents: number;
};

/** Display-only return-page view. Never funds or mutates payment state. */
export type OwnedPartnerPaymentAttemptView = {
  attemptId: string;
  purchaseId: string;
  status: EsimPurchasePaymentAttemptStatus;
  purchaseStatus: PartnerEsimPurchaseStatus;
  gatewayProvider: PaymentGatewayProvider | null;
};

/**
 * Load a Partner payment attempt owned by the signed-in partner user.
 * Read-only — used by the browser return page for UX status only.
 */
export async function getOwnedPartnerEsimPurchasePaymentAttempt(
  partnerUserId: string,
  attemptId: string
): Promise<OwnedPartnerPaymentAttemptView | null> {
  const ownerId = partnerUserId.trim();
  const id = attemptId.trim();
  if (!ownerId || !id || ownerId.length > 64 || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;

  const row = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      gatewayProvider: true,
      purchase: {
        select: {
          id: true,
          status: true,
          partner: {
            select: {
              userId: true,
              disabledAt: true,
              user: { select: { role: true, deletedAt: true } },
            },
          },
        },
      },
    },
  });

  if (
    !row ||
    row.purchase.partner.userId !== ownerId ||
    row.purchase.partner.disabledAt ||
    row.purchase.partner.user.deletedAt ||
    row.purchase.partner.user.role !== Role.PARTNER
  ) {
    return null;
  }

  return {
    attemptId: row.id,
    purchaseId: row.purchase.id,
    status: row.status,
    purchaseStatus: row.purchase.status,
    gatewayProvider: row.gatewayProvider ?? null,
  };
}

function mapWalletError(error: unknown): never {
  if (error instanceof PartnerPurchaseWalletError) {
    if (error.code === "INSUFFICIENT_FUNDS") {
      throw new PartnerEsimPurchaseGatewayCheckoutError(
        "INSUFFICIENT_FUNDS",
        "Partner wallet balance is not enough for this package."
      );
    }
    if (error.code === "PARTNER_UNAVAILABLE") {
      throw new PartnerEsimPurchaseGatewayCheckoutError(
        "PARTNER_UNAVAILABLE",
        "Partner is unavailable."
      );
    }
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "UNAVAILABLE",
      error.message
    );
  }
  throw error;
}

async function loadActivePartner(partnerUserId: string) {
  const id = partnerUserId.trim();
  if (!id || id.length > 64) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      email: true,
      partnerProfile: {
        select: {
          id: true,
          disabledAt: true,
          discountBps: true,
          discountVersion: true,
          walletAccount: { select: { id: true, balanceCents: true } },
        },
      },
    },
  });
  if (
    !user ||
    user.deletedAt ||
    user.role !== Role.PARTNER ||
    !user.partnerProfile ||
    user.partnerProfile.disabledAt
  ) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }
  if (!user.partnerProfile.walletAccount) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "UNAVAILABLE",
      "Partner wallet is unavailable."
    );
  }
  return {
    partnerUserId: user.id,
    partnerEmail: user.email,
    partnerId: user.partnerProfile.id,
    discountBps: user.partnerProfile.discountBps,
    discountVersion: user.partnerProfile.discountVersion,
    balanceCents: user.partnerProfile.walletAccount.balanceCents,
  };
}

function assertLivePricingMatches(options: {
  purchase: {
    offerId: string;
    retailPriceCents: number;
    providerCostCents: number;
    discountBps: number;
    discountVersion: number;
    partnerChargeCents: number;
  };
  partnerDiscountBps: number;
  partnerDiscountVersion: number;
  verified: VerifiedCheckoutOffer;
}): void {
  if (
    options.partnerDiscountBps !== options.purchase.discountBps ||
    options.partnerDiscountVersion !== options.purchase.discountVersion
  ) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "PRICING_CHANGED",
      "Partner pricing changed. Please refresh and try again."
    );
  }
  const retailPriceCents = usdPriceToCents(options.verified.priceUSD);
  const providerCostCents = usdPriceToCents(options.verified.providerPriceUSD);
  if (
    retailPriceCents == null ||
    providerCostCents == null ||
    retailPriceCents !== options.purchase.retailPriceCents ||
    providerCostCents !== options.purchase.providerCostCents
  ) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "PRICING_CHANGED",
      "Package pricing changed. Please refresh and try again."
    );
  }
  const priced = calculatePartnerPurchasePricing({
    retailPriceCents,
    discountBps: options.purchase.discountBps,
    providerCostCents,
  });
  if (
    !priced.ok ||
    priced.partnerChargeCents !== options.purchase.partnerChargeCents
  ) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "PRICING_CHANGED",
      "Package pricing changed. Please refresh and try again."
    );
  }
}

/**
 * Persist funding + reserve walletApplied (if any) + AWAITING_GATEWAY_PAYMENT.
 * Idempotent when already awaiting with matching breakdown.
 */
async function reservePartnerSplitBeforeGateway(options: {
  partnerId: string;
  purchaseId: string;
  partnerChargeCents: number;
  walletAppliedCents: number;
  gatewayAmountCents: number;
  useWallet: boolean;
  fundingSource: OrderFundingSource;
}): Promise<{ debitTransactionId: string | null; alreadyReserved: boolean }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.partnerEsimPurchase.findUnique({
        where: { id: options.purchaseId },
        select: {
          id: true,
          partnerId: true,
          status: true,
          partnerChargeCents: true,
          walletAppliedCents: true,
          gatewayAmountCents: true,
          debitTransactionId: true,
        },
      });
      if (!current || current.partnerId !== options.partnerId) {
        throw new PartnerEsimPurchaseGatewayCheckoutError(
          "INVALID_STATE",
          "This purchase is unavailable."
        );
      }
      if (current.partnerChargeCents !== options.partnerChargeCents) {
        throw new PartnerEsimPurchaseGatewayCheckoutError(
          "PRICING_CHANGED",
          "Package pricing changed. Please refresh and try again."
        );
      }

      if (
        current.status === PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT &&
        current.walletAppliedCents === options.walletAppliedCents &&
        current.gatewayAmountCents === options.gatewayAmountCents
      ) {
        return {
          debitTransactionId: current.debitTransactionId,
          alreadyReserved: Boolean(current.debitTransactionId),
        };
      }

      if (current.status !== PartnerEsimPurchaseStatus.READY) {
        throw new PartnerEsimPurchaseGatewayCheckoutError(
          "INVALID_STATE",
          "This purchase is unavailable."
        );
      }

      const claimed = await tx.partnerEsimPurchase.updateMany({
        where: {
          id: current.id,
          partnerId: options.partnerId,
          status: PartnerEsimPurchaseStatus.READY,
        },
        data: {
          status: PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
          useWallet: options.useWallet,
          walletAppliedCents: options.walletAppliedCents,
          gatewayAmountCents: options.gatewayAmountCents,
          fundingSource: options.fundingSource,
        },
      });
      if (claimed.count !== 1) {
        throw new PartnerEsimPurchaseGatewayCheckoutError(
          "INVALID_STATE",
          "This purchase is unavailable."
        );
      }

      if (options.walletAppliedCents <= 0) {
        return { debitTransactionId: null, alreadyReserved: false };
      }

      let debit;
      try {
        debit = await reservePartnerPurchaseFundsInTx(tx, {
          partnerId: options.partnerId,
          partnerEsimPurchaseId: current.id,
          amountCents: options.walletAppliedCents,
        });
      } catch (error) {
        mapWalletError(error);
      }

      await tx.partnerEsimPurchase.update({
        where: { id: current.id },
        data: { debitTransactionId: debit.transactionId },
      });

      return {
        debitTransactionId: debit.transactionId,
        alreadyReserved: debit.outcome === "already_applied",
      };
    });
  } catch (error) {
    if (error instanceof PartnerEsimPurchaseGatewayCheckoutError) throw error;
    if (error instanceof PartnerEsimPurchaseError) {
      throw new PartnerEsimPurchaseGatewayCheckoutError(
        error.code === "INSUFFICIENT_FUNDS"
          ? "INSUFFICIENT_FUNDS"
          : error.code === "PRICING_CHANGED"
            ? "PRICING_CHANGED"
            : "UNAVAILABLE",
        error.message
      );
    }
    mapWalletError(error);
  }
}

async function restoreSplitWalletBestEffort(options: {
  partnerId: string;
  purchaseId: string;
  walletAppliedCents: number;
}): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await releasePartnerGatewayReservationInTx(tx, {
        partnerId: options.partnerId,
        partnerEsimPurchaseId: options.purchaseId,
        amountCents: Math.max(0, options.walletAppliedCents),
      });
    });
  } catch {
    // Fail closed: leave AWAITING for recon; never call VeSIM.
  }
}

/**
 * Start Partner eSIM hosted checkout for gatewayAmountCents > 0.
 * Does not execute VeSIM provider purchase.
 */
export async function startPartnerEsimPurchaseHostedCheckout(
  input: StartPartnerEsimPurchaseHostedCheckoutInput
): Promise<StartPartnerEsimPurchaseHostedCheckoutResult> {
  browserReturnMustNotFundPartnerEsimPurchase();

  const purchaseId = input.purchaseId.trim();
  if (!purchaseId || purchaseId.length > 64) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  if (!isPaymentGatewayConfigured()) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "GATEWAY_UNAVAILABLE",
      "Payment gateway is not available yet. Please try again later."
    );
  }

  const partner = await loadActivePartner(input.partnerUserId);
  const countryHint = sanitizeCountryHint(input.countryHint ?? null);
  const verifyOffer = input.verifyOffer ?? verifyOfferAuthoritative;

  const purchase = await prisma.partnerEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      partnerId: true,
      offerId: true,
      status: true,
      retailPriceCents: true,
      providerCostCents: true,
      discountBps: true,
      discountVersion: true,
      partnerChargeCents: true,
      useWallet: true,
      walletAppliedCents: true,
      gatewayAmountCents: true,
      currency: true,
      idempotencyKey: true,
      debitTransactionId: true,
      destinationCode: true,
    },
  });

  if (!purchase || purchase.partnerId !== partner.partnerId) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  if (
    purchase.status !== PartnerEsimPurchaseStatus.READY &&
    purchase.status !== PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT
  ) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      "This purchase is not ready for payment."
    );
  }

  const verified = await verifyOffer({
    offerId: purchase.offerId,
    countryHint: countryHint ?? purchase.destinationCode,
    applyAsiaTemporaryMarkup: false,
  });
  if (!verified) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "PRICING_CHANGED",
      "Package pricing changed. Please refresh and try again."
    );
  }
  assertLivePricingMatches({
    purchase,
    partnerDiscountBps: partner.discountBps,
    partnerDiscountVersion: partner.discountVersion,
    verified,
  });

  const useWallet =
    input.useWallet !== undefined
      ? Boolean(input.useWallet)
      : purchase.useWallet;

  // Fresh balance for READY; awaiting resumes use snapshotted funding.
  let funding = calculatePartnerPurchaseFunding({
    partnerChargeCents: purchase.partnerChargeCents,
    walletBalanceCents: partner.balanceCents,
    useWallet,
  });

  if (purchase.status === PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT) {
    funding = {
      useWallet: purchase.useWallet,
      walletAppliedCents: purchase.walletAppliedCents,
      gatewayAmountCents: purchase.gatewayAmountCents,
      partnerChargeCents: purchase.partnerChargeCents,
      fundingKind:
        purchase.gatewayAmountCents <= 0
          ? "wallet_only"
          : purchase.walletAppliedCents <= 0
            ? "gateway_only"
            : "split",
    };
  }

  if (!partnerPurchaseRequiresGateway(funding)) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      "This purchase does not require card payment."
    );
  }

  const fundingSource =
    funding.walletAppliedCents > 0
      ? OrderFundingSource.PARTNER_SPLIT
      : OrderFundingSource.PARTNER_GATEWAY;

  if (purchase.status === PartnerEsimPurchaseStatus.READY) {
    await reservePartnerSplitBeforeGateway({
      partnerId: partner.partnerId,
      purchaseId: purchase.id,
      partnerChargeCents: purchase.partnerChargeCents,
      walletAppliedCents: funding.walletAppliedCents,
      gatewayAmountCents: funding.gatewayAmountCents,
      useWallet: funding.useWallet,
      fundingSource,
    });
  }

  const currency = (purchase.currency || "USD").trim().toUpperCase() || "USD";
  if (currency !== "USD") {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      "Card payment is only available in USD."
    );
  }

  const adapter = getActivePaymentAdapter();
  if (!adapter.enabled || adapter.provider !== "SIMPAISA") {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "GATEWAY_UNAVAILABLE",
      "Payment gateway is not available yet. Please try again later."
    );
  }

  const checkoutKey = partnerEsimGatewayCheckoutIdempotencyKey(
    purchase.idempotencyKey
  );

  let attempt = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
    where: { checkoutIdempotencyKey: checkoutKey },
    select: {
      id: true,
      purchaseId: true,
      gatewayAmountCents: true,
      currency: true,
      status: true,
      gatewayPaymentRef: true,
      gatewayProvider: true,
      chargeCurrency: true,
      chargeAmountMinor: true,
    },
  });

  let reusedAttempt = false;
  if (attempt) {
    reusedAttempt = true;
    if (attempt.purchaseId !== purchase.id) {
      throw new PartnerEsimPurchaseGatewayCheckoutError(
        "INVALID_STATE",
        "This purchase is unavailable."
      );
    }
    if (
      attempt.status === EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED ||
      attempt.status === EsimPurchasePaymentAttemptStatus.REFUNDED
    ) {
      throw new PartnerEsimPurchaseGatewayCheckoutError(
        "INVALID_STATE",
        "This payment was already completed."
      );
    }
    if (
      attempt.gatewayAmountCents !== funding.gatewayAmountCents ||
      attempt.currency !== currency
    ) {
      throw new PartnerEsimPurchaseGatewayCheckoutError(
        "INVALID_STATE",
        "Payment amount changed. Please reload and try again."
      );
    }
  } else {
    try {
      attempt = await prisma.partnerEsimPurchasePaymentAttempt.create({
        data: {
          purchaseId: purchase.id,
          gatewayAmountCents: funding.gatewayAmountCents,
          currency,
          gatewayProvider: PaymentGatewayProvider.SIMPAISA,
          status: EsimPurchasePaymentAttemptStatus.DRAFT,
          checkoutIdempotencyKey: checkoutKey,
        },
        select: {
          id: true,
          purchaseId: true,
          gatewayAmountCents: true,
          currency: true,
          status: true,
          gatewayPaymentRef: true,
          gatewayProvider: true,
          chargeCurrency: true,
          chargeAmountMinor: true,
        },
      });
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
      ) {
        throw error;
      }
      attempt = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
        where: { checkoutIdempotencyKey: checkoutKey },
        select: {
          id: true,
          purchaseId: true,
          gatewayAmountCents: true,
          currency: true,
          status: true,
          gatewayPaymentRef: true,
          gatewayProvider: true,
          chargeCurrency: true,
          chargeAmountMinor: true,
        },
      });
      if (!attempt || attempt.purchaseId !== purchase.id) {
        throw new PartnerEsimPurchaseGatewayCheckoutError(
          "UNAVAILABLE",
          "Payment checkout is temporarily unavailable. Please try again."
        );
      }
      reusedAttempt = true;
    }
  }

  const returnPath = partnerEsimPurchasePaymentReturnPath(attempt.id);
  const cancelPath = partnerEsimPurchasePaymentCancelPath(attempt.id);
  const existingRef = (attempt.gatewayPaymentRef ?? "").trim();
  const canResume =
    Boolean(existingRef) &&
    (attempt.status === EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT ||
      attempt.status === EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING ||
      attempt.status === EsimPurchasePaymentAttemptStatus.DRAFT);

  if (canResume && existingRef) {
    const resumed = resumeSimpaisaWalletCheckout({ returnPath });
    if (!resumed.ok) {
      throw new PartnerEsimPurchaseGatewayCheckoutError(
        resumed.code === "MISCONFIGURED" ||
          resumed.code === "GATEWAY_UNAVAILABLE"
          ? "GATEWAY_UNAVAILABLE"
          : "UNAVAILABLE",
        resumed.message
      );
    }
    return {
      purchaseId: purchase.id,
      paymentAttemptId: attempt.id,
      checkoutUrl: resumed.checkoutUrl,
      reusedAttempt,
      reusedTracker: true,
      gatewayAmountCents: funding.gatewayAmountCents,
      walletAppliedCents: funding.walletAppliedCents,
    };
  }

  const quote = quoteSimpaisaPkrChargeFromUsdCents(funding.gatewayAmountCents);
  if (!quote) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "GATEWAY_UNAVAILABLE",
      "Payment checkout quote is unavailable. Please try again."
    );
  }
  const walletFields = parseSimpaisaWalletCheckoutFields({
    walletOperatorId: input.walletOperatorId,
    customerMsisdn: input.customerMsisdn,
  });
  if (!walletFields.ok) {
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "INVALID_STATE",
      walletFields.error
    );
  }

  let session;
  try {
    session = await adapter.createCheckoutSession({
      purpose: "PARTNER_ESIM_PURCHASE",
      paymentAttemptId: attempt.id,
      purchaseId: purchase.id,
      customerUserId: partner.partnerUserId,
      chargeAmountMinor: quote.chargeAmountMinor,
      chargeCurrency: quote.chargeCurrency,
      checkoutIdempotencyKey: checkoutKey,
      returnPath,
      cancelPath,
      walletOperatorId: walletFields.walletOperatorId,
      customerMsisdn: walletFields.customerMsisdn,
    });
  } catch (error) {
    await restoreSplitWalletBestEffort({
      partnerId: partner.partnerId,
      purchaseId: purchase.id,
      walletAppliedCents: funding.walletAppliedCents,
    });
    throw error;
  }

  if (!session.ok) {
    await restoreSplitWalletBestEffort({
      partnerId: partner.partnerId,
      purchaseId: purchase.id,
      walletAppliedCents: funding.walletAppliedCents,
    });
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "GATEWAY_UNAVAILABLE",
      session.message
    );
  }

  const providerRef = (session.providerPaymentRef ?? "").trim();
  const chargeCurrency = session.chargeCurrency.trim().toUpperCase();
  const chargeAmountMinor = session.chargeAmountMinor;
  if (
    !providerRef ||
    !Number.isInteger(chargeAmountMinor) ||
    !simpaisaChargeMatchesQuote({
      usdCents: funding.gatewayAmountCents,
      chargeCurrency,
      chargeAmountMinor,
    })
  ) {
    await restoreSplitWalletBestEffort({
      partnerId: partner.partnerId,
      purchaseId: purchase.id,
      walletAppliedCents: funding.walletAppliedCents,
    });
    throw new PartnerEsimPurchaseGatewayCheckoutError(
      "GATEWAY_UNAVAILABLE",
      "Payment checkout quote did not match the PKR charge. Please try again."
    );
  }

  const masked = maskSimpaisaMsisdn(walletFields.customerMsisdn);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.partnerEsimPurchasePaymentAttempt.updateMany({
      where: {
        id: attempt!.id,
        purchaseId: purchase.id,
        status: {
          in: [
            EsimPurchasePaymentAttemptStatus.DRAFT,
            EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
            EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
          ],
        },
      },
      data: {
        status: EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
        gatewayProvider: PaymentGatewayProvider.SIMPAISA,
        gatewayPaymentRef: providerRef,
        chargeCurrency,
        chargeAmountMinor,
        fxRateSnapshot: session.fxRateSnapshot ?? quote.fxRateSnapshot,
        expiresAt: session.expiresAt,
        failureCategory: null,
        failureCode: null,
      },
    });
    if (updated.count !== 1) {
      throw new PartnerEsimPurchaseGatewayCheckoutError(
        "INVALID_STATE",
        "This payment cannot start checkout in its current state."
      );
    }

    await tx.partnerEsimPurchase.updateMany({
      where: {
        id: purchase.id,
        partnerId: partner.partnerId,
        status: PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
      },
      data: {
        useWallet: funding.useWallet,
        walletAppliedCents: funding.walletAppliedCents,
        gatewayAmountCents: funding.gatewayAmountCents,
        fundingSource,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: partner.partnerUserId,
        action: PARTNER_ESIM_PURCHASE_CHECKOUT_CREATED,
        targetType: "PartnerEsimPurchase",
        targetId: purchase.id,
        metadata: {
          purchaseId: purchase.id,
          paymentAttemptId: attempt!.id,
          gatewayAmountCents: funding.gatewayAmountCents,
          walletAppliedCents: funding.walletAppliedCents,
          fundingSource,
          gatewayProvider: PaymentGatewayProvider.SIMPAISA,
          customerMsisdnMasked: masked,
        } satisfies Prisma.InputJsonValue,
      },
    });
  });

  return {
    purchaseId: purchase.id,
    paymentAttemptId: attempt.id,
    checkoutUrl: session.checkoutUrl,
    reusedAttempt,
    reusedTracker: false,
    gatewayAmountCents: funding.gatewayAmountCents,
    walletAppliedCents: funding.walletAppliedCents,
  };
}
