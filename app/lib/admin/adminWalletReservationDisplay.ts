/**
 * Admin-only wallet reservation display helpers (offline-QA safe).
 * Presentation only — no payment, wallet, or status-machine side effects.
 */

import { adminHumanStatusLabel } from "@/app/lib/admin/adminUxCopy";
import { formatUsdCents } from "@/app/lib/wallet/display";

/**
 * Format a reserved wallet amount for admin UI.
 * Primary: USD. Optional secondary: raw cents for ledger cross-checks.
 */
export function formatAdminReservedWalletAmount(
  cents: unknown,
  options?: { showCentsSecondary?: boolean }
): string {
  if (
    typeof cents !== "number" ||
    !Number.isInteger(cents) ||
    !Number.isSafeInteger(cents) ||
    cents <= 0
  ) {
    return "none (gateway-only)";
  }

  const usd = formatUsdCents(cents);
  if (options?.showCentsSecondary === false) {
    return usd;
  }
  return `${usd} (${cents} cents)`;
}

/**
 * Compact reserved-wallet fragment for list rows (e.g. "wallet reserved $15.00").
 * Returns empty string when nothing is reserved.
 */
export function formatAdminReservedWalletListFragment(
  cents: unknown,
  options?: { showCentsSecondary?: boolean }
): string {
  if (
    typeof cents !== "number" ||
    !Number.isInteger(cents) ||
    !Number.isSafeInteger(cents) ||
    cents <= 0
  ) {
    return "";
  }
  const amount = formatAdminReservedWalletAmount(cents, options);
  return `wallet reserved ${amount}`;
}

/**
 * Replace technical enum display with readable admin labels.
 * Delegates to shared admin UX humanizer (enums unchanged internally).
 */
export function adminWalletReservationStatusLabel(
  status: string | null | undefined
): string {
  return adminHumanStatusLabel(status);
}

/** When a pending/payment row should deep-link into reconciliation. */
export function isAdminWalletReconciliationLinkApplicable(input: {
  purchaseStatus?: string | null;
  attemptStatus?: string | null;
}): boolean {
  const purchase = String(input.purchaseStatus ?? "").trim();
  const attempt = String(input.attemptStatus ?? "").trim();
  return (
    purchase === "RECONCILIATION_REQUIRED" ||
    purchase === "FUNDS_RESERVED" ||
    attempt === "RECONCILIATION_REQUIRED"
  );
}

export function buildAdminWalletPurchaseReconciliationHref(
  purchaseId: string
): string {
  return `/admin/reconciliation/wallet_purchase/${encodeURIComponent(
    purchaseId.trim()
  )}`;
}

/** Copy for Release Reservation (pending / Simpaisa tools). */
export const ADMIN_RELEASE_RESERVATION_BLURB =
  "Releases the wallet hold on this purchase so the customer can retry checkout. It never funds, marks paid, or refunds a completed debit — only clears an eligible reservation after provider confirmation.";

/** Copy for Refund Wallet Funds (reconciliation case tool). */
export const ADMIN_REFUND_WALLET_FUNDS_BLURB =
  "Use only for confirmed refund cases after evidence review. Restores the original reserved wallet amount exactly once. This is not the same as releasing a pending gateway hold.";
