/**
 * Shared provider-refresh constants/validation (safe for client + QA).
 */

export const PROVIDER_REFRESH_REASON_MIN = 5;
export const PROVIDER_REFRESH_REASON_MAX = 200;
export const PROVIDER_REFRESH_STALE_CLAIM_MS = 90_000;

export function parseProviderRefreshReason(
  raw: FormDataEntryValue | string | null | undefined
): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (reason.length < PROVIDER_REFRESH_REASON_MIN) {
    return {
      ok: false,
      error: `Enter a reason (at least ${PROVIDER_REFRESH_REASON_MIN} characters).`,
    };
  }
  if (reason.length > PROVIDER_REFRESH_REASON_MAX) {
    return {
      ok: false,
      error: `Reason must be at most ${PROVIDER_REFRESH_REASON_MAX} characters.`,
    };
  }
  return { ok: true, reason };
}

export function isProviderRefreshSourceType(
  raw: string | null | undefined
): raw is "wallet_purchase" | "assignment" {
  const v = (raw ?? "").trim();
  return v === "wallet_purchase" || v === "assignment";
}

export type ProviderRefreshSourceType = "wallet_purchase" | "assignment";
