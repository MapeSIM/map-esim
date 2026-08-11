/**
 * Offline QA: Affiliates & Partnerships page + primary nav swap (Plans removed).
 * Does not send email, mutate DB, or touch payments.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PARTNERSHIP_VOLUME_OPTIONS,
  parsePartnershipVolume,
  partnershipVolumeLabel,
} from "../app/lib/partnerships/partnershipLimits";
import { absoluteCanonical } from "../app/lib/seo/canonical";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const page = read("app/affiliates-and-partnerships/page.tsx");
  const form = read("app/components/partnerships/PartnershipApplicationForm.tsx");
  const action = read("app/lib/partnerships/submitPartnershipForm.ts");
  const email = read("app/lib/email/sendPartnershipFormEmail.ts");
  const navbar = read("app/components/Navbar.tsx");
  const footer = read("app/components/Footer.tsx");
  const sitemap = read("app/sitemap.ts");
  const tawk = read("app/lib/support/tawkRoutes.ts");
  const plansPage = read("app/plans/page.tsx");
  const pkg = read("package.json");

  console.log("1) Route + metadata/canonical");
  assert.match(page, /Affiliates &(?:amp;)? Partnerships/);
  assert.match(page, /ROUTE\s*=\s*["']\/affiliates-and-partnerships["']/);
  assert.match(page, /absoluteCanonical\(ROUTE\)/);
  assert.equal(
    absoluteCanonical("/affiliates-and-partnerships"),
    "https://mapesim.com/affiliates-and-partnerships"
  );
  assert.match(page, /PartnershipApplicationForm/);
  assert.match(page, /Partner types|Travel agencies|Content creators/);
  assert.match(page, /How it works|Apply|reviews|Approved partners|onboarding/i);
  assert.doesNotMatch(page, /\d+%\s*commission|commission rate of/i);
  assert.match(pkg, /"qa:affiliates-partnerships"/);
  console.log("   ok");

  console.log("2) Nav removes Plans; adds Affiliates; /plans remains");
  assert.doesNotMatch(navbar, /href:\s*["']\/plans["']/);
  assert.match(
    navbar,
    /href:\s*["']\/affiliates-and-partnerships["']/
  );
  assert.match(navbar, /Affiliates & Partnerships/);
  assert.match(navbar, /Get eSIM/);
  assert.match(navbar, /href=["']\/countries["']/);
  assert.match(navbar, /authHref|Sign in|Account/);
  assert.doesNotMatch(footer, /label:\s*["']Plans["']/);
  assert.match(footer, /Affiliates & Partnerships/);
  assert.match(plansPage, /fetchPublicDestinationCatalog|PlansDiscovery/);
  assert.match(sitemap, /path:\s*["']\/plans["']/);
  assert.match(sitemap, /path:\s*["']\/affiliates-and-partnerships["']/);
  assert.match(tawk, /\/affiliates-and-partnerships/);
  console.log("   ok");

  console.log("3) Form validation + email safety");
  assert.match(form, /submitPartnershipFormAction/);
  assert.match(form, /fullName|companyName|businessEmail|expectedVolume/);
  assert.match(form, /fax_number/);
  assert.match(action, /"use server"/);
  assert.match(action, /assertPartnershipRateLimit/);
  assert.match(action, /assertPartnershipNotDuplicate/);
  assert.match(action, /isValidEmail/);
  assert.match(action, /sendPartnershipFormEmail/);
  assert.match(email, /channel|support|BRAND_SUPPORT_EMAIL/);
  assert.match(email, /replyTo/);
  assert.doesNotMatch(email, /SMTP_.*PASSWORD|DATABASE_URL|VESIM_PASSWORD/);
  assert.doesNotMatch(action, /commission|wallet|PAYMENT_GATEWAY/);
  assert.ok(parsePartnershipVolume("50_200") === "50_200");
  assert.equal(parsePartnershipVolume("hack"), null);
  assert.match(partnershipVolumeLabel("under_50"), /Under 50/);
  assert.deepEqual([...PARTNERSHIP_VOLUME_OPTIONS], [
    "exploring",
    "under_50",
    "50_200",
    "200_1000",
    "1000_plus",
  ]);
  console.log("   ok");

  console.log("ALL_QA_PASSED=affiliates-partnerships");
}

main();
