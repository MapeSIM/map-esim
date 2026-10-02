/**
 * Read-only Partner Detail active wallet-hold classification (offline-QA safe).
 * Reuses the project's open wallet-reservation rules — no new hold model.
 */
import {
  isOpenWalletReservation,
  walletReservationAgeLabel,
  WALLET_RESERVATION_MONITOR_STATUSES,
} from "@/app/lib/admin/walletReservationMonitorShared";

/** Bounded inventory on Partner Detail (server-side). */
export const PARTNER_DETAIL_ACTIVE_HOLDS_TAKE = 20;

/**
 * Authoritative PartnerEsimPurchase statuses that can still hold reserved wallet
 * funds (same open-hold set as Operations wallet reservation monitor).
 */
export const PARTNER_DETAIL_ACTIVE_HOLD_STATUS_STRINGS =
  WALLET_RESERVATION_MONITOR_STATUSES;

export type PartnerDetailActiveHoldStatusString =
  (typeof PARTNER_DETAIL_ACTIVE_HOLD_STATUS_STRINGS)[number];

/**
 * True when a Partner purchase currently represents an open wallet hold.
 * Exact conditions (authoritative stored fields only):
 * - walletAppliedCents > 0
 * - refundTransactionId is null/empty
 * - status ∈ FUNDS_RESERVED | AWAITING_GATEWAY_PAYMENT | RECONCILIATION_REQUIRED
 */
export function isPartnerActiveWalletHold(input: {
  status: string | null | undefined;
  walletAppliedCents: unknown;
  refundTransactionId?: string | null;
}): boolean {
  return isOpenWalletReservation(input);
}

export function partnerActiveHoldAgeLabel(
  updatedAt: Date,
  nowMs: number = Date.now()
): string {
  return walletReservationAgeLabel(updatedAt, nowMs);
}
