/**
 * Pure WhatsApp support helpers (offline-QA safe).
 * No Prisma, no network, no secrets.
 */

export const WHATSAPP_SUPPORT_CONFIG_ID = "default" as const;

export const WHATSAPP_PHONE_DIGITS_MIN = 8;
export const WHATSAPP_PHONE_DIGITS_MAX = 15;
export const WHATSAPP_MESSAGE_MAX = 500;

export const WHATSAPP_SUPPORT_PUBLIC_ERROR =
  "Unable to update WhatsApp support settings right now.";

export type WhatsAppPhoneParseResult =
  | { ok: true; digits: string }
  | { ok: false; error: string };

export type WhatsAppMessageParseResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Normalize admin phone input to digits-only wa.me form.
 * Accepts +92300… / spaces / dashes; rejects letters, URLs, HTML.
 */
export function parseWhatsAppPhoneDigits(
  raw: FormDataEntryValue | string | null | undefined
): WhatsAppPhoneParseResult {
  const input = String(raw ?? "").trim();
  if (!input) {
    return { ok: false, error: "Enter a WhatsApp phone number." };
  }
  if (/[a-zA-Z]|https?:\/\/|www\.|<|>|"|'|`|\{|\}|\[|\]|\\|script/i.test(input)) {
    return {
      ok: false,
      error: "Phone number may only contain digits and optional + / spaces / dashes.",
    };
  }
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (
    digits.length < WHATSAPP_PHONE_DIGITS_MIN ||
    digits.length > WHATSAPP_PHONE_DIGITS_MAX
  ) {
    return {
      ok: false,
      error: `Phone must be ${WHATSAPP_PHONE_DIGITS_MIN}–${WHATSAPP_PHONE_DIGITS_MAX} digits (international format).`,
    };
  }
  if (!/^[1-9]\d+$/.test(digits)) {
    return {
      ok: false,
      error: "Phone must be a valid international number (cannot start with 0).",
    };
  }
  return { ok: true, digits };
}

/** Plain-text default message — strip controls, cap length, no HTML. */
export function parseWhatsAppDefaultMessage(
  raw: FormDataEntryValue | string | null | undefined
): WhatsAppMessageParseResult {
  let message = String(raw ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
  // Collapse exotic separators; keep normal spaces/newlines as single spaces for chat.
  message = message.replace(/[ \t\f\v]+/g, " ").replace(/\n{3,}/g, "\n\n");
  if (message.length > WHATSAPP_MESSAGE_MAX) {
    return {
      ok: false,
      error: `Message must be at most ${WHATSAPP_MESSAGE_MAX} characters.`,
    };
  }
  return { ok: true, message };
}

export function buildWhatsAppClickToChatUrl(
  digits: string,
  message: string
): string | null {
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  const base = `https://wa.me/${digits}`;
  const text = message.trim();
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** Public route allowlist — customer browsing/support only. */
const WHATSAPP_BLOCKED_PREFIXES = [
  "/admin",
  "/api",
  "/account",
  "/payment",
  "/success",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-reset-code",
  "/oauth-consent",
  "/dashboard",
  "/share",
] as const;

const WHATSAPP_ALLOWED_EXACT = new Set([
  "/",
  "/countries",
  "/plans",
  "/esim",
  "/support",
  "/install/iphone",
  "/install/android",
  "/privacy-policy",
  "/terms-and-conditions",
  "/cookie-policy",
  "/refund-policy",
  "/how-it-works",
  "/contact",
  "/affiliates-and-partnerships",
  "/device-compatibility",
]);

function normalizeWhatsAppPath(pathname: string): string {
  return (pathname || "/").split("?")[0].split("#")[0] || "/";
}

function matchesWhatsAppBlocked(pathname: string): boolean {
  return WHATSAPP_BLOCKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Wallet checkout review has a fixed mobile sticky payment bar (~10–14rem).
 * FAB must clear that bar (+ safe-area) when both could share the viewport.
 */
export function isWhatsAppStickyPaymentClearanceRoute(pathname: string): boolean {
  const path = normalizeWhatsAppPath(pathname);
  return (
    path === "/account/esim/buy" || path.startsWith("/account/esim/buy/")
  );
}

/** Guest checkout (/checkout) — FAB allowed; no sticky pay bar on this path. */
export function isWhatsAppGuestCheckoutRoute(pathname: string): boolean {
  const path = normalizeWhatsAppPath(pathname);
  return path === "/checkout" || path.startsWith("/checkout/");
}

/** True when the floating WhatsApp button may render on this pathname. */
export function isWhatsAppSupportRoute(pathname: string): boolean {
  const path = normalizeWhatsAppPath(pathname);
  // Wallet checkout: support FAB allowed; bottom clearance clears sticky pay bar.
  if (isWhatsAppStickyPaymentClearanceRoute(path)) return true;
  // Guest checkout: support FAB allowed (default bottom; no sticky CTA).
  if (isWhatsAppGuestCheckoutRoute(path)) return true;
  if (matchesWhatsAppBlocked(path)) return false;
  if (WHATSAPP_ALLOWED_EXACT.has(path)) return true;
  if (path.startsWith("/countries/")) return true;
  return false;
}

/**
 * Bottom offset for the FAB. On sticky-checkout paths, clear the tallest sticky
 * pay bar + gap while still honoring safe-area so the FAB is never covered.
 */
export function whatsAppFabBottomClass(pathname: string): string {
  if (isWhatsAppStickyPaymentClearanceRoute(pathname)) {
    // 14rem sticky + 1.25rem gap above the bar; safe-area already in sticky spacer.
    return "bottom-[calc(14rem+1.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-[max(1.25rem,env(safe-area-inset-bottom,0px))]";
  }
  return "bottom-[max(1.25rem,env(safe-area-inset-bottom,0px))]";
}

export type PublicWhatsAppSupportConfig =
  | { enabled: false }
  | { enabled: true; phone: string; message: string; href: string };

/** Sanitized admin UI view — no secrets beyond public phone/message. */
export type AdminWhatsAppSupportView = {
  enabled: boolean;
  /** Independent of floating support button `enabled`. */
  checkoutFallbackEnabled: boolean;
  phoneDisplay: string;
  message: string;
  version: number;
  updatedAtLabel: string | null;
  updatedByAdminIdSafe: string | null;
};

/**
 * Digits-only phone for checkout fallback, or null when the checkout toggle
 * is off / phone invalid. Independent of the floating support button.
 */
export function resolveWhatsAppCheckoutPhoneDigits(input: {
  checkoutFallbackEnabled: boolean;
  phoneE164: string | null | undefined;
}): string | null {
  if (!input.checkoutFallbackEnabled) return null;
  const phone = (input.phoneE164 ?? "").trim();
  if (!/^[1-9]\d{7,14}$/.test(phone)) return null;
  return phone;
}

export function toPublicWhatsAppSupportConfig(input: {
  enabled: boolean;
  phoneE164: string | null | undefined;
  defaultMessage: string | null | undefined;
}): PublicWhatsAppSupportConfig {
  if (!input.enabled) return { enabled: false };
  const phone = (input.phoneE164 ?? "").trim();
  if (!/^[1-9]\d{7,14}$/.test(phone)) return { enabled: false };
  const message = (input.defaultMessage ?? "").trim().slice(0, WHATSAPP_MESSAGE_MAX);
  const href = buildWhatsAppClickToChatUrl(phone, message);
  if (!href) return { enabled: false };
  return { enabled: true, phone, message, href };
}

/** Prefill for payment-return "not completed" recovery CTA. */
export const PAYMENT_RETURN_WHATSAPP_RECOVERY_MESSAGE =
  "Hello, my eSIM payment could not be completed on mapesim.com. Please assist me.";

export const PAYMENT_RETURN_WHATSAPP_HELP_HINT =
  "Need help completing your order? Contact us directly.";

export const PAYMENT_RETURN_WHATSAPP_CTA_LABEL = "Help via WhatsApp";

/**
 * Build a wa.me recovery link when public WhatsApp support is enabled.
 * Uses a fixed payment-failure prefill (not the admin default broadcast message).
 */
export function buildPaymentReturnWhatsAppRecoveryHref(
  config: PublicWhatsAppSupportConfig
): string | null {
  if (!config.enabled) return null;
  return buildWhatsAppClickToChatUrl(
    config.phone,
    PAYMENT_RETURN_WHATSAPP_RECOVERY_MESSAGE
  );
}

/** Order fields for checkout "Buy via WhatsApp" prefilled message. */
export type WhatsAppCheckoutOrderDetails = {
  destination: string;
  planName: string;
  dataAllowance: string;
  validity: string;
  totalPriceLabel: string;
};

/** Prefill for customer checkout WhatsApp fallback (plain text, capped). */
export function buildWhatsAppCheckoutOrderMessage(
  details: WhatsAppCheckoutOrderDetails
): string {
  const line = (label: string, value: string) =>
    `${label}: ${(value || "").trim() || "Not available"}`;
  const message = [
    "Hi! I'd like to buy an eSIM on mapesim.com.",
    "",
    line("Country/Destination", details.destination),
    line("Plan Name", details.planName),
    line("Data", details.dataAllowance),
    line("Validity", details.validity),
    line("Total Price", details.totalPriceLabel),
  ].join("\n");
  return message.slice(0, WHATSAPP_MESSAGE_MAX);
}

/**
 * Checkout wa.me link. Uses the configured support number (digits-only).
 * Returns null when the phone is invalid.
 */
export function buildWhatsAppCheckoutHref(
  phoneDigits: string,
  details: WhatsAppCheckoutOrderDetails
): string | null {
  return buildWhatsAppClickToChatUrl(
    (phoneDigits ?? "").trim(),
    buildWhatsAppCheckoutOrderMessage(details)
  );
}
