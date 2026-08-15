/**
 * Explicit application role allowlist — never collapse unknown → CUSTOMER.
 */
export type AppRole = "CUSTOMER" | "ADMIN" | "PARTNER";

export function coerceAppRole(role: unknown): AppRole | null {
  if (role === "CUSTOMER" || role === "ADMIN" || role === "PARTNER") {
    return role;
  }
  return null;
}

/** Map DB/JWT role to AppRole; invalid → null (caller must fail closed). */
export function coerceAppRoleOrNull(role: unknown): AppRole | null {
  return coerceAppRole(role);
}
