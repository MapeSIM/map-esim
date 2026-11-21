/**
 * Pure admin payment-method display helpers (offline-QA safe).
 * Corrects historical Order.paymentMethod defaults (`SAFEPAY`) for manual /
 * WhatsApp / Partner Wallet fulfillment without inventing gateway transactions.
 */

export const ADMIN_ORDER_PAYMENT_METHOD_MANUAL = "MANUAL" as const;
export const ADMIN_ORDER_PAYMENT_METHOD_SAFEPAY = "SAFEPAY" as const;
export const ADMIN_ORDER_PAYMENT_METHOD_WHATSAPP = "WHATSAPP" as const;
export const ADMIN_ORDER_PAYMENT_METHOD_PARTNER_WALLET =
  "PARTNER_WALLET" as const;

export type AdminOrderPaymentMethodRail =
  | typeof ADMIN_ORDER_PAYMENT_METHOD_MANUAL
  | typeof ADMIN_ORDER_PAYMENT_METHOD_SAFEPAY
  | typeof ADMIN_ORDER_PAYMENT_METHOD_WHATSAPP
  | typeof ADMIN_ORDER_PAYMENT_METHOD_PARTNER_WALLET
  | string;

function normalizeRail(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 32);
}

/**
 * Resolve the payment-method label for /admin/orders/[id].
 * Prefer durable MANUAL / WHATSAPP / PARTNER_WALLET evidence over the schema
 * default SAFEPAY. Keep SAFEPAY only for real gateway rails.
 */
export function resolveAdminOrderPaymentMethodDisplay(input: {
  paymentMethod?: string | null;
  fundingSource?: string | null;
  providerOrderId?: string | null;
  senderName?: string | null;
  paymentProofUrl?: string | null;
  /** WhatsAppCheckoutOrder.paymentMethod when linked. */
  whatsappPaymentMethod?: string | null;
  /** WhatsAppCheckoutOrder.senderName when linked (manual submission). */
  whatsappSenderName?: string | null;
  /** WhatsAppCheckoutOrder.paymentProofUrl when linked (manual submission). */
  whatsappPaymentProofUrl?: string | null;
  /** True when a WhatsAppCheckoutOrder row points at this order. */
  hasWhatsappCheckoutLink?: boolean;
  /** True when an AdminPackageAssignment fulfilled this order. */
  hasAdminPackageAssignment?: boolean;
  /** True when a Safepay/Simpaisa gateway payment attempt exists for this order. */
  hasGatewayPaymentAttempt?: boolean;
}): string | null {
  const stored = normalizeRail(input.paymentMethod);
  const wa = normalizeRail(input.whatsappPaymentMethod);
  const funding = normalizeRail(input.fundingSource);
  const providerOrderId = String(input.providerOrderId ?? "").trim();
  const hasProof = Boolean(
    String(input.paymentProofUrl ?? "").trim() ||
      String(input.whatsappPaymentProofUrl ?? "").trim()
  );
  const hasSender = Boolean(
    String(input.senderName ?? "").trim() ||
      String(input.whatsappSenderName ?? "").trim()
  );
  const hasWaLink = Boolean(input.hasWhatsappCheckoutLink);
  const hasAssignment = Boolean(input.hasAdminPackageAssignment);
  const hasGateway = Boolean(input.hasGatewayPaymentAttempt);
  const looksLikeDefaultSafepay =
    !stored || stored === ADMIN_ORDER_PAYMENT_METHOD_SAFEPAY;

  if (stored === ADMIN_ORDER_PAYMENT_METHOD_MANUAL) {
    return ADMIN_ORDER_PAYMENT_METHOD_MANUAL;
  }
  if (stored === ADMIN_ORDER_PAYMENT_METHOD_WHATSAPP) {
    return ADMIN_ORDER_PAYMENT_METHOD_WHATSAPP;
  }
  if (stored === ADMIN_ORDER_PAYMENT_METHOD_PARTNER_WALLET) {
    return ADMIN_ORDER_PAYMENT_METHOD_PARTNER_WALLET;
  }

  if (wa === ADMIN_ORDER_PAYMENT_METHOD_MANUAL) {
    return ADMIN_ORDER_PAYMENT_METHOD_MANUAL;
  }
  if (wa === ADMIN_ORDER_PAYMENT_METHOD_WHATSAPP) {
    return ADMIN_ORDER_PAYMENT_METHOD_WHATSAPP;
  }

  if (providerOrderId.toLowerCase().startsWith("manual-")) {
    return ADMIN_ORDER_PAYMENT_METHOD_MANUAL;
  }

  // Partner Account / Wallet funded orders — never surface schema-default SAFEPAY.
  if (funding === "PARTNER_BALANCE") {
    return ADMIN_ORDER_PAYMENT_METHOD_PARTNER_WALLET;
  }

  // Manual submission evidence on the order or linked WhatsApp checkout row.
  if ((hasProof || hasSender) && !hasGateway && looksLikeDefaultSafepay) {
    return ADMIN_ORDER_PAYMENT_METHOD_MANUAL;
  }

  // Admin package / WhatsApp fulfill without a Safepay/Simpaisa gateway txn.
  if (
    !hasGateway &&
    looksLikeDefaultSafepay &&
    (hasAssignment || hasWaLink) &&
    (funding === "COMPANY_FUNDED" ||
      funding === "DIRECT_PAYMENT" ||
      hasWaLink ||
      hasAssignment)
  ) {
    return ADMIN_ORDER_PAYMENT_METHOD_MANUAL;
  }

  if (!stored) return null;
  if (stored === ADMIN_ORDER_PAYMENT_METHOD_SAFEPAY) {
    return ADMIN_ORDER_PAYMENT_METHOD_SAFEPAY;
  }
  return stored.slice(0, 32);
}

/**
 * Whether a DB backfill should set Order.paymentMethod = MANUAL.
 * Conservative: only when manual evidence is present and no gateway attempt.
 */
export function shouldBackfillOrderPaymentMethodToManual(input: {
  paymentMethod?: string | null;
  fundingSource?: string | null;
  providerOrderId?: string | null;
  senderName?: string | null;
  paymentProofUrl?: string | null;
  whatsappPaymentMethod?: string | null;
  whatsappSenderName?: string | null;
  whatsappPaymentProofUrl?: string | null;
  hasWhatsappCheckoutLink?: boolean;
  hasAdminPackageAssignment?: boolean;
  hasGatewayPaymentAttempt?: boolean;
}): boolean {
  const stored = normalizeRail(input.paymentMethod);
  if (stored === ADMIN_ORDER_PAYMENT_METHOD_MANUAL) return false;
  if (Boolean(input.hasGatewayPaymentAttempt)) return false;

  const resolved = resolveAdminOrderPaymentMethodDisplay(input);
  return resolved === ADMIN_ORDER_PAYMENT_METHOD_MANUAL;
}
