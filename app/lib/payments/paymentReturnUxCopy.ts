/**
 * Display-only payment return copy helpers (offline-QA safe).
 * Never marks paid / funds / creates orders.
 */
import {
  SIMPAISA_WALLET_OPERATORS,
  isSimpaisaWalletOperatorId,
} from "@/app/lib/payments/simpaisaPolicy";

/** JazzCash authorize window (operator 100008). */
export const PAYMENT_AUTHORIZE_WINDOW_JAZZCASH_SECONDS = 360;
/**
 * Easypaisa authorize window (official Simpaisa operator 100007).
 * Note: some briefs cite 100001 — MAP uses the contract id 100007.
 */
export const PAYMENT_AUTHORIZE_WINDOW_EASYPAISA_SECONDS = 60;
/** Fallback when operator is unknown / not selected. */
export const PAYMENT_AUTHORIZE_WINDOW_DEFAULT_SECONDS = 180;

export function simpaisaWalletOperatorDisplayLabel(
  operatorId: string | null | undefined
): string | null {
  const id = String(operatorId ?? "").trim();
  if (!id || !isSimpaisaWalletOperatorId(id)) return null;
  if (id === SIMPAISA_WALLET_OPERATORS.EASYPAISA) return "Easypaisa";
  if (id === SIMPAISA_WALLET_OPERATORS.JAZZCASH) return "JazzCash";
  return null;
}

/**
 * Prefer the selected operator; otherwise the sole admin-enabled operator.
 */
export function resolvePaymentReturnWalletOperatorLabel(input: {
  selectedOperatorId?: string | null;
  enabledOperatorIds?: readonly string[] | null;
}): string | null {
  const selected = simpaisaWalletOperatorDisplayLabel(input.selectedOperatorId);
  if (selected) return selected;
  const enabled = (input.enabledOperatorIds ?? [])
    .map((id) => simpaisaWalletOperatorDisplayLabel(id))
    .filter((label): label is string => Boolean(label));
  if (enabled.length === 1) return enabled[0]!;
  return null;
}

export function paymentReturnPendingGuidance(
  walletOperatorLabel: string | null | undefined
): string {
  const label = String(walletOperatorLabel ?? "").trim();
  const app = label || "mobile wallet";
  return `Please authorize the MPIN / prompt in your ${app} app. We'll automatically activate your eSIM as soon as it's confirmed.`;
}

/**
 * Live authorize-window length for the pending verification countdown.
 * Resolves from operator id when known; otherwise from display label.
 */
export function paymentAuthorizeWindowSeconds(input: {
  walletOperatorId?: string | null;
  walletOperatorLabel?: string | null;
}): number {
  const id = String(input.walletOperatorId ?? "").trim();
  if (id === SIMPAISA_WALLET_OPERATORS.JAZZCASH) {
    return PAYMENT_AUTHORIZE_WINDOW_JAZZCASH_SECONDS;
  }
  if (id === SIMPAISA_WALLET_OPERATORS.EASYPAISA) {
    return PAYMENT_AUTHORIZE_WINDOW_EASYPAISA_SECONDS;
  }
  const label = String(input.walletOperatorLabel ?? "")
    .trim()
    .toLowerCase();
  if (label === "jazzcash") return PAYMENT_AUTHORIZE_WINDOW_JAZZCASH_SECONDS;
  if (label === "easypaisa") return PAYMENT_AUTHORIZE_WINDOW_EASYPAISA_SECONDS;
  return PAYMENT_AUTHORIZE_WINDOW_DEFAULT_SECONDS;
}

/** Format remaining authorize seconds as MM:SS (clamped at 0). */
export function formatPaymentAuthorizeCountdown(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export const PAYMENT_RETURN_VERIFYING_HEADLINE = "Verifying your payment...";
export const PAYMENT_RETURN_PREPARING_HEADLINE = "Preparing your eSIM...";
export const PAYMENT_RETURN_CHECK_STATUS_LABEL = "Check status";
export const PAYMENT_RETURN_EXPIRED_HEADLINE = "Payment window expired";
export const PAYMENT_RETURN_EXPIRED_GUIDANCE =
  "Payment window expired. Try again";
export const PAYMENT_RETURN_TRY_AGAIN_LABEL = "Try again";
export const PAYMENT_RETURN_TIME_REMAINING_PREFIX =
  "Time remaining to authorize:";
