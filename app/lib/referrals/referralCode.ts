import { randomBytes } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** Normalize user-supplied referral codes (query/cookie/form). */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 4 || code.length > 16) return null;
  return code;
}

export function generateReferralCodeCandidate(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!;
  }
  return out;
}

export function buildReferralSignupPath(code: string): string {
  return `/signup?ref=${encodeURIComponent(code)}`;
}

export function buildReferralSignupUrl(origin: string, code: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${buildReferralSignupPath(code)}`;
}
