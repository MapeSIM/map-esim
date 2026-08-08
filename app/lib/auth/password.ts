import bcrypt from "bcryptjs";
import { z } from "zod";

const BCRYPT_COST = 12;

/** Customer password policy: length only. */
export const PASSWORD_MIN_LENGTH = 6;
/** Technical upper bound (DoS hygiene) — not a composition rule. */
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_REQUIREMENT_MESSAGE =
  "Password must be at least 6 characters.";

/**
 * Legacy strong policy for ADMIN bootstrap / admin credential changes only.
 * Do not use for customer signup/reset/change.
 */
export const ADMIN_PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_REQUIREMENT_LABELS = {
  minLength: PASSWORD_REQUIREMENT_MESSAGE,
} as const;

export type PasswordRequirementKey = keyof typeof PASSWORD_REQUIREMENT_LABELS;

export type PasswordRequirementState = Record<PasswordRequirementKey, boolean>;

/** Checklist shown under new-password fields (live UX). */
export const PASSWORD_CHECKLIST_KEYS: PasswordRequirementKey[] = ["minLength"];

/**
 * Shared customer password policy evaluation for client checklist and server validation.
 */
export function evaluatePasswordRequirements(
  password: string,
  _email?: string | null
): PasswordRequirementState {
  void _email;
  return {
    minLength:
      password.length >= PASSWORD_MIN_LENGTH &&
      password.length <= PASSWORD_MAX_LENGTH,
  };
}

export function isPasswordValid(
  password: string,
  email?: string | null
): boolean {
  if (!password) return false;
  return evaluatePasswordRequirements(password, email).minLength;
}

export function validatePassword(
  password: string,
  email?: string | null
): { ok: true } | { ok: false; message: string; unmet: PasswordRequirementKey[] } {
  if (isPasswordValid(password, email)) {
    return { ok: true };
  }

  return {
    ok: false,
    message: PASSWORD_REQUIREMENT_MESSAGE,
    unmet: ["minLength"],
  };
}

/** Strong policy for ADMIN seed / admin password updates only. */
export function isAdminPasswordValid(
  password: string,
  email?: string | null
): boolean {
  if (!password) return false;
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) return false;
  if (password.length > PASSWORD_MAX_LENGTH) return false;
  if (password !== password.trim()) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  const emailNorm = (email || "").trim().toLowerCase();
  if (emailNorm && password.toLowerCase() === emailNorm) return false;
  return true;
}

export function validateAdminPassword(
  password: string,
  email?: string | null
): { ok: true } | { ok: false; message: string } {
  if (isAdminPasswordValid(password, email)) {
    return { ok: true };
  }
  return {
    ok: false,
    message:
      "Admin password must be 10–128 characters and include upper, lower, number, and special character.",
  };
}

/**
 * Zod helper for customer passwords.
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
