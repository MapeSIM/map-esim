/**
 * Pure automatic MAP install-email state machine.
 * No I/O. Used by the post-fulfillment helper and offline QA.
 */

export type AutomaticInstallEmailDecision =
  | "claim"
  | "skip_sent"
  | "skip_failed_for_admin"
  | "uncertain_sending"
  | "skip_other";

/** Statuses the automatic path may CAS-claim to "sending". */
export function isAutomaticInstallEmailClaimableStatus(
  status: string | null | undefined
): boolean {
  return classifyAutomaticInstallEmailStatus(status) === "claim";
}

export function classifyAutomaticInstallEmailStatus(
  status: string | null | undefined
): AutomaticInstallEmailDecision {
  const v = (status ?? "").trim().toLowerCase();
  if (v === "" || v === "skipped_no_install_details") return "claim";
  if (v === "sent" || v === "already_sent") return "skip_sent";
  if (v === "failed" || v === "not_configured" || v === "invalid_email") {
    return "skip_failed_for_admin";
  }
  if (v === "sending") return "uncertain_sending";
  return "skip_other";
}
