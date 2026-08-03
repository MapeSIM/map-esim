import { LEGAL_POLICY_VERSION } from "@/app/lib/legal";
import {
  CREDENTIALS_AUTH_METHOD,
  GOOGLE_AUTH_METHOD,
  type AuthMethod,
} from "@/app/lib/auth/googleOAuth";

export type ConsentDbFields = {
  role: "CUSTOMER" | "ADMIN" | string;
  termsAcceptedAt: Date | null;
  privacyAcknowledgedAt: Date | null;
  termsVersion: string | null;
  privacyVersion: string | null;
  passwordHash: string | null;
  hasGoogleAccount: boolean;
};

/**
 * Google CUSTOMER needs consent when timestamps are missing or versions
 * do not match the current legal policy revision.
 * Credentials users are never gated by this helper alone.
 */
export function deriveNeedsLegalConsent(
  authMethod: AuthMethod | undefined,
  user: Pick<
    ConsentDbFields,
    | "role"
    | "termsAcceptedAt"
    | "privacyAcknowledgedAt"
    | "termsVersion"
    | "privacyVersion"
  >
): boolean {
  if (authMethod !== GOOGLE_AUTH_METHOD) return false;
  if (user.role !== "CUSTOMER") return false;

  if (!user.termsAcceptedAt || !user.privacyAcknowledgedAt) return true;
  if (!user.termsVersion || user.termsVersion !== LEGAL_POLICY_VERSION) {
    return true;
  }
  if (!user.privacyVersion || user.privacyVersion !== LEGAL_POLICY_VERSION) {
    return true;
  }
  return false;
}

/**
 * Resolve auth method for JWT/session.
 * Prefer the live provider account on sign-in; otherwise keep the token value;
 * fall back to OAuth-only DB shape (Google linked + no local password).
 */
export function resolveAuthMethod(options: {
  accountProvider?: string | null;
  rememberPresent?: boolean;
  tokenAuthMethod?: AuthMethod | undefined;
  passwordHash?: string | null;
  hasGoogleAccount?: boolean;
}): AuthMethod | undefined {
  if (options.accountProvider === "google") return GOOGLE_AUTH_METHOD;
  if (
    options.accountProvider === "credentials" ||
    options.rememberPresent === true
  ) {
    return CREDENTIALS_AUTH_METHOD;
  }
  if (
    options.tokenAuthMethod === GOOGLE_AUTH_METHOD ||
    options.tokenAuthMethod === CREDENTIALS_AUTH_METHOD
  ) {
    return options.tokenAuthMethod;
  }
  // OAuth-only customers created via Google (no local password).
  if (options.hasGoogleAccount && !options.passwordHash) {
    return GOOGLE_AUTH_METHOD;
  }
  return undefined;
}

/**
 * Middleware/authorized decision helper (pure, edge-safe).
 * When consent is required, only consent + legal + Auth.js routes are allowed.
 */
export function isAllowedDuringLegalConsent(pathname: string): boolean {
  if (pathname === "/oauth-consent") return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (
    pathname === "/privacy-policy" ||
    pathname === "/terms-and-conditions" ||
    pathname === "/cookie-policy" ||
    pathname.startsWith("/privacy-policy/") ||
    pathname.startsWith("/terms-and-conditions/") ||
    pathname.startsWith("/cookie-policy/")
  ) {
    return true;
  }
  return false;
}
