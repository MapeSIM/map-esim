/**
 * Display-only payment return copy helpers (offline-QA safe).
 * Never marks paid / funds / creates orders.
 */
import {
  SIMPAISA_WALLET_OPERATORS,
  isSimpaisaWalletOperatorId,
} from "@/app/lib/payments/simpaisaPolicy";

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

export const PAYMENT_RETURN_VERIFYING_HEADLINE = "Verifying your payment...";
export const PAYMENT_RETURN_PREPARING_HEADLINE = "Preparing your eSIM...";
export const PAYMENT_RETURN_CHECK_STATUS_LABEL = "Check status";
