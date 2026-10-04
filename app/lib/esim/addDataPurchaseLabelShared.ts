/**
 * Pure Add More Data purchase label helpers (offline-QA / capture-core safe).
 * Do not import server-only modules here.
 */

/** Idempotency prefix — encodes MAP local source order without a schema change. */
export const ADD_DATA_IDEMPOTENCY_PREFIX = "adddata_";

const LOCAL_ORDER_ID_RE = /^[A-Za-z0-9_-]+$/;

export function isAddDataIdempotencyKey(
  idempotencyKey: string | null | undefined
): boolean {
  return parseAddDataSourceOrderId(idempotencyKey) != null;
}

/** Extract MAP local source order id from an Add Data idempotency key. */
export function parseAddDataSourceOrderId(
  idempotencyKey: string | null | undefined
): string | null {
  const key = (idempotencyKey ?? "").trim();
  if (!key.startsWith(ADD_DATA_IDEMPOTENCY_PREFIX)) return null;
  const rest = key.slice(ADD_DATA_IDEMPOTENCY_PREFIX.length);
  const sep = rest.indexOf("_");
  if (sep <= 0 || sep >= rest.length - 1) return null;
  const nonce = rest.slice(0, sep);
  const orderId = rest.slice(sep + 1).trim();
  if (!/^[a-f0-9]{16}$/i.test(nonce)) return null;
  if (!orderId || orderId.length > 64 || !LOCAL_ORDER_ID_RE.test(orderId)) {
    return null;
  }
  return orderId;
}

export type AddDataPurchaseLabel = {
  /** True only when this purchase/order was created via Add More Data top-up. */
  isAddDataPurchase: boolean;
  /** MAP local source order id embedded in adddata_ idempotency key. */
  addDataSourceOrderId: string | null;
};

/**
 * Detect Add More Data purchases from purchase idempotencyKey (adddata_ convention).
 * Not the same as addDataEligible (CTA on a source eSIM that can receive top-up).
 */
export function resolveAddDataPurchaseLabel(
  idempotencyKeyOrKeys:
    | string
    | null
    | undefined
    | Array<string | null | undefined>
): AddDataPurchaseLabel {
  const keys = Array.isArray(idempotencyKeyOrKeys)
    ? idempotencyKeyOrKeys
    : [idempotencyKeyOrKeys];
  for (const key of keys) {
    const addDataSourceOrderId = parseAddDataSourceOrderId(key);
    if (addDataSourceOrderId) {
      return { isAddDataPurchase: true, addDataSourceOrderId };
    }
  }
  return { isAddDataPurchase: false, addDataSourceOrderId: null };
}
