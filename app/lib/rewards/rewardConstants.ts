export const REWARDS_AUDIT = {
  purchaseEarned: "rewards.purchase_earned",
  redemptionCompleted: "rewards.redemption_completed",
  redemptionRestored: "rewards.redemption_restored",
  redemptionRestoredForRefund: "rewards.redemption_restored_for_refund",
  purchaseEarnReversedForRefund: "rewards.purchase_earn_reversed_for_refund",
} as const;

export const REWARD_POINTS_PER_USD = 1;
export const REWARD_CENTS_PER_POINT = 100;
export const REWARD_MIN_REDEMPTION_POINTS = 100;

export const REWARDS_COPY = {
  rate: "100 points = $1 reward",
  earnMore: "Earn more points to unlock rewards.",
  useAtCheckout: "Use rewards at checkout when you buy an eSIM.",
} as const;

export const REWARDS_REFRESH_CHECKOUT_MESSAGE =
  "Your rewards balance changed. Please refresh checkout and try again.";

export function purchaseEarnIdempotencyKey(purchaseId: string): string {
  return `customer_reward_purchase_earn_${purchaseId}`;
}

export function purchaseRedemptionIdempotencyKey(purchaseId: string): string {
  return `customer_reward_redemption_${purchaseId}`;
}

export function purchaseRedemptionRestoreIdempotencyKey(
  purchaseId: string
): string {
  return `customer_reward_redemption_restore_${purchaseId}`;
}

export function purchaseRefundRedemptionRestoreIdempotencyKey(
  purchaseId: string
): string {
  return `customer_reward_refund_redemption_restore_${purchaseId}`;
}

export function purchaseEarnReversalIdempotencyKey(purchaseId: string): string {
  return `customer_reward_purchase_earn_reversal_${purchaseId}`;
}

export function isRefundRedemptionRestoreIdempotencyKey(key: string): boolean {
  return key.startsWith("customer_reward_refund_redemption_restore_");
}

export function pointsNeededToUnlockRewards(pointsBalance: number): number {
  if (!Number.isInteger(pointsBalance) || pointsBalance >= REWARD_MIN_REDEMPTION_POINTS) {
    return 0;
  }
  return REWARD_MIN_REDEMPTION_POINTS - pointsBalance;
}
