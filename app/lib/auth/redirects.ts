/**
 * Prevent open redirects after sign-in.
 * Only same-origin relative paths are allowed.
 */
export function safeCallbackPath(
  callbackUrl: string | null | undefined,
  fallback: string
): string {
  if (!callbackUrl) return fallback;
  const value = callbackUrl.trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("://")) return fallback;
  if (value.includes("\\")) return fallback;
  return value;
}

export function postSignInPath(role: "CUSTOMER" | "ADMIN"): string {
  // Normal customer sign-in lands on public home. Protected flows still
  // honor a safe internal callbackUrl via resolvePostSignInPath.
  return role === "ADMIN" ? "/admin" : "/";
}

/**
 * Resolve where to send the user after credentials sign-in.
 * Honors a safe internal callbackUrl only if the role may access it.
 */
export function resolvePostSignInPath(
  role: "CUSTOMER" | "ADMIN",
  callbackUrl?: string | null
): string {
  const fallback = postSignInPath(role);
  const safe = safeCallbackPath(callbackUrl, "");
  if (!safe) return fallback;

  if (safe === "/admin" || safe.startsWith("/admin/")) {
    return role === "ADMIN" ? safe : "/account";
  }

  return safe;
}

export function navAuthLink(options: {
  userId?: string | null;
  role?: "CUSTOMER" | "ADMIN" | null;
}): { href: string; label: string } {
  if (!options.userId) {
    return { href: "/signin", label: "Sign in" };
  }
  if (options.role === "ADMIN") {
    return { href: "/admin", label: "Admin" };
  }
  return { href: "/account", label: "Account" };
}
