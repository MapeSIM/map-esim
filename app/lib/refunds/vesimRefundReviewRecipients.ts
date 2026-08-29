/**
 * Pure recipient parsing for Admin → VeSIM refund-review email.
 * Env names only — never hardcode operational To/CC addresses here.
 * Safe for offline QA (no server-only import).
 */

import { isValidEmail } from "@/app/lib/email/isValidEmail";

export const VESIM_REFUND_REVIEW_EMAIL_ENV = "VESIM_REFUND_REVIEW_EMAIL";
export const VESIM_REFUND_REVIEW_CC_ENV = "VESIM_REFUND_REVIEW_CC";

export const VESIM_REFUND_REVIEW_MAX_CC = 20;

export type VesimRefundReviewRecipients =
  | { ok: true; to: string; cc: string[] }
  | {
      ok: false;
      code: "missing_to" | "invalid_to" | "invalid_cc";
    };

/**
 * Parse To + optional comma-separated CC from raw env strings.
 * Fail closed on missing/invalid To or any invalid CC entry.
 */
export function parseVesimRefundReviewRecipients(options: {
  toRaw: string | null | undefined;
  ccRaw: string | null | undefined;
}): VesimRefundReviewRecipients {
  const to = String(options.toRaw ?? "")
    .trim()
    .toLowerCase();
  if (!to) return { ok: false, code: "missing_to" };
  if (!isValidEmail(to) || to.length > 254) {
    return { ok: false, code: "invalid_to" };
  }

  const ccText = String(options.ccRaw ?? "").trim();
  if (!ccText) {
    return { ok: true, to, cc: [] };
  }

  const parts = ccText
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  if (!parts.length) {
    return { ok: true, to, cc: [] };
  }

  const seen = new Set<string>([to]);
  const cc: string[] = [];
  for (const p of parts) {
    if (!isValidEmail(p) || p.length > 254) {
      return { ok: false, code: "invalid_cc" };
    }
    if (seen.has(p)) continue;
    seen.add(p);
    cc.push(p);
    if (cc.length > VESIM_REFUND_REVIEW_MAX_CC) {
      return { ok: false, code: "invalid_cc" };
    }
  }

  return { ok: true, to, cc };
}

/** Server/env loader — keep out of client bundles. */
export function loadVesimRefundReviewRecipientsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): VesimRefundReviewRecipients {
  return parseVesimRefundReviewRecipients({
    toRaw: env[VESIM_REFUND_REVIEW_EMAIL_ENV],
    ccRaw: env[VESIM_REFUND_REVIEW_CC_ENV],
  });
}
