/**
 * Offline QA for cookie consent + preference-storage persistence gating.
 */
import assert from "node:assert/strict";
import {
  acceptAllConsent,
  createConsentRecord,
  hasOptionalConsent,
  parseCookieConsent,
  rejectNonEssentialConsent,
  serializeCookieConsent,
} from "../app/lib/cookies/consent";
import {
  clearOptionalPreferenceStorage,
  installPreferenceStorageGuard,
  isPreferencePersistenceAllowed,
  setPreferencePersistenceAllowed,
  THEME_STORAGE_KEY,
  writeOptionalCurrencyStorage,
  writeOptionalThemeStorage,
} from "../app/lib/cookies/preferenceStorage";
import { CURRENCY_STORAGE_KEY } from "../app/lib/currency/currencies";
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

  const store = installLocalStorageStub();
  installPreferenceStorageGuard();

  setPreferencePersistenceAllowed(false);
  assert.equal(isPreferencePersistenceAllowed(), false);
  writeOptionalThemeStorage("light");
  writeOptionalCurrencyStorage("PKR");
  window.localStorage.setItem(THEME_STORAGE_KEY, "light");
  window.localStorage.setItem(CURRENCY_STORAGE_KEY, "PKR");
  assert.equal(store.has(THEME_STORAGE_KEY), false);
  assert.equal(store.has(CURRENCY_STORAGE_KEY), false);
  console.log("PASS block_writes_without_preference_consent");

  setPreferencePersistenceAllowed(true);
  writeOptionalThemeStorage("light");
  writeOptionalCurrencyStorage("PKR");
  assert.equal(store.get(THEME_STORAGE_KEY), "light");
  assert.equal(store.get(CURRENCY_STORAGE_KEY), "PKR");
  console.log("PASS allow_writes_with_preference_consent");

  clearOptionalPreferenceStorage();
  assert.equal(store.has(THEME_STORAGE_KEY), false);
  assert.equal(store.has(CURRENCY_STORAGE_KEY), false);
  console.log("PASS clear_optional_preference_storage");

  console.log("ALL_QA_PASSED=8");
}

main();
