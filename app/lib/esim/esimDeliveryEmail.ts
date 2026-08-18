/**
 * No-OTP alternate MAP eSIM install-email helpers.
 * Confirmation is customer attestation only — not ownership proof.
 * Side-effect free except the exported error class.
 */

import { normalizeEmail } from "@/app/lib/auth/email";
import { isValidEmail } from "@/app/lib/email/isValidEmail";
import {
  classifyPurchaseDeliveryRecipient,
  isPurchaseDeliveryEmailLocked,
} from "@/app/lib/esim/esimDeliveryEmailState";

export const ALTERNATE_DELIVERY_EMAIL_MAX_LENGTH = 254;

export const ALTERNATE_DELIVERY_EMAIL_COPY = {
  option: "Send eSIM details to a different email",
  deliveryEmail: "Delivery email",
  confirmDeliveryEmail: "Confirm delivery email",
  attestation: "I confirm this email is correct and accessible.",
  unverified:
    "This email will not be verified. Please check it carefully.",
  savedPrefix: "eSIM details will be sent to",
  change: "Change",
  useAccount: "Use account email",
} as const;

export const ALTERNATE_DELIVERY_EMAIL_MESSAGES = {
  invalid: "Enter a valid delivery email.",
  mismatch: "Delivery emails do not match.",
  attestation: "Confirm that this email is correct and accessible.",
  locked: "eSIM delivery email can no longer be changed.",
  unavailable: "This purchase is unavailable.",
  notEditable: "This purchase is not ready for delivery email changes.",
} as const;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

export class EsimDeliveryEmailError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "INVALID_STATE"
    | "INVALID_EMAIL"
    | "EMAIL_MISMATCH"
    | "ATTESTATION_REQUIRED"
    | "LOCKED";

  constructor(code: EsimDeliveryEmailError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "EsimDeliveryEmailError";
  }
}

export function alternateDeliveryEmailLockClaim(now = new Date()): {
  alternateDeliveryEmailLockedAt: Date;
} {
  return { alternateDeliveryEmailLockedAt: now };
}

export function isPurchaseDeliveryEmailEditableStatus(
  status: string | null | undefined
): boolean {
  return status === "READY" || status === "AWAITING_GATEWAY_PAYMENT";
}

export function canEditPurchaseDeliveryEmail(input: {
  status: string | null | undefined;
  alternateDeliveryEmailLockedAt?: Date | string | null;
  adminUserId?: string | null;
}): boolean {
  if ((input.adminUserId ?? "").trim()) return false;
  if (isPurchaseDeliveryEmailLocked(input.alternateDeliveryEmailLockedAt)) {
    return false;
  }
  return isPurchaseDeliveryEmailEditableStatus(input.status);
}

export function snapshotOrderAlternateDeliveryEmail(input: {
  alternateDeliveryEmail?: string | null;
  alternateDeliveryEmailConfirmedAt?: Date | string | null;
}): string | null {
  if (classifyPurchaseDeliveryRecipient(input) !== "confirmed_alternate") {
    return null;
  }
  const email = (input.alternateDeliveryEmail ?? "").trim();
  return email || null;
}

/** Frozen install-email recipient. Never uses live User.email. */
export function resolveFrozenInstallDeliveryEmail(order: {
  alternateDeliveryEmail?: string | null;
  customerEmail?: string | null;
}): string {
  const alternate = (order.alternateDeliveryEmail ?? "").trim();
  if (alternate) return alternate;
  return (order.customerEmail ?? "").trim();
}

export type ParsedAlternateDeliveryEmail =
  | { ok: true; email: string }
  | { ok: false; code: "INVALID_EMAIL" };

export function parseAlternateDeliveryEmailInput(
  raw: unknown
): ParsedAlternateDeliveryEmail {
  if (typeof raw !== "string") {
    return { ok: false, code: "INVALID_EMAIL" };
  }
  if (CONTROL_CHARS.test(raw)) {
    return { ok: false, code: "INVALID_EMAIL" };
  }
  if (raw.length > ALTERNATE_DELIVERY_EMAIL_MAX_LENGTH) {
    return { ok: false, code: "INVALID_EMAIL" };
  }
  const email = normalizeEmail(raw);
  if (
    !email ||
    email.length > ALTERNATE_DELIVERY_EMAIL_MAX_LENGTH ||
    CONTROL_CHARS.test(email) ||
    !isValidEmail(email)
  ) {
    return { ok: false, code: "INVALID_EMAIL" };
  }
  return { ok: true, email };
}

export function assertMatchingAlternateDeliveryEmails(
  emailRaw: unknown,
  confirmRaw: unknown
): string {
  const parsed = parseAlternateDeliveryEmailInput(emailRaw);
  const confirmed = parseAlternateDeliveryEmailInput(confirmRaw);
  if (!parsed.ok || !confirmed.ok) {
    throw new EsimDeliveryEmailError(
      "INVALID_EMAIL",
      ALTERNATE_DELIVERY_EMAIL_MESSAGES.invalid
    );
  }
  if (parsed.email !== confirmed.email) {
    throw new EsimDeliveryEmailError(
      "EMAIL_MISMATCH",
      ALTERNATE_DELIVERY_EMAIL_MESSAGES.mismatch
    );
  }
  return parsed.email;
}

export function isSameAsAccountEmail(
  deliveryEmail: string,
  accountEmail: string | null | undefined
): boolean {
  const account = parseAlternateDeliveryEmailInput(accountEmail ?? "");
  if (!account.ok) return false;
  return deliveryEmail === account.email;
}
