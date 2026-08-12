/**
 * Offline QA: shared Navbar responsive spacing / Get eSIM single-line CTA.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const navbar = read("app/components/Navbar.tsx");
  const layout = read("app/layout.tsx");
  const pkg = read("package.json");

  console.log("1) Shared navbar only + order preserved");
  assert.match(layout, /import Navbar from ["']\.\/components\/Navbar["']/);
  assert.match(navbar, /label: "Home"/);
  assert.match(navbar, /label: "Pakistan"/);
  assert.match(navbar, /label: "Destinations"/);
  assert.match(navbar, /label: "How It Works"/);
  assert.match(navbar, /label: "Support"/);
  assert.match(navbar, /label: "Contact"/);
  assert.match(navbar, /label: "Affiliates & Partnerships"/);
  assert.match(navbar, /\["Affiliates &",\s*"Partnerships"\]/);
  assert.match(navbar, /labelLines/);
  assert.match(navbar, /variant="desktop"/);
  assert.match(navbar, /variant="mobile"/);
  assert.match(navbar, /href=["']\/countries["']/);
  assert.match(navbar, /Get eSIM/);
  assert.doesNotMatch(navbar, /href=["']\/account\/esim\/buy["']/);
  console.log("   ok");

  console.log("2) Logo spacing + Get eSIM no-wrap");
  assert.match(navbar, /lg:mr-4|xl:mr-6/);
  assert.match(navbar, /shrink-0/);
  // Desktop Get eSIM CTA must force a single line.
  assert.match(navbar, /whitespace-nowrap rounded-\[14px\] bg-\[var\(--accent\)\]/);
  assert.match(
    navbar,
    /whitespace-nowrap rounded-\[14px\] bg-\[var\(--accent\)\][\s\S]{0,800}Get eSIM/
  );
  assert.match(navbar, /flex-1 items-center justify-end/);
  assert.match(pkg, /"qa:navbar-layout"/);
  console.log("   ok");

  console.log("3) Mobile menu still present");
  assert.match(navbar, /mobile-nav|lg:hidden/);
  assert.match(navbar, /Open menu|Close menu/);
  assert.match(navbar, /role="dialog"|aria-modal/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=navbar-layout");
}

main();
