/**
 * Partner eSIM purchase prepare + reserve (funds only).
 * No provider PURCHASE/write, no Order, no UI.
 */
import "server-only";

import {
  OrderFundingSource,
  PartnerEsimPurchaseStatus,
  Prisma,
  Role,
} from "@prisma/client";
import {
  OperationalControlBlockedError,
  OperationalControlUnavailableError,
} from "@/app/lib/admin/operationalControlsPolicy";
import { OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE } from "@/app/lib/admin/operationalControlsShared";
import { usdPriceToCents } from "@/app/lib/esim/assignmentValidation";
import { prisma } from "@/app/lib/db";
import {
  calculatePartnerPurchasePricing,
  PARTNER_PRICING_UNAVAILABLE_MESSAGE,
} from "@/app/lib/partner/partnerPricing";
import {
  assertPartnerPreDebitProviderGates,
  assertPartnerPurchaseInitiationAllowed,
} from "@/app/lib/partner/partnerPurchaseGuards";
import {
  PartnerPurchaseWalletError,
  reservePartnerPurchaseFundsInTx,
} from "@/app/lib/partner/partnerPurchaseWallet";
import { VesimEnvironmentError } from "@/app/lib/vesim/environment";
import {
  sanitizeCountryHint,
  verifyOfferAuthoritative,
  type VerifiedCheckoutOffer,
} from "@/app/lib/vesim/server";

export type PartnerOfferVerifier = (options: {
  offerId: string;
  countryHint?: string | null;
}) => Promise<VerifiedCheckoutOffer | null>;

export type PreparePartnerEsimPurchaseInput = {
  partnerUserId: string;
  offerId: string;
  idempotencyKey: string;
  countryHint?: string | null;
  /** Test seam only — defaults to verifyOfferAuthoritative. */
  verifyOffer?: PartnerOfferVerifier;
};

export type PreparePartnerEsimPurchaseResult = {
  purchaseId: string;
  partnerId: string;
  status: PartnerEsimPurchaseStatus;
  duplicate: boolean;
};

export type ReservePartnerEsimPurchaseInput = {
  partnerUserId: string;
  purchaseId: string;
  countryHint?: string | null;
  verifyOffer?: PartnerOfferVerifier;
};

export type ReservePartnerEsimPurchaseResult = {
  purchaseId: string;
  partnerId: string;
  status: PartnerEsimPurchaseStatus;
  debitTransactionId: string | null;
  duplicate: boolean;
};

export class PartnerEsimPurchaseError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "PARTNER_UNAVAILABLE"
    | "INVALID_IDEMPOTENCY"
    | "OFFER_UNAVAILABLE"
    | "PRICING_CHANGED"
    | "INVALID_STATE"
    | "INSUFFICIENT_FUNDS"
    | "WALLET_UNAVAILABLE"
    | "PROVIDER_FAILED"
    | "RECONCILIATION_REQUIRED"
    | "PROVIDER_IN_FLIGHT"
    | "UNAVAILABLE";

  constructor(code: PartnerEsimPurchaseError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "PartnerEsimPurchaseError";
  }
}

type CommercialSnapshot = {
  offerId: string;
  destinationCode: string | null;
  destinationName: string | null;
  planName: string | null;
  dataAllowance: string | null;
  validity: string | null;
  retailPriceCents: number;
  providerCostCents: number;
  discountBps: number;
  discountVersion: number;
  partnerChargeCents: number;
  currency: string;
};

function assertIdempotencyKey(raw: string): string {
  const idempotencyKey = raw.trim();
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
  ) {
    throw new PartnerEsimPurchaseError(
      "INVALID_IDEMPOTENCY",
      "This purchase request could not be processed. Please reload and try again."
    );
  }
  return idempotencyKey;
}

function mapWalletError(error: unknown): never {
  if (error instanceof PartnerPurchaseWalletError) {
    if (error.code === "INSUFFICIENT_FUNDS") {
      throw new PartnerEsimPurchaseError(
        "INSUFFICIENT_FUNDS",
        "Partner wallet balance is not enough for this package."
      );
    }
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

function throwIfPreDebitGateBlocks(error: unknown): never {
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

async function runPartnerPurchaseInitiationGate(): Promise<void> {
  try {
    await assertPartnerPurchaseInitiationAllowed();
  } catch (error) {
    throwIfPreDebitGateBlocks(error);
  }
}

async function runPartnerPreDebitProviderGates(): Promise<void> {
  try {
    await assertPartnerPreDebitProviderGates();
  } catch (error) {
    throwIfPreDebitGateBlocks(error);
  }
}

async function loadActivePartnerForPurchase(partnerUserId: string) {
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
      role: true,
      deletedAt: true,
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
    throw new PartnerEsimPurchaseError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }

  return {
    partnerUserId: user.id,
    partnerId: user.partnerProfile.id,
    discountBps: user.partnerProfile.discountBps,
    discountVersion: user.partnerProfile.discountVersion,
    walletAccountId: user.partnerProfile.walletAccount?.id ?? null,
    balanceCents: user.partnerProfile.walletAccount?.balanceCents ?? null,
  };
}

function commercialFromVerifiedOffer(
  offer: VerifiedCheckoutOffer,
  discountBps: number,
  discountVersion: number
): CommercialSnapshot {
  const retailPriceCents = usdPriceToCents(offer.priceUSD);
  const providerCostCents = usdPriceToCents(offer.providerPriceUSD);
  if (
    retailPriceCents == null ||
    retailPriceCents <= 0 ||
    providerCostCents == null ||
    providerCostCents < 0
  ) {
    throw new PartnerEsimPurchaseError(
      "OFFER_UNAVAILABLE",
      "The selected package is unavailable."
    );
  }

  const currency = (offer.currency || "USD").trim().toUpperCase() || "USD";
  if (currency !== "USD") {
    throw new PartnerEsimPurchaseError(
      "OFFER_UNAVAILABLE",
      "The selected package is unavailable."
    );
  }

  const priced = calculatePartnerPurchasePricing({
    retailPriceCents,
    discountBps,
    providerCostCents,
  });
  if (!priced.ok) {
    throw new PartnerEsimPurchaseError(
      "OFFER_UNAVAILABLE",
      priced.code === "BELOW_PROVIDER_COST"
        ? PARTNER_PRICING_UNAVAILABLE_MESSAGE
        : "The selected package is unavailable."
    );
  }

  return {
    offerId: offer.offerId,
    destinationCode: offer.countryCode,
    destinationName: offer.countryName || offer.countryCode,
    planName: offer.name,
    dataAllowance: offer.dataFormatted || null,
    validity:
      offer.durationDays != null ? `${offer.durationDays} Days` : null,
    retailPriceCents: priced.retailPriceCents,
    providerCostCents: priced.providerCostCents,
    discountBps: priced.discountBps,
    discountVersion,
    partnerChargeCents: priced.partnerChargeCents,
    currency,
  };
}

function snapshotsMatchOffer(
  purchase: {
    retailPriceCents: number;
    providerCostCents: number;
    offerId: string;
  },
  snapshot: CommercialSnapshot
): boolean {
  return (
    purchase.offerId === snapshot.offerId &&
    purchase.retailPriceCents === snapshot.retailPriceCents &&
    purchase.providerCostCents === snapshot.providerCostCents
  );
}

/**
 * Create or reuse a READY Partner purchase with immutable commercial snapshots.
 * Never debits wallet or calls provider PURCHASE.
 */
export async function preparePartnerEsimPurchase(
  input: PreparePartnerEsimPurchaseInput
): Promise<PreparePartnerEsimPurchaseResult> {
  const idempotencyKey = assertIdempotencyKey(input.idempotencyKey);
  const offerId = input.offerId.trim();
  if (!offerId || offerId.length > 120) {
    throw new PartnerEsimPurchaseError(
      "OFFER_UNAVAILABLE",
      "The selected package is unavailable."
    );
  }
  const countryHint = sanitizeCountryHint(input.countryHint ?? null);
  const verifyOffer = input.verifyOffer ?? verifyOfferAuthoritative;

  const partner = await loadActivePartnerForPurchase(input.partnerUserId);
  if (!partner.walletAccountId || partner.balanceCents == null) {
    throw new PartnerEsimPurchaseError(
      "WALLET_UNAVAILABLE",
      "Partner wallet is unavailable."
    );
  }

  const existing = await prisma.partnerEsimPurchase.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      partnerId: true,
      offerId: true,
      status: true,
    },
  });
  if (existing) {
    if (
      existing.partnerId !== partner.partnerId ||
      existing.offerId !== offerId
    ) {
      throw new PartnerEsimPurchaseError(
        "INVALID_IDEMPOTENCY",
        "This purchase request could not be processed. Please reload and try again."
      );
    }
    return {
      purchaseId: existing.id,
      partnerId: partner.partnerId,
      status: existing.status,
      duplicate: true,
    };
  }

  await runPartnerPurchaseInitiationGate();

  const verified = await verifyOffer({
    offerId,
    countryHint,
    applyAsiaTemporaryMarkup: false,
  });
  if (!verified) {
    throw new PartnerEsimPurchaseError(
      "OFFER_UNAVAILABLE",
      "The selected package is unavailable."
    );
  }

  const snapshot = commercialFromVerifiedOffer(
    verified,
    partner.discountBps,
    partner.discountVersion
  );

  try {
    const created = await prisma.partnerEsimPurchase.create({
      data: {
        partnerId: partner.partnerId,
        offerId: snapshot.offerId,
        destinationCode: snapshot.destinationCode,
        destinationName: snapshot.destinationName,
        planName: snapshot.planName,
        dataAllowance: snapshot.dataAllowance,
        validity: snapshot.validity,
        retailPriceCents: snapshot.retailPriceCents,
        discountBps: snapshot.discountBps,
        discountVersion: snapshot.discountVersion,
        partnerChargeCents: snapshot.partnerChargeCents,
        providerCostCents: snapshot.providerCostCents,
        currency: snapshot.currency,
        fundingSource: OrderFundingSource.PARTNER_BALANCE,
        status: PartnerEsimPurchaseStatus.READY,
        idempotencyKey,
      },
      select: { id: true, status: true },
    });

    return {
      purchaseId: created.id,
      partnerId: partner.partnerId,
      status: created.status,
      duplicate: false,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.partnerEsimPurchase.findUnique({
        where: { idempotencyKey },
        select: {
          id: true,
          partnerId: true,
          offerId: true,
          status: true,
        },
      });
      if (
        raced &&
        raced.partnerId === partner.partnerId &&
        raced.offerId === offerId
      ) {
        return {
          purchaseId: raced.id,
          partnerId: partner.partnerId,
          status: raced.status,
          duplicate: true,
        };
      }
      throw new PartnerEsimPurchaseError(
        "INVALID_IDEMPOTENCY",
        "This purchase request could not be processed. Please reload and try again."
      );
    }
    throw error;
  }
}

/**
 * Atomically claim READY → reserve Partner wallet → PROVIDER_PENDING.
 * Provider PURCHASE and Order creation are later slices.
 */
export async function reservePartnerEsimPurchase(
  input: ReservePartnerEsimPurchaseInput
): Promise<ReservePartnerEsimPurchaseResult> {
  const purchaseId = input.purchaseId.trim();
  if (!purchaseId || purchaseId.length > 64) {
    throw new PartnerEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }
  const countryHint = sanitizeCountryHint(input.countryHint ?? null);
  const verifyOffer = input.verifyOffer ?? verifyOfferAuthoritative;

  const partner = await loadActivePartnerForPurchase(input.partnerUserId);
  await runPartnerPurchaseInitiationGate();

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
      currency: true,
      debitTransactionId: true,
      destinationCode: true,
    },
  });

  if (!purchase || purchase.partnerId !== partner.partnerId) {
    throw new PartnerEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  if (purchase.status === PartnerEsimPurchaseStatus.PROVIDER_PENDING) {
    if (!purchase.debitTransactionId) {
      throw new PartnerEsimPurchaseError(
        "INVALID_STATE",
        "This purchase is under review. Please contact support."
      );
    }
    return {
      purchaseId: purchase.id,
      partnerId: partner.partnerId,
      status: PartnerEsimPurchaseStatus.PROVIDER_PENDING,
      debitTransactionId: purchase.debitTransactionId,
      duplicate: true,
    };
  }

  if (purchase.status !== PartnerEsimPurchaseStatus.READY) {
    throw new PartnerEsimPurchaseError(
      "INVALID_STATE",
      "This purchase is unavailable."
    );
  }

  // Offer/pricing race check before any money movement.
  const verified = await verifyOffer({
    offerId: purchase.offerId,
    countryHint: countryHint ?? purchase.destinationCode,
    applyAsiaTemporaryMarkup: false,
  });
  if (!verified) {
    throw new PartnerEsimPurchaseError(
      "PRICING_CHANGED",
      "Package pricing changed. Please refresh and try again."
    );
  }

  // Recompute charge with *purchase* discount snapshot vs live offer retail/cost.
  // Discount version/active Partner are enforced again inside the transaction.
  const liveFromOffer = commercialFromVerifiedOffer(
    verified,
    purchase.discountBps,
    purchase.discountVersion
  );
  if (
    !snapshotsMatchOffer(purchase, liveFromOffer) ||
    liveFromOffer.partnerChargeCents !== purchase.partnerChargeCents ||
    liveFromOffer.discountBps !== purchase.discountBps
  ) {
    throw new PartnerEsimPurchaseError(
      "PRICING_CHANGED",
      "Package pricing changed. Please refresh and try again."
    );
  }

  // Provider-order gate + VeSIM config must pass BEFORE permanent wallet debit.
  await runPartnerPreDebitProviderGates();

  try {
    const reserved = await prisma.$transaction(async (tx) => {
      const profile = await tx.partnerProfile.findUnique({
        where: { id: partner.partnerId },
        select: {
          id: true,
          disabledAt: true,
          discountVersion: true,
          discountBps: true,
          user: { select: { role: true, deletedAt: true } },
        },
      });

      if (
        !profile ||
        profile.disabledAt ||
        !profile.user ||
        profile.user.deletedAt ||
        profile.user.role !== Role.PARTNER
      ) {
        throw new PartnerEsimPurchaseError(
          "PARTNER_UNAVAILABLE",
          "Partner is unavailable."
        );
      }

      if (
        profile.discountVersion !== purchase.discountVersion ||
        profile.discountBps !== purchase.discountBps
      ) {
        throw new PartnerEsimPurchaseError(
          "PRICING_CHANGED",
          "Partner pricing changed. Please refresh and try again."
        );
      }

      const claimed = await tx.partnerEsimPurchase.updateMany({
        where: {
          id: purchase.id,
          partnerId: partner.partnerId,
          status: PartnerEsimPurchaseStatus.READY,
        },
        data: {
          status: PartnerEsimPurchaseStatus.FUNDS_RESERVED,
        },
      });
      if (claimed.count !== 1) {
        const again = await tx.partnerEsimPurchase.findUnique({
          where: { id: purchase.id },
          select: {
            status: true,
            debitTransactionId: true,
          },
        });
        if (
          again?.status === PartnerEsimPurchaseStatus.PROVIDER_PENDING &&
          again.debitTransactionId
        ) {
          return {
            duplicate: true as const,
            debitTransactionId: again.debitTransactionId,
          };
        }
        throw new PartnerEsimPurchaseError(
          "INVALID_STATE",
          "This purchase is unavailable."
        );
      }

      let debit;
      try {
        debit = await reservePartnerPurchaseFundsInTx(tx, {
          partnerId: partner.partnerId,
          partnerEsimPurchaseId: purchase.id,
          amountCents: purchase.partnerChargeCents,
        });
      } catch (error) {
        mapWalletError(error);
      }

      await tx.partnerEsimPurchase.update({
        where: { id: purchase.id },
        data: {
          status: PartnerEsimPurchaseStatus.PROVIDER_PENDING,
          debitTransactionId: debit.transactionId,
        },
      });

      return {
        duplicate: false as const,
        debitTransactionId: debit.transactionId,
      };
    });

    return {
      purchaseId: purchase.id,
      partnerId: partner.partnerId,
      status: PartnerEsimPurchaseStatus.PROVIDER_PENDING,
      debitTransactionId: reserved.debitTransactionId,
      duplicate: reserved.duplicate,
    };
  } catch (error) {
    if (error instanceof PartnerEsimPurchaseError) throw error;
    mapWalletError(error);
  }
}
