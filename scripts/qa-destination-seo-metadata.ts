/**
 * Offline QA: PR vs USPR destination SEO metadata resolve independently.
 * Does not call VeSIM, invent offers, merge destinations, or touch checkout.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { absoluteCanonical } from "../app/lib/seo/canonical";
import {
  destinationPath,
  findDestinationBySlug,
  normalizeDestination,
  type VesimDestination,
} from "../app/lib/vesim/destinations";
import { destinationDisplayName } from "../app/lib/vesim/destinationPresentation";
import { BRAND_NAME } from "../app/lib/brand";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function readHead(rel: string): string {
  return execSync(`git show "HEAD:${rel}"`, { encoding: "utf8", cwd: root });
}

function asDestination(raw: {
  code: string;
  name: string;
}): VesimDestination {
  const normalized = normalizeDestination(raw);
  assert.ok(normalized, `expected normalizeDestination(${raw.code})`);
  return normalized;
}

/** Mirrors app/countries/[id]/layout.tsx metadata derivation. */
function seoFields(destination: VesimDestination) {
  const path = destinationPath(destination);
  const label = destinationDisplayName(destination);
  return {
    path,
    canonical: absoluteCanonical(path),
    title: `${label} eSIM | ${BRAND_NAME}`,
    description: `Travel data eSIM plans for ${label} from ${BRAND_NAME}.`,
    robotsIndex: true,
  };
}

function main() {
  const layout = read("app/countries/[id]/layout.tsx");
  const seoCatalog = read("app/lib/seo/destinationCatalog.ts");
  const page = readHead("app/countries/[id]/page.tsx");

  console.log("1) SEO resolver shares page-body catalog + slug finder");
  assert.match(seoCatalog, /fetchPublicDestinationCatalog/);
  assert.match(seoCatalog, /findDestinationBySlug/);
  assert.match(seoCatalog, /seo-destination-catalog-v2/);
  assert.doesNotMatch(seoCatalog, /seo-destination-catalog-v1/);
  assert.match(layout, /resolveDestinationForSeo/);
  assert.match(layout, /destinationPath\(destination\)/);
  assert.match(layout, /destinationDisplayName\(destination\)/);
  assert.match(layout, /robots:\s*\{\s*index:\s*true/);
  assert.match(page, /fetchPublicDestinationCatalog/);
  assert.match(page, /findDestinationBySlug/);
  console.log("   ok");

  console.log("2) PR and USPR resolve independently for metadata");
  const pr = asDestination({ code: "PR", name: "Puerto Rico" });
  const uspr = asDestination({ code: "USPR", name: "Puerto Rico" });
  // USPR first — catch order-sensitive regressions.
  const catalog = [uspr, pr];

  const resolvedUspr = findDestinationBySlug(catalog, "uspr");
  const resolvedPr = findDestinationBySlug(catalog, "puerto-rico");
  assert.equal(resolvedUspr?.code, "USPR");
  assert.equal(resolvedPr?.code, "PR");
  assert.notEqual(resolvedUspr?.code, resolvedPr?.code);

  const usprMeta = seoFields(resolvedUspr!);
  const prMeta = seoFields(resolvedPr!);

  assert.equal(prMeta.path, "/countries/puerto-rico");
  assert.equal(prMeta.canonical, "https://mapesim.com/countries/puerto-rico");
  assert.equal(prMeta.title, `Puerto Rico eSIM | ${BRAND_NAME}`);
  assert.equal(prMeta.robotsIndex, true);

  assert.equal(usprMeta.path, "/countries/uspr");
  assert.equal(usprMeta.canonical, "https://mapesim.com/countries/uspr");
  assert.equal(usprMeta.title, `Puerto Rico (US) eSIM | ${BRAND_NAME}`);
  assert.equal(usprMeta.robotsIndex, true);

  assert.notEqual(prMeta.canonical, usprMeta.canonical);
  assert.notEqual(prMeta.title, usprMeta.title);
  console.log("   ok");

  console.log("3) False noindex path only when unresolved");
  assert.match(
    layout,
    /title:\s*`Destination not found \| \$\{BRAND_NAME\}`/
  );
  assert.match(layout, /robots:\s*\{\s*index:\s*false/);
  assert.doesNotMatch(seoCatalog, /mergeDestinations|dedupeDestinations/);
  console.log("   ok");

  console.log("PASS destination_seo_metadata_qa");
}

main();
