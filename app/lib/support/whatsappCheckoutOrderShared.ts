/**
 * Pure WhatsApp checkout order helpers (offline-QA safe).
 */
import {
  WHATSAPP_MESSAGE_MAX,
  buildWhatsAppClickToChatUrl,
  parseWhatsAppPhoneDigits,
  type WhatsAppPhoneParseResult,
} from "@/app/lib/support/whatsappSupportShared";

export const WHATSAPP_CHECKOUT_PAYMENT_METHOD = "WHATSAPP" as const;

/** Common dial codes for WhatsApp checkout capture (digits only, no +). */
export const WHATSAPP_CHECKOUT_DIAL_CODES = [
  { code: "92", label: "Pakistan (+92)", short: "PK +92" },
  { code: "1", label: "United States / Canada (+1)", short: "US/CA +1" },
  { code: "44", label: "United Kingdom (+44)", short: "UK +44" },
  { code: "971", label: "United Arab Emirates (+971)", short: "UAE +971" },
  { code: "966", label: "Saudi Arabia (+966)", short: "SA +966" },
  { code: "974", label: "Qatar (+974)", short: "QA +974" },
  { code: "965", label: "Kuwait (+965)", short: "KW +965" },
  { code: "973", label: "Bahrain (+973)", short: "BH +973" },
  { code: "968", label: "Oman (+968)", short: "OM +968" },
  { code: "91", label: "India (+91)", short: "IN +91" },
  { code: "61", label: "Australia (+61)", short: "AU +61" },
  { code: "49", label: "Germany (+49)", short: "DE +49" },
  { code: "33", label: "France (+33)", short: "FR +33" },
  { code: "39", label: "Italy (+39)", short: "IT +39" },
  { code: "34", label: "Spain (+34)", short: "ES +34" },
  { code: "90", label: "Turkey (+90)", short: "TR +90" },
  { code: "60", label: "Malaysia (+60)", short: "MY +60" },
  { code: "65", label: "Singapore (+65)", short: "SG +65" },
] as const;

export const WHATSAPP_CHECKOUT_DEFAULT_DIAL_CODE = "92";

/**
 * Combine dial code + local number into E.164-style digits (no + / spaces).
 * Strips leading 0 from the local national number.
 */
export function composeWhatsAppCheckoutPhoneDigits(input: {
  dialCode: string | null | undefined;
  localNumber: string | null | undefined;
}): WhatsAppPhoneParseResult {
  const dial = String(input.dialCode ?? "").replace(/\D/g, "");
  let local = String(input.localNumber ?? "").replace(/\D/g, "");
  local = local.replace(/^0+/, "");
  if (!dial) {
    return { ok: false, error: "Select a country code." };
  }
  if (!local) {
    return { ok: false, error: "Enter your WhatsApp number." };
  }
  const digits = local.startsWith(dial) ? local : `${dial}${local}`;
  return parseWhatsAppPhoneDigits(digits);
}

/** Digits-only customer phone for admin → customer wa.me links. */
export function cleanWhatsAppCustomerPhoneDigits(
  raw: string | null | undefined
): string | null {
  const parsed = parseWhatsAppPhoneDigits(raw);
  return parsed.ok ? parsed.digits : null;
}

export function buildAdminWhatsAppOrderChatMessage(input: {
  status: string;
  orderReference: string;
  packageName: string;
}): string {
  const reference = (input.orderReference || "").trim() || "—";
  const packageName = (input.packageName || "").trim() || "eSIM package";
  const status = (input.status || "").trim().toUpperCase();
  if (status === "FULFILLED") {
    return [
      `Salam! Your MAP eSIM order #${reference} has been verified and activated.`,
      "Please check your email or visit mapesim.com to install your eSIM.",
    ].join(" ");
  }
  // Default / WHATSAPP_PENDING
  return [
    `Salam! Regarding your MAP eSIM order #${reference} (${packageName}).`,
    "Please share your payment screenshot here so we can activate your eSIM immediately.",
  ].join(" ");
}

/**
 * Admin chat deep-link to the customer WhatsApp number.
 * Returns null when phone is missing/invalid.
 */
export function buildAdminWhatsAppOrderChatHref(input: {
  customerPhone: string | null | undefined;
  status: string;
  orderReference: string;
  packageName: string;
}): string | null {
  const digits = cleanWhatsAppCustomerPhoneDigits(input.customerPhone);
  if (!digits) return null;
  const message = buildAdminWhatsAppOrderChatMessage({
    status: input.status,
    orderReference: input.orderReference,
    packageName: input.packageName,
  }).slice(0, WHATSAPP_MESSAGE_MAX);
  return buildWhatsAppClickToChatUrl(digits, message);
}

export type WhatsAppPendingOrderMessageInput = {
  reference: string;
  destination: string;
  planName: string;
  dataAllowance: string;
  validity: string;
  amountLabel: string;
  currency: string;
  customerEmail: string;
};

/** Short public reference: WA-83921 style (5 digits). */
export function generateWhatsAppOrderReference(nowMs = Date.now()): string {
  const suffix = String(10000 + (nowMs % 90000) + Math.floor(Math.random() * 9));
  return `WA-${suffix.slice(0, 5)}`;
}

export function buildWhatsAppPendingOrderMessage(
  input: WhatsAppPendingOrderMessageInput
): string {
  const line = (label: string, value: string) =>
    `${label}: ${(value || "").trim() || "Not available"}`;
  const message = [
    "Hi! I'd like to complete my eSIM order on mapesim.com.",
    "",
    line("Order Reference", input.reference),
    line("Country/Destination", input.destination),
    line("Plan Name", input.planName),
    line("Data", input.dataAllowance),
    line("Validity", input.validity),
    line("Amount", `${input.amountLabel} ${input.currency}`.trim()),
    line("Customer Email", input.customerEmail),
  ].join("\n");
  return message.slice(0, WHATSAPP_MESSAGE_MAX);
}

export function buildWhatsAppPendingOrderHref(
  phoneDigits: string,
  input: WhatsAppPendingOrderMessageInput
): string | null {
  return buildWhatsAppClickToChatUrl(
    (phoneDigits ?? "").trim(),
    buildWhatsAppPendingOrderMessage(input)
  );
}
