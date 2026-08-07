/**
 * Fixed internal return/cancel paths for eSIM purchase Hosted Checkout (PG3-B).
 * Pure constants — safe for offline QA imports.
 */
export const ESIM_PURCHASE_PAYMENT_RETURN_PATH =
  "/account/esim/buy/payment/return";
export const ESIM_PURCHASE_PAYMENT_CANCEL_PATH =
  "/account/esim/buy/payment/cancel";

/**
 * Normalize payment-attempt ids from path or query.
 * Safepay Hosted Checkout appends `?tracker=...` to redirect_url; if our URL
 * already used `?attempt=`, the attempt value becomes `id?tracker=...`.
 */
export function parsePaymentAttemptId(
  raw: string | undefined | null
): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const id = trimmed.split("?")[0].split("&")[0].trim();
  if (!id || id.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

/**
 * Redirect URL for Safepay must not include a query string — Safepay appends
 * `?tracker=` with a leading `?` rather than `&`.
 */
export function esimPurchasePaymentReturnPath(attemptId: string): string {
  const id = parsePaymentAttemptId(attemptId);
  if (!id) return ESIM_PURCHASE_PAYMENT_RETURN_PATH;
  return `${ESIM_PURCHASE_PAYMENT_RETURN_PATH}/${id}`;
}

export function esimPurchasePaymentCancelPath(attemptId: string): string {
  const id = parsePaymentAttemptId(attemptId);
  if (!id) return ESIM_PURCHASE_PAYMENT_CANCEL_PATH;
  return `${ESIM_PURCHASE_PAYMENT_CANCEL_PATH}/${id}`;
}

function isAttemptPathUnder(base: string, path: string): boolean {
  if (path === base) return true;
  if (path.startsWith(`${base}?`)) return true;
  if (!path.startsWith(`${base}/`)) return false;
  const rest = path.slice(`${base}/`.length).split("?")[0];
  if (!rest || rest.includes("/")) return false;
  return parsePaymentAttemptId(rest) !== null;
}

export function isEsimPurchasePaymentReturnPath(path: string): boolean {
  return isAttemptPathUnder(ESIM_PURCHASE_PAYMENT_RETURN_PATH, path);
}

export function isEsimPurchasePaymentCancelPath(path: string): boolean {
  return isAttemptPathUnder(ESIM_PURCHASE_PAYMENT_CANCEL_PATH, path);
}
