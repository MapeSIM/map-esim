/**
 * Offline QA for Pakistan destination → PKR soft default + manual override.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isPakistanDestinationHint,
  isPakistanDestinationPath,
  resolveAutoDisplayCurrency,
  suggestedCurrencyForLocation,
} from "../app/lib/currency/destinationCurrency";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function main() {
  assert.equal(isPakistanDestinationHint("PK"), true);
  assert.equal(isPakistanDestinationHint("pakistan"), true);
  assert.equal(isPakistanDestinationHint("uae"), false);
  assert.equal(isPakistanDestinationPath("/countries/pakistan"), true);
  assert.equal(isPakistanDestinationPath("/countries/pk"), true);
  assert.equal(isPakistanDestinationPath("/countries/uae"), false);
  assert.equal(isPakistanDestinationPath("/account"), false);
  assert.equal(
    suggestedCurrencyForLocation({ pathname: "/countries/pakistan" }),
    "PKR"
  );
  assert.equal(
    suggestedCurrencyForLocation({
      pathname: "/account/esim/buy",
      countryQuery: "PK",
    }),
    "PKR"
  );
  assert.equal(
    suggestedCurrencyForLocation({ pathname: "/countries/turkey" }),
    null
  );
  assert.equal(
    resolveAutoDisplayCurrency({ pathname: "/countries/turkey" }),
    "USD"
  );
  console.log("PASS destination_hint_helpers");

  const provider = read("app/components/currency/CurrencyProvider.tsx");
  assert.match(provider, /resolveAutoDisplayCurrency/);
  assert.match(provider, /manualOverrideRef/);
  assert.match(provider, /setCurrencyPreferenceAction/);
  assert.match(provider, /CURRENCY_PREFERENCE_COOKIE/);
  // Manual setCurrency must mark override + persist; auto path must not.
  assert.match(
    provider,
    /manualOverrideRef\.current\s*=\s*true[\s\S]*setCurrencyPreferenceAction/
  );
  assert.match(provider, /never lock in auto-PKR|Persist only an explicit manual/i);
  assert.match(provider, /useSearchParams/);
  console.log("PASS provider_manual_overrides_auto");

  const selector = read("app/components/currency/CurrencySelector.tsx");
  assert.match(selector, /setCurrency\(code\)/);
  assert.match(selector, /CURRENCY_OPTIONS/);
  console.log("PASS header_selector_unchanged_contract");

  const price = read("app/components/plans/CurrencyPrice.tsx");
  assert.match(price, /formatPrice\(amountUsd\)/);
  console.log("PASS pricing_uses_context_formatPrice");

  console.log("qa-destination-currency: OK");
}

main();
