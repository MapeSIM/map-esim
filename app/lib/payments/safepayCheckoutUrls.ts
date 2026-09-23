import "server-only";

import { safeCallbackPath } from "@/app/lib/auth/redirects";
import {
  isEsimPurchasePaymentCancelPath,
  isEsimPurchasePaymentReturnPath,
} from "@/app/lib/payments/safepayCheckoutPaths";
import {
  isPartnerEsimPurchasePaymentCancelPath,
  isPartnerEsimPurchasePaymentReturnPath,
} from "@/app/lib/partner/partnerEsimPurchaseCheckoutPaths";

export {
  ESIM_PURCHASE_PAYMENT_CANCEL_PATH,
  ESIM_PURCHASE_PAYMENT_RETURN_PATH,
  esimPurchasePaymentCancelPath,
  esimPurchasePaymentReturnPath,
  parsePaymentAttemptId,
} from "@/app/lib/payments/safepayCheckoutPaths";

/**
 * Allow only known relative account/partner payment paths as return/cancel inputs.
 * Rejects open redirects / external URLs.
 */
export function assertSafePaymentReturnPath(path: string): string {
  const safe = safeCallbackPath(path, "");
  if (
    !safe ||
    !(
      isEsimPurchasePaymentReturnPath(safe) ||
      isEsimPurchasePaymentCancelPath(safe) ||
      isPartnerEsimPurchasePaymentReturnPath(safe) ||
      isPartnerEsimPurchasePaymentCancelPath(safe) ||
      safe.startsWith("/account/wallet/top-up/") ||
      safe.startsWith("/partner/wallet/top-up/")
    )
  ) {
    throw new Error("INVALID_RETURN_PATH");
  }
  return safe;
}
