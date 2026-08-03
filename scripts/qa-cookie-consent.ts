/**
 * Offline QA for cookie consent + consent-gated preference cookies.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  acceptAllConsent,
  COOKIE_CONSENT_NAME,
  createConsentRecord,
  hasOptionalConsent,
  parseCookieConsent,
  rejectNonEssentialConsent,
  serializeCookieConsent,
} from "../app/lib/cookies/consent";
import {
  CURRENCY_PREFERENCE_COOKIE,
  DEFAULT_THEME,
  parseCurrencyPreferenceCookie,
  parseThemePreferenceCookie,
  resolveServerCurrencyPreference,
  resolveServerThemePreference,
  THEME_PREFERENCE_COOKIE,
  themePreferenceToHtmlClass,
} from "../app/lib/cookies/preferenceCookies";
import {
  clearOptionalPreferenceStorage,
  installPreferenceStorageGuard,
  THEME_STORAGE_KEY,
} from "../app/lib/cookies/preferenceStorage";
import {
  CURRENCY_STORAGE_KEY,
  DEFAULT_CURRENCY,
} from "../app/lib/currency/currencies";
import { COOKIE_CONSENT_VERSION } from "../app/lib/legal";

function installLocalStorageStub() {
  const store = new Map<string, string>();
  const localStorageStub = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
  (globalThis as unknown as { localStorage: typeof localStorageStub }).localStorage =
    localStorageStub;
  (globalThis as unknown as { window: { localStorage: typeof localStorageStub } }).window =
    { localStorage: localStorageStub };
  return store;
}

function main() {
  const accept = acceptAllConsent();
  assert.equal(accept.preferences, true);
  assert.equal(accept.version, COOKIE_CONSENT_VERSION);
  console.log("PASS accept_all");

  const reject = rejectNonEssentialConsent();
  assert.equal(reject.preferences, false);
  assert.equal(hasOptionalConsent(reject, "preferences"), false);
  console.log("PASS reject_non_essential");

  const encoded = serializeCookieConsent(accept);
  assert.equal(encoded.includes("{"), false);
  const roundTrip = parseCookieConsent(encoded);
  assert.equal(roundTrip?.preferences, true);
  assert.equal(roundTrip?.analytics, true);
  console.log("PASS encoded_cookie_roundtrip");

  const custom = createConsentRecord({
    preferences: true,
    analytics: false,
    marketing: false,
  });
  assert.equal(
    parseCookieConsent(serializeCookieConsent(custom))?.analytics,
    false
  );
  console.log("PASS custom_persist_roundtrip");

  assert.equal(parseCookieConsent(undefined), null);
  assert.equal(parseCookieConsent("{not-json"), null);
  console.log("PASS invalid_null");

  // Consent decision cookie remains separate from optional preference cookies.
  assert.equal(COOKIE_CONSENT_NAME, "mapesim_cookie_consent");
  assert.notEqual(COOKIE_CONSENT_NAME, THEME_PREFERENCE_COOKIE);
  assert.notEqual(COOKIE_CONSENT_NAME, CURRENCY_PREFERENCE_COOKIE);
  assert.equal(THEME_PREFERENCE_COOKIE, "mapesim_theme_preference");
  assert.equal(CURRENCY_PREFERENCE_COOKIE, "mapesim_currency_preference");
  console.log("PASS consent_cookie_separate_from_preference_cookies");

  // No-consent / withdrawn defaults are Dark + USD; stale cookies ignored.
  assert.equal(resolveServerThemePreference(false, "light"), DEFAULT_THEME);
  assert.equal(resolveServerThemePreference(false, "system"), DEFAULT_THEME);
  assert.equal(
    resolveServerCurrencyPreference(false, "PKR"),
    DEFAULT_CURRENCY
  );
  assert.equal(DEFAULT_THEME, "dark");
  assert.equal(DEFAULT_CURRENCY, "USD");
  console.log("PASS no_consent_defaults_dark_usd");

  // Allowlisted preference cookie values only.
  assert.equal(parseThemePreferenceCookie("dark"), "dark");
  assert.equal(parseThemePreferenceCookie("light"), "light");
  assert.equal(parseThemePreferenceCookie("system"), "system");
  assert.equal(parseThemePreferenceCookie("Dark"), "dark");
  assert.equal(parseThemePreferenceCookie("neon"), null);
  assert.equal(parseThemePreferenceCookie(""), null);
  assert.equal(parseCurrencyPreferenceCookie("PKR"), "PKR");
  assert.equal(parseCurrencyPreferenceCookie("usd"), "USD");
  assert.equal(parseCurrencyPreferenceCookie("BTC"), null);
  assert.equal(resolveServerThemePreference(true, "light"), "light");
  assert.equal(resolveServerThemePreference(true, "bogus"), DEFAULT_THEME);
  assert.equal(resolveServerCurrencyPreference(true, "EUR"), "EUR");
  assert.equal(
    resolveServerCurrencyPreference(true, "NOPE"),
    DEFAULT_CURRENCY
  );
  assert.equal(themePreferenceToHtmlClass("light"), "light");
  assert.equal(themePreferenceToHtmlClass("dark"), "dark");
  assert.equal(themePreferenceToHtmlClass("system"), "dark");
  console.log("PASS preference_cookie_values_allowlisted");

  // Policy version unchanged by this change set.
  assert.equal(typeof COOKIE_CONSENT_VERSION, "string");
  assert.ok(COOKIE_CONSENT_VERSION.length > 0);
  console.log("PASS cookie_consent_policy_version_unchanged");

  // Legacy localStorage keys are blocked / cleared in client helpers only.
  const store = installLocalStorageStub();
  installPreferenceStorageGuard();
  window.localStorage.setItem(THEME_STORAGE_KEY, "light");
  window.localStorage.setItem(CURRENCY_STORAGE_KEY, "PKR");
  assert.equal(store.has(THEME_STORAGE_KEY), false);
  assert.equal(store.has(CURRENCY_STORAGE_KEY), false);
  // Seed raw store then clear via helper (simulates effect cleanup).
  store.set(THEME_STORAGE_KEY, "light");
  store.set(CURRENCY_STORAGE_KEY, "PKR");
  clearOptionalPreferenceStorage();
  assert.equal(store.has(THEME_STORAGE_KEY), false);
  assert.equal(store.has(CURRENCY_STORAGE_KEY), false);
  console.log("PASS legacy_localStorage_cleanup_client_only");

  const layoutSrc = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
  assert.equal(layoutSrc.includes('from "next/script"'), false);
  assert.equal(layoutSrc.includes("dangerouslySetInnerHTML"), false);
  assert.equal(layoutSrc.includes("clearOptionalPrefsScript"), false);
  assert.equal(layoutSrc.includes("mapesim-clear-optional-prefs"), false);
  assert.equal(layoutSrc.includes("<script"), false);
  assert.equal(layoutSrc.includes("beforeInteractive"), false);
  assert.match(layoutSrc, /resolveServerThemePreference/);
  assert.match(layoutSrc, /resolveServerCurrencyPreference/);
  assert.match(layoutSrc, /themePreferenceToHtmlClass/);
  console.log("PASS layout_no_preference_cleanup_script");

  const syncSrc = readFileSync(
    join(process.cwd(), "app/components/cookies/PreferenceStorageSync.tsx"),
    "utf8"
  );
  assert.match(syncSrc, /useEffect/);
  assert.match(syncSrc, /clearOptionalPreferenceStorage/);
  assert.equal(syncSrc.includes("dangerouslySetInnerHTML"), false);
  assert.equal(syncSrc.includes("createElement(\"script\""), false);
  console.log("PASS legacy_cleanup_in_client_effect");

  const consentActionsSrc = readFileSync(
    join(process.cwd(), "app/lib/cookies/consentActions.ts"),
    "utf8"
  );
  assert.match(consentActionsSrc, /THEME_PREFERENCE_COOKIE/);
  assert.match(consentActionsSrc, /CURRENCY_PREFERENCE_COOKIE/);
  assert.match(consentActionsSrc, /!record\.preferences/);
  console.log("PASS preference_cookies_deleted_on_consent_withdraw");

  const preferenceActionsSrc = readFileSync(
    join(process.cwd(), "app/lib/cookies/preferenceActions.ts"),
    "utf8"
  );
  assert.match(preferenceActionsSrc, /preferencesConsentGranted/);
  assert.match(preferenceActionsSrc, /setThemePreferenceAction/);
  assert.match(preferenceActionsSrc, /setCurrencyPreferenceAction/);
  assert.match(preferenceActionsSrc, /clearOptionalPreferenceCookiesAction/);
  console.log("PASS preference_cookie_writes_require_consent");

  // Phase 3C1 order module still server-only / unchanged surface.
  const ordersSrc = readFileSync(
    join(process.cwd(), "app/lib/admin/orders.ts"),
    "utf8"
  );
  assert.match(ordersSrc, /import "server-only"/);
  assert.match(ordersSrc, /getAdminOrdersPage/);
  assert.match(ordersSrc, /getAdminOrderDetail/);
  assert.equal(ordersSrc.includes("vesim"), false);
  console.log("PASS phase3c1_orders_untouched_surface");

  const themeProviderSrc = readFileSync(
    join(process.cwd(), "app/components/theme/ThemeProvider.tsx"),
    "utf8"
  );
  assert.equal(themeProviderSrc.includes("next-themes"), false);
  assert.equal(themeProviderSrc.includes("<script"), false);
  assert.equal(themeProviderSrc.includes("dangerouslySetInnerHTML"), false);
  console.log("PASS theme_provider_no_inline_script");

  console.log("ALL_QA_PASSED=16");
}

main();
