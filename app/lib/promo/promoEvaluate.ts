import "server-only";

import {
  PromoDiscountType,
  PromoRedemptionStatus,
  WalletEsimPurchaseStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { calculatePromoDiscount } from "@/app/lib/promo/promoDiscount";
import {
  PROMO_CUSTOMER_MESSAGES,
  type PromoCustomerErrorCode,
} from "@/app/lib/promo/promoMessages";
import { normalizePromoCode } from "@/app/lib/promo/promoCode";

export class PromoEvaluateError extends Error {
  readonly code: PromoCustomerErrorCode;

  constructor(code: PromoCustomerErrorCode) {
    super(PROMO_CUSTOMER_MESSAGES[code]);
    this.code = code;
    this.name = "PromoEvaluateError";
  }
}

export type PromoEvaluateContext = {
  customerUserId: string;
  purchaseId: string;
  offerId: string;
  destinationCode: string | null;
  priceCents: number;
  now?: Date;
};

export type EvaluatedPromo = {
  promoCodeId: string;
  code: string;
  discountType: PromoDiscountType;
  discountValue: number;
  originalPriceCents: number;
  discountCents: number;
  finalPriceCents: number;
};

type PromoWithApplicability = Prisma.PromoCodeGetPayload<{
  include: { destinations: true; offers: true };
}>;

export async function evaluateCustomerPromo(options: {
  code: string;
  context: PromoEvaluateContext;
}): Promise<EvaluatedPromo> {
  const normalized = normalizePromoCode(options.code);
  if (!normalized) {
    throw new PromoEvaluateError("INVALID");
  }

  const promo = await prisma.promoCode.findUnique({
    where: { code: normalized },
    include: { destinations: true, offers: true },
  });
  if (!promo) {
    throw new PromoEvaluateError("INVALID");
  }

  return evaluateLoadedPromo(promo, options.context);
}

export function evaluateLoadedPromo(
  promo: PromoWithApplicability,
  context: PromoEvaluateContext
): EvaluatedPromo {
  const now = context.now ?? new Date();

  if (!promo.isActive) {
    throw new PromoEvaluateError("INACTIVE");
  }
  if (promo.startsAt && promo.startsAt.getTime() > now.getTime()) {
    throw new PromoEvaluateError("NOT_STARTED");
  }
  if (promo.endsAt && promo.endsAt.getTime() <= now.getTime()) {
    throw new PromoEvaluateError("EXPIRED");
  }
  if (
    promo.minimumOrderCents != null &&
    context.priceCents < promo.minimumOrderCents
  ) {
    throw new PromoEvaluateError("MIN_ORDER");
  }
  if (!destinationAllowed(promo, context.destinationCode)) {
    throw new PromoEvaluateError("NOT_APPLICABLE");
  }
  if (!offerAllowed(promo, context.offerId)) {
    throw new PromoEvaluateError("NOT_APPLICABLE");
  }

  const priced = calculatePromoDiscount({
    priceCents: context.priceCents,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
  });

  return {
    promoCodeId: promo.id,
    code: promo.code,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    originalPriceCents: priced.originalPriceCents,
    discountCents: priced.discountCents,
    finalPriceCents: priced.finalPriceCents,
  };
}

export async function assertPromoUsageAvailable(options: {
  promo: Pick<
    PromoWithApplicability,
    "id" | "totalUsageLimit" | "perCustomerUsageLimit" | "firstOrderOnly"
  >;
  customerUserId: string;
  purchaseId: string;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const db = options.tx ?? prisma;
  const promo = options.promo;

  if (promo.firstOrderOnly) {
    const prior = await db.walletEsimPurchase.count({
      where: {
        customerUserId: options.customerUserId,
        status: WalletEsimPurchaseStatus.COMPLETED,
        id: { not: options.purchaseId },
      },
    });
    if (prior > 0) {
      throw new PromoEvaluateError("FIRST_ORDER_ONLY");
    }
  }

  if (promo.totalUsageLimit != null) {
    const used = await db.promoCodeRedemption.count({
      where: {
        promoCodeId: promo.id,
        status: {
          in: [PromoRedemptionStatus.HELD, PromoRedemptionStatus.COMPLETED],
        },
      },
    });
    if (used >= promo.totalUsageLimit) {
      throw new PromoEvaluateError("USAGE_LIMIT");
    }
  }

  if (promo.perCustomerUsageLimit != null) {
    const used = await db.promoCodeRedemption.count({
      where: {
        promoCodeId: promo.id,
        customerUserId: options.customerUserId,
        status: {
          in: [PromoRedemptionStatus.HELD, PromoRedemptionStatus.COMPLETED],
        },
      },
    });
    if (used >= promo.perCustomerUsageLimit) {
      throw new PromoEvaluateError("CUSTOMER_LIMIT");
    }
  }
}

function destinationAllowed(
  promo: PromoWithApplicability,
  destinationCode: string | null
): boolean {
  if (promo.destinations.length === 0) return true;
  const code = (destinationCode ?? "").trim();
  if (!code) return false;
  return promo.destinations.some((row) => row.destinationCode === code);
}

function offerAllowed(
  promo: PromoWithApplicability,
  offerId: string
): boolean {
  if (promo.offers.length === 0) return true;
  const id = offerId.trim();
  if (!id) return false;
  return promo.offers.some((row) => row.offerId === id);
}
