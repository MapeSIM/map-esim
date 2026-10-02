/**
 * Offline QA: default /countries grid HTML escaping & URL allowlisting.
 * Does not call VeSIM, mutate DB, or touch payments.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCountriesDefaultGridBodyHtml,
  escapeHtml,
  safeDestinationCardHref,
  safeFlagImageSrc,
} from "../app/components/countries/CountriesDefaultCountryGridHtml";
import type { DestinationCard } from "../app/lib/vesim/countriesListingModel";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function maliciousCard(overrides: Partial<DestinationCard> = {}): DestinationCard {
  return {
    id: "pakistan",
    name: 'Pak<script>alert(1)</script>istan',
    code: "PK",
    flag: "🇵🇰",
    plans: 3,
    minPriceUsd: 1.5,
    kind: "country",
    isPopular: true,
    ...overrides,
  };
}

function main() {
  const src = read("app/components/countries/CountriesDefaultCountryGridHtml.tsx");
  const pkg = read("package.json");

  console.log("1) Source uses escape helper + no raw provider HTML APIs");
  assert.match(src, /function escapeHtml|export function escapeHtml/);
  assert.match(src, /dangerouslySetInnerHTML=\{\{\s*__html:\s*body\s*\}\}/);
  assert.match(src, /buildCountriesDefaultGridBodyHtml/);
  assert.match(src, /safeDestinationCardHref/);
  assert.match(src, /safeFlagImageSrc/);
  // Generated markup must never emit handlers; rejection regexes in source are OK.
  assert.doesNotMatch(src, /\son\w+\s*=\s*["'`]/);
  assert.doesNotMatch(src, /href=\{[^}]*destination\.(name|flag|code)/);
  console.log("   ok");

  console.log("2) escapeHtml encodes markup and quotes");
  assert.equal(
    escapeHtml(`<img src=x onerror="alert(1)">`),
    `&lt;img src=x onerror=&quot;alert(1)&quot;&gt;`
  );
  assert.equal(escapeHtml(`a&b`), `a&amp;b`);
  assert.equal(escapeHtml(`O'Brien`), `O&#39;Brien`);
  console.log("   ok");

  console.log("3) Malicious name/title never appear raw in generated HTML");
  const html = buildCountriesDefaultGridBodyHtml({
    destinationsCount: 1,
    filteredCount: 1,
    alphabeticalGroups: [
      {
        letter: "P",
        items: [maliciousCard()],
      },
    ],
  });
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onerror=/i);
  assert.match(html, /Pak&lt;script&gt;alert\(1\)&lt;\/script&gt;istan/);
  assert.match(html, /href="\/countries\/pakistan\?fromFilter=Country"/);
  assert.match(html, /class="map-dest-card"/);
  assert.match(html, /data-usd="1\.5"/);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /\son\w+=/i);
  console.log("   ok");

  console.log("4) Href allowlist rejects schemes / unsafe ids");
  assert.equal(safeDestinationCardHref("pakistan"), "/countries/pakistan?fromFilter=Country");
  assert.equal(safeDestinationCardHref("region-asia"), "/countries/region-asia?fromFilter=Country");
  assert.equal(safeDestinationCardHref("javascript:alert(1)"), "/countries");
  assert.equal(safeDestinationCardHref('pk"><script>'), "/countries");
  console.log("   ok");

  console.log("5) Flag src allowlist");
  assert.equal(safeFlagImageSrc("/flags/pk.svg"), "/flags/pk.svg");
  assert.equal(safeFlagImageSrc("https://flagcdn.com/pk.svg"), "https://flagcdn.com/pk.svg");
  assert.equal(safeFlagImageSrc("javascript:alert(1)"), null);
  assert.equal(safeFlagImageSrc("https://evil.example/pk.svg"), null);
  assert.equal(safeFlagImageSrc("/flags/../etc/passwd"), null);
  console.log("   ok");

  console.log("6) Package script wired");
  assert.match(pkg, /"qa:countries-default-grid-html"/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=countries-default-grid-html");
}

main();
