/**
 * TEMPORARY Preview/dev diagnostic for Credentials `authorize` null returns.
 * Remove after Preview auth root-cause is confirmed.
 *
 * Never logs passwords, password hashes, CSRF tokens, cookies, or DATABASE_URL.
 * Production (`VERCEL_ENV=production`) is a no-op.
 */

import { createHash } from "node:crypto";

export type PreviewCredentialsNullReason =
  | "zod_fail"
  | "rate_limit"
  | "no_user_or_hash"
  | "deleted"
  | "email_unverified"
  | "admin_disabled"
  | "partner_missing_or_disabled"
  | "bcrypt_failure"
  | "role_coerce_fail";

/** Preview/dev-only — never enable on Production. */
export function isPreviewCredentialsAuthorizeDiagEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL_ENV === "preview"
  );
}

/** SHA-256 hex prefix — correlate attempts without logging the address. */
function emailFingerprint(email: string): string {
  return createHash("sha256").update(email).digest("hex").slice(0, 12);
}

/**
 * Log why Credentials authorize returned null (Preview/dev only).
 */
export function logPreviewCredentialsAuthorizeNull(input: {
  reason: PreviewCredentialsNullReason;
  email?: string;
  role?: string | null;
  retryAfterSec?: number;
}): void {
  if (!isPreviewCredentialsAuthorizeDiagEnabled()) return;

  const payload: Record<string, string | number | null> = {
    reason: input.reason,
    emailFp: input.email ? emailFingerprint(input.email) : null,
    role: input.role ?? null,
  };
  if (
    input.reason === "rate_limit" &&
    typeof input.retryAfterSec === "number"
  ) {
    payload.retryAfterSec = input.retryAfterSec;
  }

  console.info("preview_credentials_authorize_null", payload);
}
