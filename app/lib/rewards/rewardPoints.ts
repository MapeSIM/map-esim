import { payablePackageCents } from "@/app/lib/promo/promoDiscount";
import { REWARD_CENTS_PER_POINT } from "@/app/lib/rewards/rewardConstants";

/**
 * Floor dollars of eligible customer package cents. Never rounding.
 * Wallet/gateway split is not an input.
 */
export function calculateRewardPointsEarned(eligibleSpendCents: number): number {
  if (!Number.isInteger(eligibleSpendCents) || eligibleSpendCents < 0) {
    throw new Error("INVALID_REWARD_SPEND");
  }
  return Math.floor(eligibleSpendCents / REWARD_CENTS_PER_POINT);
}

export function eligibleRewardSpendCents(
  priceCents: number,
  promoDiscountCents: number
): number {
  return payablePackageCents(priceCents, promoDiscountCents);
}
