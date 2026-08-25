/**
 * Pure claim/retry helpers for payment-received / eSIM-pending customer email.
 * Offline-QA safe — no Prisma, network, or secrets.
 *
 * Convention mirrors wallet / recon / payment-failure emails:
 * - first claim from null
 * - failed / not_configured remain retryable
 * - sent / skipped / sending are not re-claimable (sending = in flight)
 */

export const PAYMENT_RECEIVED_EMAIL_SENDING = "sending";
export const PAYMENT_RECEIVED_EMAIL_SENT = "sent";
export const PAYMENT_RECEIVED_EMAIL_FAILED = "failed";
export const PAYMENT_RECEIVED_EMAIL_NOT_CONFIGURED = "not_configured";
export const PAYMENT_RECEIVED_EMAIL_SKIPPED = "skipped";

export type PaymentReceivedEmailStatus =
  | typeof PAYMENT_RECEIVED_EMAIL_SENDING
  | typeof PAYMENT_RECEIVED_EMAIL_SENT
  | typeof PAYMENT_RECEIVED_EMAIL_FAILED
  | typeof PAYMENT_RECEIVED_EMAIL_NOT_CONFIGURED
  | typeof PAYMENT_RECEIVED_EMAIL_SKIPPED;

/** Statuses that may CAS into "sending". */
export function isPaymentReceivedEmailClaimable(
  status: string | null | undefined
): boolean {
  if (status == null || status === "") return true;
  return (
    status === PAYMENT_RECEIVED_EMAIL_FAILED ||
    status === PAYMENT_RECEIVED_EMAIL_NOT_CONFIGURED
  );
}

export type PaymentReceivedEmailEvent =
  | "claim"
  | "sent"
  | "failed"
  | "not_configured"
  | "skipped";

/**
 * Send only when payment is captured and the install/QR email has not gone out.
 * RECONCILIATION_REQUIRED is handled by the existing under-review email.
 */
export function shouldSendPaymentReceivedPendingEmail(input: {
  purchaseStatus: string;
  emailDeliveryStatus: string | null | undefined;
}): boolean {
  const purchaseStatus = (input.purchaseStatus ?? "").trim();
  if (
    purchaseStatus === "FUNDED" ||
    purchaseStatus === "PROVIDER_PENDING"
  ) {
    return true;
  }
  if (purchaseStatus !== "COMPLETED") return false;
  const delivery = (input.emailDeliveryStatus ?? "").trim().toLowerCase();
  return (
    delivery !== "sent" &&
    delivery !== "already_sent" &&
    delivery !== "sending"
  );
}

export function applyPaymentReceivedEmailTransition(
  current: string | null | undefined,
  event: PaymentReceivedEmailEvent
): { ok: true; next: string } | { ok: false; reason: string } {
  if (event === "claim") {
    if (!isPaymentReceivedEmailClaimable(current)) {
      if (current === PAYMENT_RECEIVED_EMAIL_SENDING) {
        return { ok: false, reason: "in_progress" };
      }
      if (current === PAYMENT_RECEIVED_EMAIL_SENT) {
        return { ok: false, reason: "already_sent" };
      }
      return { ok: false, reason: "not_claimable" };
    }
    return { ok: true, next: PAYMENT_RECEIVED_EMAIL_SENDING };
  }

  if (current !== PAYMENT_RECEIVED_EMAIL_SENDING) {
    return { ok: false, reason: "not_in_sending" };
  }

  switch (event) {
    case "sent":
      return { ok: true, next: PAYMENT_RECEIVED_EMAIL_SENT };
    case "failed":
      return { ok: true, next: PAYMENT_RECEIVED_EMAIL_FAILED };
    case "not_configured":
      return { ok: true, next: PAYMENT_RECEIVED_EMAIL_NOT_CONFIGURED };
    case "skipped":
      return { ok: true, next: PAYMENT_RECEIVED_EMAIL_SKIPPED };
    default:
      return { ok: false, reason: "unknown_event" };
  }
}
