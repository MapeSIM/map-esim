/**
 * Pure Safepay Card Payments webhook JSON → NormalizedPaymentEvent mapping.
 * Call only after signature verification succeeds.
 */
import type {
  NormalizedPaymentEvent,
  NormalizedPaymentStatus,
} from "@/app/lib/payments/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      if (Array.isArray(value)) return String(value[0] ?? "").trim();
      return String(value ?? "").trim();
    }
  }
  return "";
}

function extractTracker(data: Record<string, unknown>): string | null {
  const direct = asString(data.tracker);
  if (direct) return direct;
  const nested = asRecord(data.tracker);
  return asString(nested?.token);
}

function extractAmountCurrency(data: Record<string, unknown>): {
  amount: number | null;
  currency: string | null;
} {
  const directAmount = asNumber(data.amount);
  const directCurrency = asString(data.currency)?.toUpperCase() ?? null;
  if (directAmount != null && directCurrency) {
    return { amount: directAmount, currency: directCurrency };
  }

  const amountObj = asRecord(data.amount);
  if (amountObj) {
    const nestedAmount = asNumber(amountObj.amount);
    const nestedCurrency = asString(amountObj.currency)?.toUpperCase() ?? null;
    if (nestedAmount != null && nestedCurrency) {
      return { amount: nestedAmount, currency: nestedCurrency };
    }
  }

  const totals = asRecord(data.purchase_totals);
  const quote = asRecord(totals?.quote_amount);
  if (quote) {
    const quoteAmount = asNumber(quote.amount);
    const quoteCurrency = asString(quote.currency)?.toUpperCase() ?? null;
    if (quoteAmount != null && quoteCurrency) {
      return { amount: quoteAmount, currency: quoteCurrency };
    }
  }

  const charge = asRecord(data.charge);
  const chargeAmount = asRecord(charge?.amount);
  if (chargeAmount) {
    const amt = asNumber(chargeAmount.amount);
    const cur = asString(chargeAmount.currency)?.toUpperCase() ?? null;
    if (amt != null && cur) return { amount: amt, currency: cur };
  }

  return { amount: null, currency: null };
}

function mapEventType(type: string): NormalizedPaymentStatus | null {
  const t = type.trim().toLowerCase();
  if (t === "payment.succeeded") return "confirmed";
  if (
    t === "payment.failed" ||
    t === "payment.cancelled" ||
    t === "payment.canceled" ||
    t === "payment.voided" ||
    t === "payment.rejected"
  ) {
    return "failed";
  }
  return null;
}

/**
 * Parse a verified Safepay Card Payments webhook payload.
 * Returns null for unsupported/irrelevant event types or malformed bodies.
 */
export function parseSafepayCardWebhookEvent(input: {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
}): NormalizedPaymentEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(input.rawBody);
  } catch {
    return null;
  }
  const root = asRecord(json);
  if (!root) return null;

  const type =
    asString(root.type) ||
    headerValue(input.headers, "x-sfpy-event-type") ||
    "";
  const paymentStatus = mapEventType(type);
  if (!paymentStatus) return null;

  const data = asRecord(root.data) ?? root;
  const tracker = extractTracker(data);
  if (!tracker || tracker.length > 190) return null;

  const { amount, currency } = extractAmountCurrency(data);
  if (amount == null || !currency || !Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  const eventId =
    asString(root.token) ||
    asString(root.id) ||
    asString(root.event_id) ||
    headerValue(input.headers, "x-sfpy-event-id");
  if (!eventId || eventId.length > 190) return null;

  const metadata = asRecord(data.metadata);
  const orderId = asString(metadata?.order_id);

  const successFlag = data.success;
  if (paymentStatus === "confirmed" && successFlag === false) {
    return null;
  }

  return {
    signatureVerified: true,
    provider: "SAFEPAY",
    purpose: "ESIM_PURCHASE",
    eventId,
    providerPaymentRef: tracker,
    localTopupId: null,
    paymentAttemptId: orderId,
    purchaseId: null,
    paymentStatus,
    chargeCurrency: currency,
    chargeAmountMinor: amount,
    confirmedAt: paymentStatus === "confirmed" ? new Date() : null,
    failureCategory:
      paymentStatus === "failed" ? type.replace(/\./g, "_") : null,
  };
}
