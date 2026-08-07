import "server-only";

import { safeCallbackPath } from "@/app/lib/auth/redirects";
import {
  ESIM_PURCHASE_PAYMENT_CANCEL_PATH,
  ESIM_PURCHASE_PAYMENT_RETURN_PATH,
} from "@/app/lib/payments/safepayCheckoutPaths";

export {
  ESIM_PURCHASE_PAYMENT_CANCEL_PATH,
  ESIM_PURCHASE_PAYMENT_RETURN_PATH,
  esimPurchasePaymentCancelPath,
  esimPurchasePaymentReturnPath,
} from "@/app/lib/payments/safepayCheckoutPaths";

/**
 * Allow only known relative account payment paths as return/cancel inputs.
 * Rejects open redirects / external URLs.
 */
export function assertSafePaymentReturnPath(path: string): string {
  const safe = safeCallbackPath(path, "");
  if (
    !safe ||
    !(
      safe === ESIM_PURCHASE_PAYMENT_RETURN_PATH ||
      safe.startsWith(`${ESIM_PURCHASE_PAYMENT_RETURN_PATH}?`) ||
      safe === ESIM_PURCHASE_PAYMENT_CANCEL_PATH ||
      safe.startsWith(`${ESIM_PURCHASE_PAYMENT_CANCEL_PATH}?`) ||
      safe.startsWith("/account/wallet/top-up/")
    )
  ) {
    throw new Error("INVALID_RETURN_PATH");
  }
  return safe;
}
