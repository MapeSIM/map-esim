export const REWARDS_AUDIT = {
  purchaseEarned: "rewards.purchase_earned",
} as const;

export const REWARD_POINTS_PER_USD = 1;
export const REWARD_CENTS_PER_POINT = 100;
export const REWARD_MIN_REDEMPTION_POINTS = 100;

export const REWARDS_COPY = {
  rate: "100 points = $1 reward",
  earnMore: "Earn more points to unlock rewards.",
  redemptionComing: "Reward redemption is coming next.",
} as const;

export function purchaseEarnIdempotencyKey(purchaseId: string): string {
  return `customer_reward_purchase_earn_${purchaseId}`;
}
