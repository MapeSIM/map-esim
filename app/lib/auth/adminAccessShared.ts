/**
 * Pure admin account status helpers (safe for offline QA).
 */
import { Role } from "@prisma/client";

export type AdminAccountStatusLabel =
  | "DELETED"
  | "DISABLED"
  | "INVITED"
  | "ACTIVE"
  | "OTHER";

export function resolveAdminAccountStatus(input: {
  role: Role | string;
  deletedAt?: Date | null;
  adminDisabledAt?: Date | null;
  passwordHash?: string | null;
  emailVerifiedAt?: Date | null;
}): AdminAccountStatusLabel {
  if (input.deletedAt) return "DELETED";
  if (input.role !== Role.ADMIN && input.role !== "ADMIN") return "OTHER";
  if (input.adminDisabledAt) return "DISABLED";
  if (!input.passwordHash) return "INVITED";
  if (!input.emailVerifiedAt) return "INVITED";
  return "ACTIVE";
}

/** ACTIVE admin for last-admin protection (INVITED does not count). */
export function isActiveAdminForProtection(input: {
  role: Role | string;
  deletedAt?: Date | null;
  adminDisabledAt?: Date | null;
  passwordHash?: string | null;
  emailVerifiedAt?: Date | null;
}): boolean {
  return resolveAdminAccountStatus(input) === "ACTIVE";
}

export function isAdminAccessDenied(user: {
  role: Role | string;
  deletedAt?: Date | null;
  adminDisabledAt?: Date | null;
}): boolean {
  if (user.deletedAt) return true;
  if (user.role !== Role.ADMIN && user.role !== "ADMIN") return true;
  if (user.adminDisabledAt) return true;
  return false;
}
