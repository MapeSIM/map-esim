/**
 * Partner eSIM split-payment feature flag (Phase 2).
 * Default off — wallet-only purchases unchanged until explicitly enabled.
 */

/** Flip to true only when split checkout is approved for all environments. */
export const PARTNER_ESIM_SPLIT_PAYMENT_HARD_ENABLED = false;

export const PARTNER_ESIM_SPLIT_PAYMENT_ENABLED_ENV =
  "PARTNER_ESIM_SPLIT_PAYMENT_ENABLED";

/**
 * Exact env "true" enables split when hard flag is false.
 * Exact env "false" cannot enable while hard flag is false (fail closed).
 * Hard flag true always enables (for future cutover).
 */
export function isPartnerEsimSplitPaymentEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (PARTNER_ESIM_SPLIT_PAYMENT_HARD_ENABLED) return true;
  return env[PARTNER_ESIM_SPLIT_PAYMENT_ENABLED_ENV] === "true";
}
