import bcrypt from "bcryptjs";
import { z } from "zod";

const BCRYPT_COST = 12;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_REQUIREMENT_LABELS = {
  minLength: "At least 10 characters",
  upper: "One uppercase letter",
  lower: "One lowercase letter",
  number: "One number",
  special: "One special character",
  maxLength: "At most 128 characters",
  noEdgeSpaces: "No leading or trailing spaces",
  notEmail: "Must not match your email",
} as const;

export type PasswordRequirementKey = keyof typeof PASSWORD_REQUIREMENT_LABELS;

export type PasswordRequirementState = Record<PasswordRequirementKey, boolean>;

/** Checklist shown under new-password fields (live UX). */
export const PASSWORD_CHECKLIST_KEYS: PasswordRequirementKey[] = [
  "minLength",
  "upper",
  "lower",
  "number",
  "special",
];

function normalizeCompareEmail(email?: string | null): string {
  return (email || "").trim().toLowerCase();
}

/**
 * Shared password policy evaluation for client checklist and server validation.
 */
export function evaluatePasswordRequirements(
  password: string,
  email?: string | null
): PasswordRequirementState {
  const emailNorm = normalizeCompareEmail(email);
  return {
    minLength: password.length >= PASSWORD_MIN_LENGTH,
    maxLength: password.length <= PASSWORD_MAX_LENGTH,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    noEdgeSpaces: password.length === 0 || password === password.trim(),
    notEmail:
      !emailNorm || password.length === 0
        ? true
        : password.toLowerCase() !== emailNorm,
  };
}

export function isPasswordValid(
  password: string,
  email?: string | null
): boolean {
  if (!password) return false;
  const state = evaluatePasswordRequirements(password, email);
  return (Object.keys(PASSWORD_REQUIREMENT_LABELS) as PasswordRequirementKey[]).every(
    (key) => state[key]
  );
}

export function validatePassword(
  password: string,
  email?: string | null
): { ok: true } | { ok: false; message: string; unmet: PasswordRequirementKey[] } {
  const state = evaluatePasswordRequirements(password, email);
  const unmet = (
    Object.keys(PASSWORD_REQUIREMENT_LABELS) as PasswordRequirementKey[]
  ).filter((key) => !state[key]);

  if (unmet.length === 0) {
    return { ok: true };
  }

  return {
    ok: false,
    message: "Please meet all password requirements.",
    unmet,
  };
}

/**
 * Zod helper — keep message generic; checklist carries the detail.
 * Pass email via refine at the form level when available.
 */
export const passwordSchema = z
  .string()
  .superRefine((value, ctx) => {
    const result = validatePassword(value);
    if (!result.ok) {
      ctx.addIssue({
        code: "custom",
        message: result.message,
      });
    }
  });

export function passwordsMatch(
  password: string,
  confirmPassword: string
): boolean {
  if (!password && !confirmPassword) return false;
  return password === confirmPassword;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(
  password: string,
  passwordHash: string | null | undefined
): Promise<boolean> {
  // Never pass null/undefined into bcrypt (future OAuth-only users).
  if (!passwordHash) return false;
  return bcrypt.compare(password, passwordHash);
}
