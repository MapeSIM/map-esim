/**
 * Safe return/cancel path validation for Simpaisa Cards rail.
 * Reuses the same allowlist as Safepay / wallet adapters.
 * Pure — no provider HTTP.
 */
import { safeCallbackPath } from "@/app/lib/auth/redirects";
import {
  isEsimPurchasePaymentCancelPath,
  isEsimPurchasePaymentReturnPath,
} from "@/app/lib/payments/safepayCheckoutPaths";

export {
  ESIM_PURCHASE_PAYMENT_CANCEL_PATH,
  ESIM_PURCHASE_PAYMENT_RETURN_PATH,
  esimPurchasePaymentCancelPath,
  esimPurchasePaymentReturnPath,
  parsePaymentAttemptId,
} from "@/app/lib/payments/safepayCheckoutPaths";

/**
 * Allow only known relative account payment paths as return/cancel inputs.
 * Rejects open redirects / external URLs.
 * Same policy as assertSafePaymentReturnPath (Safepay/wallet).
 */
export function assertSafeSimpaisaCardsReturnPath(path: string): string {
  const safe = safeCallbackPath(path, "");
  if (
    !safe ||
    !(
      isEsimPurchasePaymentReturnPath(safe) ||
      isEsimPurchasePaymentCancelPath(safe) ||
      safe.startsWith("/account/wallet/top-up/")
    )
  ) {
    throw new Error("INVALID_RETURN_PATH");
  }
  return safe;
}
