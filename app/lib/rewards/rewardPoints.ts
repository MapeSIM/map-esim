import { payablePackageCents } from "@/app/lib/promo/promoDiscount";
import {
  REWARD_CENTS_PER_POINT,
  REWARD_MIN_REDEMPTION_POINTS,
} from "@/app/lib/rewards/rewardConstants";

/**
 * Floor dollars of eligible customer package cents. Never rounding.
 * Wallet/gateway split is not an input. Reward redemption is not a discount
 * for earning — use post-promo cents BEFORE rewards.
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

export function isRewardRedemptionEligible(pointsBalance: number): boolean {
  return Number.isInteger(pointsBalance) && pointsBalance >= REWARD_MIN_REDEMPTION_POINTS;
}

/** 1 point = $0.01 = 1 USD cent. */
export function rewardValueCentsFromPoints(points: number): number {
  if (!Number.isInteger(points) || points < 0) {
    throw new Error("INVALID_REWARD_POINTS");
  }
  return points;
}

/**
 * Maximum points to apply: min(balance, remaining package cents).
 * Eligibility is pre-redemption balance >= 100. Applied amount may be < 100
 * when the remaining package is under $1.
 */
export function calculateRewardPointsToApply(options: {
  afterPromoCents: number;
  pointsBalance: number;
  useRewards: boolean;
}): { eligible: boolean; pointsApplied: number } {
  const afterPromoCents = options.afterPromoCents;
  const pointsBalance = options.pointsBalance;
  if (!Number.isInteger(afterPromoCents) || afterPromoCents < 0) {
    throw new Error("INVALID_REWARD_SPEND");
  }
  if (!Number.isInteger(pointsBalance)) {
    throw new Error("INVALID_REWARD_BALANCE");
  }
  const eligible = isRewardRedemptionEligible(pointsBalance);
  if (!options.useRewards || !eligible) {
    return { eligible, pointsApplied: 0 };
  }
  return {
    eligible: true,
    pointsApplied: Math.min(pointsBalance, afterPromoCents),
  };
}
