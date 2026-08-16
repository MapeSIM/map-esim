/**
 * Allowlist for Tawk on public browsing/support pages only.
 * Sensitive account, checkout, auth, admin, and tokenized success routes are excluded.
 */

const BLOCKED_PREFIXES = [
  "/admin",
  "/api",
  "/account",
  "/checkout",
  "/payment",
  "/success",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/verify-reset-code",
  "/oauth-consent",
  "/dashboard",
  "/share",
] as const;

const ALLOWED_EXACT = new Set([
  "/",
  "/countries",
  "/plans",
  "/esim",
  "/support",
  "/install/iphone",
  "/install/android",
  "/privacy-policy",
  "/terms-and-conditions",
  "/cookie-policy",
  "/how-it-works",
  "/contact",
  "/affiliates-and-partnerships",
]);

function matchesBlocked(pathname: string): boolean {
  return BLOCKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Returns true when Tawk may load on this App Router pathname. */
export function isTawkEnabledRoute(pathname: string): boolean {
  const path = (pathname || "/").split("?")[0].split("#")[0] || "/";
  if (matchesBlocked(path)) return false;
  if (ALLOWED_EXACT.has(path)) return true;
  if (path.startsWith("/countries/")) return true;
  return false;
}
