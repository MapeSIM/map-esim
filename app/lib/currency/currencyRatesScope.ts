/**
 * Pathnames that render converted catalog prices via `formatPrice`.
 * CurrencyProvider still mounts site-wide for preference cookies; live FX
 * fetch is skipped on routes that never display prices.
 */
export function pathnameNeedsLiveCurrencyRates(pathname: string): boolean {
  const path = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";

  if (path === "/countries" || path.startsWith("/countries/")) return true;
  if (path === "/plans" || path.startsWith("/plans/")) return true;
  if (path === "/checkout" || path.startsWith("/checkout/")) return true;
  if (path === "/account" || path.startsWith("/account/")) return true;
  if (path === "/success" || path.startsWith("/success/")) return true;
  if (path === "/esim" || path.startsWith("/esim/")) return true;

  return false;
}
