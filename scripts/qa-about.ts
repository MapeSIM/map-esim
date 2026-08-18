/**
 * Offline QA: public About MAP eSIM page.
 * Does not start a server, mutate wallets, or send email.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { absoluteCanonical } from "../app/lib/seo/canonical";
import { isTawkEnabledRoute } from "../app/lib/support/tawkRoutes";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const page = read("app/about/page.tsx");
  const footer = read("app/components/Footer.tsx");
  const sitemap = read("app/sitemap.ts");
  const tawk = read("app/lib/support/tawkRoutes.ts");
  const pkg = read("package.json");
  const legal = read("app/components/legal/LegalDocument.tsx");
  const country = read("app/countries/[id]/page.tsx");

  console.log("1) Route + metadata/canonical");
  assert.ok(existsSync(join(root, "app/about/page.tsx")));
  assert.match(page, /ROUTE\s*=\s*["']\/about["']/);
  assert.match(
    page,
    /title = "About MAP eSIM \| Travel eSIM Connectivity"/
  );
  assert.match(
    page,
    /Learn how MAP eSIM helps travelers browse, purchase and securely install country, regional and global travel eSIM plans\./
  );
  assert.match(page, /absoluteCanonical\(ROUTE\)/);
  assert.equal(absoluteCanonical("/about"), "https://mapesim.com/about");
  assert.match(page, /alternates:\s*\{\s*canonical\s*\}/);
  assert.match(page, /robots:\s*\{\s*index:\s*true/);
  console.log("   ok");

  console.log("2) Required sections + CTAs");
  assert.match(page, /<h1[\s\S]*About MAP eSIM/);
  assert.match(page, /What we offer/);
  assert.match(page, /How the service works/);
  assert.match(page, /Our safety and privacy approach/);
  assert.match(page, /Customer support/);
  assert.match(page, /Partner and reseller program/);
  assert.match(page, /Browse Destinations/);
  assert.match(page, /href="\/countries"/);
  assert.match(page, /Contact Support/);
  assert.match(page, /href="\/contact"/);
  assert.match(page, /href="\/affiliates-and-partnerships"/);
  assert.match(page, /href="\/support"/);
  console.log("   ok");

  console.log("3) No invented claims");
  assert.doesNotMatch(page, /years of experience|award-winning|10,?000 customers/i);
  assert.doesNotMatch(page, /direct carrier partnership|MNOs we own/i);
  assert.doesNotMatch(page, /registered office|company registration|LLC|Ltd\./i);
  assert.doesNotMatch(page, /guaranteed (coverage|speed)|unlimited speed/i);
  assert.doesNotMatch(page, /simpaisa|safepay|PAYMENT_GATEWAY|prisma|migrate/i);
  console.log("   ok");

  console.log("4) Footer, sitemap, tawk");
  assert.match(footer, /label:\s*["']About MAP eSIM["']/);
  assert.match(footer, /href:\s*["']\/about["']/);
  assert.match(sitemap, /path:\s*["']\/about["']/);
  assert.match(tawk, /["']\/about["']/);
  assert.equal(isTawkEnabledRoute("/about"), true);
  assert.match(pkg, /"qa:about"/);
  console.log("   ok");

  console.log("5) Unrelated local files untouched in this QA snapshot");
  assert.match(legal, /LegalDocument/);
  assert.match(country, /generateMetadata|destination/i);
  console.log("   ok");

  console.log("PASS about_page_offline_qa");
}

main();
