import { PromoDiscountType } from "@prisma/client";

export type PromoDiscountInput = {
  priceCents: number;
  discountType: PromoDiscountType;
  discountValue: number;
};

export type PromoDiscountResult = {
  originalPriceCents: number;
  discountCents: number;
  finalPriceCents: number;
};

/**
 * Server-authoritative promo math. Integer cents only.
 * PERCENT uses nearest-cent rounding: Math.round(price * percent / 100).
 * Fixed and percent discounts never exceed the package price.
 */
export function calculatePromoDiscount(
  input: PromoDiscountInput
): PromoDiscountResult {
  const priceCents = input.priceCents;
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new Error("INVALID_PROMO_PRICE");
  }

  let raw = 0;
  if (input.discountType === PromoDiscountType.PERCENT) {
    if (
      !Number.isInteger(input.discountValue) ||
      input.discountValue < 1 ||
      input.discountValue > 100
    ) {
      throw new Error("INVALID_PROMO_PERCENT");
    }
    raw = Math.round((priceCents * input.discountValue) / 100);
  } else if (input.discountType === PromoDiscountType.FIXED_USD) {
    if (!Number.isInteger(input.discountValue) || input.discountValue < 1) {
      throw new Error("INVALID_PROMO_FIXED");
    }
    raw = input.discountValue;
  } else {
    throw new Error("INVALID_PROMO_TYPE");
  }

  const discountCents = Math.min(Math.max(0, raw), priceCents);
  return {
    originalPriceCents: priceCents,
    discountCents,
    finalPriceCents: priceCents - discountCents,
  };
}

export function payablePackageCents(
  priceCents: number,
  promoDiscountCents: number
): number {
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new Error("INVALID_PACKAGE_PRICE");
  }
  const discount = Number.isInteger(promoDiscountCents)
    ? Math.max(0, promoDiscountCents)
    : 0;
  return Math.max(0, priceCents - Math.min(discount, priceCents));
}
