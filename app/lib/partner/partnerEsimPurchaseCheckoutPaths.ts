/**
 * Fixed internal return/cancel paths for Partner eSIM purchase Hosted Checkout.
 * Pure constants — safe for offline QA. Browser return must never fund or call VeSIM.
 */
import { parsePaymentAttemptId } from "@/app/lib/payments/safepayCheckoutPaths";

export const PARTNER_ESIM_PURCHASE_PAYMENT_RETURN_PATH =
  "/partner/catalog/payment/return";
export const PARTNER_ESIM_PURCHASE_PAYMENT_CANCEL_PATH =
  "/partner/catalog/payment/cancel";

export function partnerEsimPurchasePaymentReturnPath(attemptId: string): string {
  const id = parsePaymentAttemptId(attemptId);
  if (!id) return PARTNER_ESIM_PURCHASE_PAYMENT_RETURN_PATH;
  return `${PARTNER_ESIM_PURCHASE_PAYMENT_RETURN_PATH}/${id}`;
}

export function partnerEsimPurchasePaymentCancelPath(attemptId: string): string {
  const id = parsePaymentAttemptId(attemptId);
  if (!id) return PARTNER_ESIM_PURCHASE_PAYMENT_CANCEL_PATH;
  return `${PARTNER_ESIM_PURCHASE_PAYMENT_CANCEL_PATH}/${id}`;
}

function isAttemptPathUnder(base: string, path: string): boolean {
  if (path === base) return true;
  if (path.startsWith(`${base}?`)) return true;
  if (!path.startsWith(`${base}/`)) return false;
  const rest = path.slice(`${base}/`.length).split("?")[0];
  if (!rest || rest.includes("/")) return false;
  return parsePaymentAttemptId(rest) !== null;
}

export function isPartnerEsimPurchasePaymentReturnPath(path: string): boolean {
  return isAttemptPathUnder(PARTNER_ESIM_PURCHASE_PAYMENT_RETURN_PATH, path);
}

export function isPartnerEsimPurchasePaymentCancelPath(path: string): boolean {
  return isAttemptPathUnder(PARTNER_ESIM_PURCHASE_PAYMENT_CANCEL_PATH, path);
}
