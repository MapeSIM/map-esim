/**
 * Admin Payment Detail workbench helpers (offline-QA safe).
 * Presentation / guidance only — never funds, marks paid, refunds, or replays webhooks.
 */

import { adminHumanStatusLabel } from "@/app/lib/admin/adminUxCopy";

export type PaymentDetailWorkbenchOwnerKind = "customer" | "partner";

export type PaymentDetailTimelineEvent = {
  id: string;
  atMs: number;
  atLabel: string;
  title: string;
  detail: string | null;
};

export type PaymentDetailNextSafeActionInput = {
  ownerKind: PaymentDetailWorkbenchOwnerKind;
  attemptStatus: string;
  purchaseStatus: string;
  webhookPresent: boolean;
  investigationAvailable: boolean;
  isRecoveryCandidate: boolean;
  staleReleaseEligible: boolean;
  showStuckCaseLink: boolean;
  /** Existing recovery suggested action when candidate (reuse; do not invent funding). */
  recoverySuggestedSafeAction: string | null;
};

export const PAYMENT_DETAIL_WORKBENCH_TITLE = "Payment workbench";

export const PAYMENT_DETAIL_WORKBENCH_DESCRIPTION =
  "Investigate this gateway payment attempt. Tools never fund or mark paid. Funding remains webhook-authoritative.";

/**
 * Operator-facing next step from existing statuses only.
 * Does not authorize funding, refunds, or webhook replay.
 */
export function suggestPaymentDetailNextSafeAction(
  input: PaymentDetailNextSafeActionInput
): string {
  if (input.isRecoveryCandidate && input.recoverySuggestedSafeAction) {
    return input.recoverySuggestedSafeAction;
  }

  const attempt = String(input.attemptStatus ?? "").trim().toUpperCase();
  const purchase = String(input.purchaseStatus ?? "").trim().toUpperCase();

  if (
    attempt === "PAYMENT_CONFIRMED" ||
    purchase === "FUNDED" ||
    purchase === "COMPLETED"
  ) {
    if (input.webhookPresent) {
      return "No payment action needed — confirmed with webhook. Use order/customer links if fulfilment needs review.";
    }
    return "Payment looks confirmed locally — wait for or confirm webhook evidence; do not mark paid.";
  }

  if (attempt === "FAILED" || attempt === "CANCELLED" || attempt === "CANCELED") {
    return "Review failure details. Customer/partner may retry checkout. Do not mark paid or fund from admin.";
  }

  if (input.staleReleaseEligible) {
    return "Release unpaid wallet hold if eligible after provider check — never mark paid.";
  }

  if (input.investigationAvailable) {
    return "Run provider Check Status / Verify. Successful evidence still requires an authoritative webhook before funding.";
  }

  if (input.showStuckCaseLink) {
    return "Open Stuck Cases for evidence-gated recovery. Do not mark paid from this page.";
  }

  if (
    attempt === "AWAITING_PAYMENT" ||
    attempt === "PAYMENT_PENDING" ||
    purchase === "AWAITING_GATEWAY_PAYMENT"
  ) {
    return input.ownerKind === "partner"
      ? "Wait for webhook or use Stale Unpaid Holds when the hold is stale. Do not mark paid."
      : "Wait for webhook, or use Verify Pending when ready. Do not mark paid.";
  }

  if (purchase === "RECONCILIATION_REQUIRED" || attempt === "RECONCILIATION_REQUIRED") {
    return "Open Stuck Cases for controlled recovery. Do not mark paid.";
  }

  return "Monitor webhook and related records. This page never funds or marks paid.";
}

export function paymentDetailStatusSummary(input: {
  attemptStatus: string;
  purchaseStatus: string;
  webhookLabel: string;
}): string {
  const attempt = adminHumanStatusLabel(input.attemptStatus);
  const purchase = adminHumanStatusLabel(input.purchaseStatus);
  const webhook = adminHumanStatusLabel(input.webhookLabel);
  return `Attempt: ${attempt} · Purchase: ${purchase} · Webhook: ${webhook}`;
}

/**
 * Build a newest-first timeline from already-loaded display fields.
 */
export function buildPaymentDetailTimeline(
  events: Array<{
    id: string;
    at: Date | null | undefined;
    atLabel: string | null | undefined;
    title: string;
    detail?: string | null;
  }>
): PaymentDetailTimelineEvent[] {
  const rows: PaymentDetailTimelineEvent[] = [];
  for (const event of events) {
    const at = event.at;
    if (!(at instanceof Date) || !Number.isFinite(at.getTime())) continue;
    const atLabel = String(event.atLabel ?? "").trim();
    if (!atLabel) continue;
    rows.push({
      id: event.id,
      atMs: at.getTime(),
      atLabel,
      title: event.title,
      detail: event.detail?.trim() ? event.detail.trim() : null,
    });
  }
  rows.sort((a, b) => {
    if (b.atMs !== a.atMs) return b.atMs - a.atMs;
    return a.id.localeCompare(b.id);
  });
  return rows;
}
