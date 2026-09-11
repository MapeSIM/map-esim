/**
 * Offline-safe referral program settings helpers (no DB / server-only).
 */
import { formatUsdCents } from "@/app/lib/wallet/display";

export const REFERRAL_PROGRAM_CONFIG_ID = "default";

/** Matches Day 9 hardcoded $5.00 fixed reward. */
export const REFERRAL_PROGRAM_DEFAULTS = {
  enabled: true,
  rewardType: "FIXED_AMOUNT" as const,
  rewardValue: 500,
  minPurchaseCents: 0,
  maxRewardCents: null as number | null,
};

export const REFERRAL_FIXED_REWARD_MIN_CENTS = 1; // $0.01
export const REFERRAL_FIXED_REWARD_MAX_CENTS = 50_000; // $500.00
export const REFERRAL_PERCENT_BPS_MIN = 1; // 0.01%
export const REFERRAL_PERCENT_BPS_MAX = 10_000; // 100%
export const REFERRAL_MIN_PURCHASE_MAX_CENTS = 50_000;
export const REFERRAL_MAX_REWARD_CAP_MAX_CENTS = 50_000;

export type ReferralRewardTypeValue = "FIXED_AMOUNT" | "PERCENTAGE";

export type ReferralProgramSettings = {
  enabled: boolean;
  rewardType: ReferralRewardTypeValue;
  rewardValue: number;
  minPurchaseCents: number;
  maxRewardCents: number | null;
};

export type ReferralRewardCalcResult =
  | { ok: true; amountCents: number }
  | {
      ok: false;
      reason:
        | "disabled"
        | "below_min_purchase"
        | "invalid_settings"
        | "zero_reward";
    };

/**
 * Compute referrer wallet credit from admin settings + qualifying purchase cents.
 * Integer-only math. Does not mutate state.
 */
export function calculateReferralRewardCents(options: {
  settings: ReferralProgramSettings;
  purchasePriceCents: number;
}): ReferralRewardCalcResult {
  const { settings } = options;
  const purchasePriceCents = options.purchasePriceCents;

  if (!settings.enabled) {
    return { ok: false, reason: "disabled" };
  }
  if (
    !Number.isInteger(purchasePriceCents) ||
    !Number.isSafeInteger(purchasePriceCents) ||
    purchasePriceCents < 0
  ) {
    return { ok: false, reason: "invalid_settings" };
  }
  if (purchasePriceCents < settings.minPurchaseCents) {
    return { ok: false, reason: "below_min_purchase" };
  }

  let amountCents = 0;
  if (settings.rewardType === "FIXED_AMOUNT") {
    amountCents = settings.rewardValue;
  } else if (settings.rewardType === "PERCENTAGE") {
    // rewardValue = basis points (10_000 = 100%).
    amountCents = Math.floor(
      (purchasePriceCents * settings.rewardValue) / 10_000
    );
    if (
      settings.maxRewardCents != null &&
      Number.isInteger(settings.maxRewardCents) &&
      settings.maxRewardCents >= 0
    ) {
      amountCents = Math.min(amountCents, settings.maxRewardCents);
    }
  } else {
    return { ok: false, reason: "invalid_settings" };
  }

  if (
    !Number.isInteger(amountCents) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0
  ) {
    return { ok: false, reason: "zero_reward" };
  }

  return { ok: true, amountCents };
}

/** Customer-facing reward blurb from current settings. */
export function formatReferralRewardCopy(settings: ReferralProgramSettings): string {
  if (!settings.enabled) {
    return "Referral rewards are currently paused.";
  }
  if (settings.rewardType === "FIXED_AMOUNT") {
    return `${formatUsdCents(settings.rewardValue)} wallet credit per qualified referral`;
  }
  const percent = (settings.rewardValue / 100).toFixed(
    settings.rewardValue % 100 === 0 ? 0 : 2
  );
  const cap =
    settings.maxRewardCents != null
      ? ` (max ${formatUsdCents(settings.maxRewardCents)})`
      : "";
  return `${percent}% of first purchase as wallet credit${cap}`;
}

export function parseReferralRewardType(
  raw: unknown
): ReferralRewardTypeValue | null {
  const v = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (v === "FIXED_AMOUNT" || v === "PERCENTAGE") return v;
  return null;
}

export function parseEnabledFlag(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}
