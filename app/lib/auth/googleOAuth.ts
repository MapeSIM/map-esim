import type { GoogleProfile } from "@auth/core/providers/google";
import {
  LEGAL_CONSENT_ERROR,
  LEGAL_CONSENT_SOURCE_GOOGLE,
  LEGAL_POLICY_VERSION,
} from "@/app/lib/legal";
import { normalizeEmail } from "@/app/lib/auth/email";

export { LEGAL_CONSENT_ERROR };

export const GOOGLE_AUTH_METHOD = "google" as const;
export const CREDENTIALS_AUTH_METHOD = "credentials" as const;

export type AuthMethod =
  | typeof GOOGLE_AUTH_METHOD
  | typeof CREDENTIALS_AUTH_METHOD;

/** Safe public OAuth error codes shown on /signin. */
export type PublicOAuthErrorCode =
  | "OAuthAccountNotLinked"
  | "AccessDenied"
  | "OAuthCallback"
  | "Configuration"
  | "Default";

export function mapOAuthErrorParam(
  raw: string | null | undefined
): PublicOAuthErrorCode | null {
  if (!raw) return null;
  const value = raw.trim();
  if (
    value === "OAuthAccountNotLinked" ||
    value === "AccountNotLinked"
  ) {
    return "OAuthAccountNotLinked";
  }
  if (value === "AccessDenied") return "AccessDenied";
  if (
    value === "OAuthCallback" ||
    value === "OAuthCallbackError" ||
    value === "Callback"
  ) {
    return "OAuthCallback";
  }
  if (value === "Configuration") return "Configuration";
  if (
    value === "OAuthSignin" ||
    value === "OAuthCreateAccount" ||
    value === "EmailCreateAccount" ||
    value === "Callback" ||
    value === "Default"
  ) {
    return "Default";
  }
  return "Default";
}

export function publicOAuthErrorMessage(
  code: PublicOAuthErrorCode | null
): string | null {
  if (!code) return null;
  switch (code) {
    case "OAuthAccountNotLinked":
      return "This email is already registered. Sign in with your existing method.";
    case "AccessDenied":
      return "Google sign-in was denied. Try again or use email and password.";
    case "Configuration":
      return process.env.NODE_ENV === "development"
        ? "Google sign-in is not configured. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET in .env.local."
        : "Google sign-in is temporarily unavailable. Please use email and password.";
    case "OAuthCallback":
    case "Default":
    default:
      return "Google sign-in failed. Please try again or use email and password.";
  }
}

/**
 * Validates the raw Google OIDC profile. Prefer `email_verified === true`
 * from the default Google provider profile (do not strip that field).
 */
export function isGoogleProfileVerified(
  profile: GoogleProfile | undefined | null
): boolean {
  if (!profile) return false;
  if (!profile.email || typeof profile.email !== "string") return false;
  return profile.email_verified === true;
}

export function googleProfileToUserFields(profile: GoogleProfile) {
  const email = normalizeEmail(profile.email);
  const name =
    (profile.name || profile.given_name || "").trim() || "MAP eSIM Customer";
  return {
    email,
    name,
    image:
      typeof profile.picture === "string" && profile.picture
        ? profile.picture
        : null,
    emailVerified: new Date(),
  };
}

/** Prisma consent fields for Google OAuth acknowledgement. */
export function googleOauthConsentRecord(now = new Date()) {
  return {
    termsAcceptedAt: now,
    termsVersion: LEGAL_POLICY_VERSION,
    privacyAcknowledgedAt: now,
    privacyVersion: LEGAL_POLICY_VERSION,
    legalConsentSource: LEGAL_CONSENT_SOURCE_GOOGLE,
  };
}

export function isOauthConsentAccepted(value: unknown): boolean {
  return value === true || value === "on" || value === "true" || value === "1";
}
