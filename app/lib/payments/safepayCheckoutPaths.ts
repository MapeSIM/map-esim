/**
 * Fixed internal return/cancel paths for eSIM purchase Hosted Checkout (PG3-B).
 * Pure constants — safe for offline QA imports.
 */
export const ESIM_PURCHASE_PAYMENT_RETURN_PATH =
  "/account/esim/buy/payment/return";
export const ESIM_PURCHASE_PAYMENT_CANCEL_PATH =
  "/account/esim/buy/payment/cancel";

export function esimPurchasePaymentReturnPath(attemptId: string): string {
  const id = attemptId.trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return ESIM_PURCHASE_PAYMENT_RETURN_PATH;
  }
  const params = new URLSearchParams({ attempt: id });
  return `${ESIM_PURCHASE_PAYMENT_RETURN_PATH}?${params.toString()}`;
}

export function esimPurchasePaymentCancelPath(attemptId: string): string {
  const id = attemptId.trim();
  if (!id || id.length > 64 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return ESIM_PURCHASE_PAYMENT_CANCEL_PATH;
  }
  const params = new URLSearchParams({ attempt: id });
  return `${ESIM_PURCHASE_PAYMENT_CANCEL_PATH}?${params.toString()}`;
}
