/**
 * Pure claim/retry helpers for abandoned-checkout recovery customer email.
 * Offline-QA safe — no Prisma, network, or secrets.
 *
 * Convention mirrors wallet / recon / payment-failure / payment-received emails:
 * - first claim from null
 * - failed / not_configured remain retryable
 * - sent / skipped / sending are not re-claimable (sending = in flight)
 */

export const ABANDONED_CHECKOUT_EMAIL_SENDING = "sending";
export const ABANDONED_CHECKOUT_EMAIL_SENT = "sent";
export const ABANDONED_CHECKOUT_EMAIL_FAILED = "failed";
export const ABANDONED_CHECKOUT_EMAIL_NOT_CONFIGURED = "not_configured";
export const ABANDONED_CHECKOUT_EMAIL_SKIPPED = "skipped";

export type AbandonedCheckoutEmailStatus =
  | typeof ABANDONED_CHECKOUT_EMAIL_SENDING
  | typeof ABANDONED_CHECKOUT_EMAIL_SENT
  | typeof ABANDONED_CHECKOUT_EMAIL_FAILED
  | typeof ABANDONED_CHECKOUT_EMAIL_NOT_CONFIGURED
  | typeof ABANDONED_CHECKOUT_EMAIL_SKIPPED;

/** Statuses that may CAS into "sending". */
export function isAbandonedCheckoutEmailClaimable(
  status: string | null | undefined
): boolean {
  if (status == null || status === "") return true;
  return (
    status === ABANDONED_CHECKOUT_EMAIL_FAILED ||
    status === ABANDONED_CHECKOUT_EMAIL_NOT_CONFIGURED
  );
}

export type AbandonedCheckoutEmailEvent =
  | "claim"
  | "sent"
  | "failed"
  | "not_configured"
  | "skipped";

/**
 * Recovery email only for unfinished self-serve checkout.
 * Paid / preparing / completed / recon states use other emails.
 */
export function shouldSendAbandonedCheckoutEmail(input: {
  purchaseStatus: string;
  adminUserId?: string | null;
}): boolean {
  if ((input.adminUserId ?? "").trim()) return false;
  const purchaseStatus = (input.purchaseStatus ?? "").trim();
  return (
    purchaseStatus === "READY" ||
    purchaseStatus === "AWAITING_GATEWAY_PAYMENT"
  );
}

export function applyAbandonedCheckoutEmailTransition(
  current: string | null | undefined,
  event: AbandonedCheckoutEmailEvent
): { ok: true; next: string } | { ok: false; reason: string } {
  if (event === "claim") {
    if (!isAbandonedCheckoutEmailClaimable(current)) {
      if (current === ABANDONED_CHECKOUT_EMAIL_SENDING) {
        return { ok: false, reason: "in_progress" };
      }
      if (current === ABANDONED_CHECKOUT_EMAIL_SENT) {
        return { ok: false, reason: "already_sent" };
      }
      return { ok: false, reason: "not_claimable" };
    }
    return { ok: true, next: ABANDONED_CHECKOUT_EMAIL_SENDING };
  }

  if (current !== ABANDONED_CHECKOUT_EMAIL_SENDING) {
    return { ok: false, reason: "not_in_sending" };
  }

  switch (event) {
    case "sent":
      return { ok: true, next: ABANDONED_CHECKOUT_EMAIL_SENT };
    case "failed":
      return { ok: true, next: ABANDONED_CHECKOUT_EMAIL_FAILED };
    case "not_configured":
      return { ok: true, next: ABANDONED_CHECKOUT_EMAIL_NOT_CONFIGURED };
    case "skipped":
      return { ok: true, next: ABANDONED_CHECKOUT_EMAIL_SKIPPED };
    default:
      return { ok: false, reason: "unknown_event" };
  }
}
