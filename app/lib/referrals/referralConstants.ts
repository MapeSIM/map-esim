/** Customer referral MVP constants (UI/copy + ledger keys). */

export const REFERRAL_COOKIE_NAME = "map_esim_ref";
export const REFERRAL_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

/**
 * Default fixed reward cents used to seed admin program settings.
 * Runtime rewards read CustomerReferralProgramConfig — do not hardcode payouts.
 */
export const REFERRAL_REWARD_CENTS = 500; // $5.00 USD seed default

export const REFERRAL_REWARD_REFERENCE_TYPE = "REFERRAL_REWARD";

export const REFERRAL_AUDIT = {
  attached: "referral.attached",
  rewarded: "referral.rewarded",
  rewardFailed: "referral.reward_failed",
  markedIneligible: "referral.marked_ineligible",
} as const;

export const REFERRAL_COPY = {
  cardTitle: "Invite friends",
  cardSubtitle:
    "Share your link. Earn a wallet credit when they complete their first eSIM purchase.",
  /** Fallback only — prefer formatReferralRewardCopy(settings). */
  rewardLabel: "$5.00 wallet credit per qualified referral",
  copyButton: "Copy link",
  copiedButton: "Copied",
} as const;

export function referralRewardIdempotencyKey(referralId: string): string {
  return `customer_referral_reward_${referralId}`;
}
