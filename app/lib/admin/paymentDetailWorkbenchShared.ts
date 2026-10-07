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
  walletAppliedCents?: number | null;
};

export const PAYMENT_DETAIL_WORKBENCH_TITLE = "Payment workbench";

export const PAYMENT_DETAIL_WORKBENCH_DESCRIPTION =
  "Review this payment attempt. Tools never fund or mark paid. Paid status still requires the payment gateway webhook.";

/** Operator-facing labels (avoid gateway jargon on the primary surface). */
export const PAYMENT_WORKBENCH_LABEL = {
  paymentStatus: "Payment Status",
  gatewayDecision: "Gateway Decision",
  amount: "Amount",
  walletFunds: "Funds deducted",
  noFundsDeducted: "No funds deducted / Unpaid",
  dismissStale: "Dismiss Stale Attempt",
  nextSafeAction: "Next safe action",
  technicalLogs: "Technical & Audit Details",
  closedNoFundsBanner:
    "This attempt was closed without funds being deducted",
} as const;

/** Default audit reason for one-click gateway-only dismiss (server still validates). */
export const ADMIN_GATEWAY_ONLY_DISMISS_REASON =
  "Admin dismissed stale uncompleted attempt";

/** Default audit reason for one-click wallet-hold stale release. */
export const ADMIN_STALE_HOLD_RELEASE_REASON =
  "Admin released stale unpaid wallet hold";

/**
 * Split "Name · masked@email" display labels from payment detail loaders.
 */
export function splitPaymentPartyLabel(label: string): {
  name: string;
  email: string;
} {
  const raw = String(label ?? "").trim();
  if (!raw) return { name: "Not available", email: "—" };
  const sep = raw.indexOf(" · ");
  if (sep <= 0) return { name: raw, email: "—" };
  return {
    name: raw.slice(0, sep).trim() || "Not available",
    email: raw.slice(sep + 3).trim() || "—",
  };
}

/** Terminal / closed attempt — suppress live investigate and dismiss actions. */
export function isPaymentAttemptActionSuppressed(input: {
  attemptStatus: string;
  purchaseStatus: string;
}): boolean {
  const attempt = String(input.attemptStatus ?? "").trim().toUpperCase();
  const purchase = String(input.purchaseStatus ?? "").trim().toUpperCase();
  if (
    attempt === "EXPIRED" ||
    attempt === "CANCELLED" ||
    attempt === "CANCELED" ||
    attempt === "FAILED" ||
    attempt === "PAYMENT_CONFIRMED" ||
    attempt === "REFUNDED"
  ) {
    return true;
  }
  if (
    purchase === "FUNDED" ||
    purchase === "COMPLETED" ||
    purchase === "FAILED_REFUNDED"
  ) {
    return true;
  }
  return false;
}

/**
 * Human payment-status badge for the workbench summary.
 */
export function humanPaymentStatusBadge(input: {
  attemptStatus: string;
  purchaseStatus: string;
  webhookPresent: boolean;
}): { label: string; toneValue: string } {
  const attempt = String(input.attemptStatus ?? "").trim().toUpperCase();
  const purchase = String(input.purchaseStatus ?? "").trim().toUpperCase();

  if (
    attempt === "PAYMENT_CONFIRMED" ||
    purchase === "FUNDED" ||
    purchase === "COMPLETED"
  ) {
    return { label: "Paid", toneValue: "PAID" };
  }
  if (attempt === "FAILED") {
    return { label: "Failed", toneValue: "FAILED" };
  }
  if (attempt === "CANCELLED" || attempt === "CANCELED" || attempt === "EXPIRED") {
    return { label: "Expired / Closed", toneValue: "EXPIRED" };
  }
  if (
    attempt === "AWAITING_PAYMENT" ||
    attempt === "PAYMENT_PENDING" ||
    purchase === "AWAITING_GATEWAY_PAYMENT"
  ) {
    return {
      label: input.webhookPresent ? "Pending (webhook received)" : "Pending",
      toneValue: "PENDING",
    };
  }
  if (purchase === "RECONCILIATION_REQUIRED" || attempt === "RECONCILIATION_REQUIRED") {
    return { label: "Needs review", toneValue: "RECONCILIATION_REQUIRED" };
  }
  return {
    label: adminHumanStatusLabel(input.attemptStatus),
    toneValue: input.attemptStatus || "UNKNOWN",
  };
}

/**
 * Gateway decision = whether an authoritative webhook claimed this attempt.
 */
export function humanGatewayDecisionLabel(webhookPresent: boolean): {
  label: string;
  toneValue: string;
} {
  if (webhookPresent) {
    return { label: "Webhook confirmed", toneValue: "PRESENT" };
  }
  return { label: "Waiting for gateway", toneValue: "MISSING" };
}

/**
 * Wallet hold display — gateway-only attempts should not look like empty hold cards.
 */
export function humanWalletFundsLabel(walletAppliedCents: number | null | undefined): {
  hasHold: boolean;
  label: string;
} {
  const cents =
    typeof walletAppliedCents === "number" && Number.isFinite(walletAppliedCents)
      ? Math.trunc(walletAppliedCents)
      : 0;
  if (cents > 0) {
    return { hasHold: true, label: `Wallet hold · ${cents}¢ reserved` };
  }
  return { hasHold: false, label: PAYMENT_WORKBENCH_LABEL.noFundsDeducted };
}

/**
 * Operator-facing next step from existing statuses only.
 * Does not authorize funding, refunds, or webhook replay.
 */
export function suggestPaymentDetailNextSafeAction(
  input: PaymentDetailNextSafeActionInput
): string {
  if (input.staleReleaseEligible) {
    const hasHold =
      typeof input.walletAppliedCents === "number" &&
      input.walletAppliedCents > 0;
    return hasHold
      ? "This unpaid attempt is stale. Mark it Abandoned / Expired to release the wallet hold — never mark paid."
      : "This unpaid gateway-only attempt is stale. Use Dismiss / Mark Expired to clear it from pending lists — never mark paid.";
  }

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
    return "Payment looks confirmed locally — wait for webhook evidence; do not mark paid.";
  }

  if (attempt === "FAILED" || attempt === "CANCELLED" || attempt === "CANCELED") {
    return "Review failure details. Customer/partner may retry checkout. Do not mark paid from admin.";
  }

  if (input.investigationAvailable) {
    return "Check gateway status. A successful check still needs the real webhook before funding.";
  }

  if (input.showStuckCaseLink) {
    return "Open Stuck Cases for controlled recovery. Do not mark paid from this page.";
  }

  if (
    attempt === "AWAITING_PAYMENT" ||
    attempt === "PAYMENT_PENDING" ||
    purchase === "AWAITING_GATEWAY_PAYMENT"
  ) {
    return input.ownerKind === "partner"
      ? "Wait for the gateway webhook, or open Stale Unpaid Holds when this age is past the threshold."
      : "Wait for the gateway webhook, or use Verify Pending when ready.";
  }

  if (purchase === "RECONCILIATION_REQUIRED" || attempt === "RECONCILIATION_REQUIRED") {
    return "Open Stuck Cases for controlled recovery. Do not mark paid.";
  }

  return "Monitor the webhook and related records. This page never marks paid.";
}

export function paymentDetailStatusSummary(input: {
  attemptStatus: string;
  purchaseStatus: string;
  webhookLabel: string;
}): string {
  const payment = humanPaymentStatusBadge({
    attemptStatus: input.attemptStatus,
    purchaseStatus: input.purchaseStatus,
    webhookPresent: String(input.webhookLabel ?? "")
      .trim()
      .toLowerCase() === "present",
  }).label;
  const gateway = humanGatewayDecisionLabel(
    String(input.webhookLabel ?? "").trim().toLowerCase() === "present"
  ).label;
  return `${PAYMENT_WORKBENCH_LABEL.paymentStatus}: ${payment} · ${PAYMENT_WORKBENCH_LABEL.gatewayDecision}: ${gateway}`;
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
