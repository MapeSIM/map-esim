/**
 * Pure claim/retry helpers for reconciliation-required customer email.
 * Offline-QA safe — no Prisma, network, or secrets.
 *
 * Convention mirrors wallet transaction email:
 * - first claim from null
 * - failed / not_configured remain retryable
 * - sent / skipped / sending are not re-claimable (sending = in flight)
 */

export const RECON_REQUIRED_EMAIL_SENDING = "sending";
export const RECON_REQUIRED_EMAIL_SENT = "sent";
export const RECON_REQUIRED_EMAIL_FAILED = "failed";
export const RECON_REQUIRED_EMAIL_NOT_CONFIGURED = "not_configured";
export const RECON_REQUIRED_EMAIL_SKIPPED = "skipped";

export type ReconRequiredEmailStatus =
  | typeof RECON_REQUIRED_EMAIL_SENDING
  | typeof RECON_REQUIRED_EMAIL_SENT
  | typeof RECON_REQUIRED_EMAIL_FAILED
  | typeof RECON_REQUIRED_EMAIL_NOT_CONFIGURED
  | typeof RECON_REQUIRED_EMAIL_SKIPPED;

/** Statuses that may CAS into "sending" (wallet-style retry set + first claim). */
export function isReconRequiredEmailClaimable(
  status: string | null | undefined
): boolean {
  if (status == null || status === "") return true;
  return (
    status === RECON_REQUIRED_EMAIL_FAILED ||
    status === RECON_REQUIRED_EMAIL_NOT_CONFIGURED
  );
}

export type ReconRequiredEmailEvent =
  | "claim"
  | "sent"
  | "failed"
  | "not_configured"
  | "skipped";

/**
 * Pure state transition for claim/send outcomes.
 * Used by offline QA to prove fail→retry→sent without duplicate sends.
 */
export function applyReconRequiredEmailTransition(
  current: string | null | undefined,
  event: ReconRequiredEmailEvent
): { ok: true; next: string } | { ok: false; reason: string } {
  if (event === "claim") {
    if (!isReconRequiredEmailClaimable(current)) {
      if (current === RECON_REQUIRED_EMAIL_SENDING) {
        return { ok: false, reason: "in_progress" };
      }
      if (current === RECON_REQUIRED_EMAIL_SENT) {
        return { ok: false, reason: "already_sent" };
      }
      return { ok: false, reason: "not_claimable" };
    }
    return { ok: true, next: RECON_REQUIRED_EMAIL_SENDING };
  }

  if (current !== RECON_REQUIRED_EMAIL_SENDING) {
    return { ok: false, reason: "not_in_sending" };
  }

  switch (event) {
    case "sent":
      return { ok: true, next: RECON_REQUIRED_EMAIL_SENT };
    case "failed":
      return { ok: true, next: RECON_REQUIRED_EMAIL_FAILED };
    case "not_configured":
      return { ok: true, next: RECON_REQUIRED_EMAIL_NOT_CONFIGURED };
    case "skipped":
      return { ok: true, next: RECON_REQUIRED_EMAIL_SKIPPED };
    default:
      return { ok: false, reason: "unknown_event" };
  }
}
