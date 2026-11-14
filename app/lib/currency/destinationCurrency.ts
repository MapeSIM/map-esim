/**
 * Pure destination → display-currency hints (offline-QA safe).
 * Manual header selection always wins when a preference cookie exists.
 */

import {
  DEFAULT_CURRENCY,
  type CurrencyCode,
} from "@/app/lib/currency/currencies";

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** Pakistan destination codes / slugs used on public browse + buy URLs. */
export function isPakistanDestinationHint(
  raw: string | null | undefined
): boolean {
  const value = trimmed(raw);
  if (!value) return false;
  if (/^pk$/i.test(value)) return true;
  if (/^pakistan$/i.test(value)) return true;
  return false;
}

function normalizePathname(pathname: string): string {
  const raw = (pathname.split("?")[0] || "/").trim();
  if (!raw || raw === "/") return "/";
  return raw.replace(/\/+$/, "") || "/";
}

/**
 * True when the browse URL is a Pakistan destination page.
 * Matches /countries/pakistan, /countries/pk, /esim/pakistan, etc.
 */
export function isPakistanDestinationPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return false;

  const root = segments[0]?.toLowerCase();
  if (
    root !== "countries" &&
    root !== "esim" &&
    root !== "plans" &&
    root !== "destinations"
  ) {
    return false;
  }

  return isPakistanDestinationHint(segments[1]);
}

/**
 * Soft suggested display currency for the current location.
 * Returns null when there is no destination-based suggestion (caller uses DEFAULT).
 * Never persists — only CurrencySelector / setCurrency writes the preference cookie.
 */
export function suggestedCurrencyForLocation(input: {
  pathname: string;
  countryQuery?: string | null;
}): CurrencyCode | null {
  if (isPakistanDestinationPath(input.pathname)) return "PKR";
  if (isPakistanDestinationHint(input.countryQuery)) return "PKR";
  return null;
}

/**
 * Effective display currency when the user has not manually overridden.
 */
export function resolveAutoDisplayCurrency(input: {
  pathname: string;
  countryQuery?: string | null;
}): CurrencyCode {
  return suggestedCurrencyForLocation(input) ?? DEFAULT_CURRENCY;
}
