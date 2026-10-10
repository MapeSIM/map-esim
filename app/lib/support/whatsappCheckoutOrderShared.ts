/**
 * Pure WhatsApp checkout order helpers (offline-QA safe).
 */
import {
  WHATSAPP_MESSAGE_MAX,
  buildWhatsAppClickToChatUrl,
  parseWhatsAppPhoneDigits,
} from "@/app/lib/support/whatsappSupportShared";

export const WHATSAPP_CHECKOUT_PAYMENT_METHOD = "WHATSAPP" as const;

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
