import { createHash } from "node:crypto";

/** Email setup-link lifetime. 29m59s is valid; 30m00s is expired (`expiresAt > now`). */
export const ADMIN_INVITE_SETUP_TTL_MS = 30 * 60 * 1000;

export const ADMIN_INVITE_INVALID_MESSAGE =
  "This password setup link is invalid or has expired.";

export const ADMIN_PASSWORD_SETUP_COMPLETED_AUDIT =
  "admin.password_setup_completed";

export function hashAdminInviteSetupToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function adminInviteSetupExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + ADMIN_INVITE_SETUP_TTL_MS);
}

export function isAdminInviteSetupLive(options: {
  expiresAt: Date;
  consumedAt: Date | null;
  now: Date;
}): boolean {
  if (options.consumedAt) return false;
  return options.expiresAt.getTime() > options.now.getTime();
}
