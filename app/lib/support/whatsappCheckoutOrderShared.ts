/**
 * Pure WhatsApp checkout order helpers (offline-QA safe).
 */
import {
  WHATSAPP_MESSAGE_MAX,
  buildWhatsAppClickToChatUrl,
} from "@/app/lib/support/whatsappSupportShared";

export const WHATSAPP_CHECKOUT_PAYMENT_METHOD = "WHATSAPP" as const;

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
