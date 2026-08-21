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
  "/checkout",
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

function matchesWhatsAppBlocked(pathname: string): boolean {
  return WHATSAPP_BLOCKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** True when the floating WhatsApp button may render on this pathname. */
export function isWhatsAppSupportRoute(pathname: string): boolean {
  const path = (pathname || "/").split("?")[0].split("#")[0] || "/";
  if (matchesWhatsAppBlocked(path)) return false;
  if (WHATSAPP_ALLOWED_EXACT.has(path)) return true;
  if (path.startsWith("/countries/")) return true;
  return false;
}

export type PublicWhatsAppSupportConfig =
  | { enabled: false }
  | { enabled: true; phone: string; message: string; href: string };

/** Sanitized admin UI view — no secrets beyond public phone/message. */
export type AdminWhatsAppSupportView = {
  enabled: boolean;
  phoneDisplay: string;
  message: string;
  version: number;
  updatedAtLabel: string | null;
  updatedByAdminIdSafe: string | null;
};

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
