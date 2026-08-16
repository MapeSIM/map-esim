/**
 * Offline QA: professional customer mobile drawer + compact account UX (#8C).
 * Static source checks only — no auth/session/wallet mutation.
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
  const accountLayout = read("app/account/layout.tsx");
  const accountMenu = read("app/components/account/AccountMenu.tsx");
  const accountPage = read("app/account/page.tsx");
  const ordersPage = read("app/account/orders/page.tsx");
  const installPanel = read(
    "app/components/orders/CustomerEsimInstallPanel.tsx"
  );
  const pkg = read("package.json");

  // A) Logged-out drawer contents
  assert.match(navbar, /label: "Home"/);
  assert.match(navbar, /label: "Pakistan"/);
  assert.match(navbar, /label: "Destinations"/);
  assert.match(navbar, /label: "How It Works"/);
  assert.match(navbar, /label: "Contact"|\/contact/);
  assert.match(navbar, /Affiliates/);
  assert.match(navbar, /CurrencySelector/);
  assert.match(navbar, /Sign [Ii]n|\/signin/);
  assert.match(navbar, /Create Account|Register|\/signup/);
  assert.match(navbar, /Get eSIM/);
  assert.match(navbar, /Need help\?/);
  assert.match(navbar, /support@mapesim\.com|BRAND_SUPPORT_EMAIL/);
  // Mobile drawer omits primary Support (help stays via bottom mailto + Contact).
  assert.match(navbar, /\.filter\(\(link\) => link\.href !== "\/support"\)/);
  console.log("PASS logged_out_drawer");

  // B) Logged-in drawer — identity, My eSIMs first-class, wallet, sign out
  assert.match(navbar, /customer\.name|customer\?\.name|customerName/);
  assert.match(navbar, /My eSIMs/);
  assert.match(navbar, /\/account\/orders/);
  assert.match(navbar, /My Account|\/account"/);
  assert.match(navbar, /Wallet|\/account\/wallet/);
  assert.match(navbar, /signOutAction|Sign out/);
  assert.match(navbar, /walletBalanceLabel|balanceLabel/);
  // Wallet is only via the balance card — no redundant Account-nav Wallet row.
  const customerDrawer = navbar.slice(
    navbar.indexOf("isCustomer && customer"),
    navbar.indexOf("isPartner && partner")
  );
  assert.match(
    customerDrawer,
    /aria-label="Account">[\s\S]*?My eSIMs[\s\S]*?My Account[\s\S]*?<\/nav>/
  );
  assert.doesNotMatch(
    customerDrawer,
    /aria-label="Account">[\s\S]*?Wallet[\s\S]*?<\/nav>/
  );
  assert.doesNotMatch(navbar, /reward|Reward points|Add data to this eSIM/i);
  assert.doesNotMatch(navbar, /activationCode|qrValue|lpa|carddata|iccid/i);
  console.log("PASS logged_in_drawer");

  // Single mobile menu system — full-viewport side sheet via portal
  assert.match(navbar, /createPortal/);
  assert.match(navbar, /document\.body/);
  assert.match(navbar, /fixed inset-0/);
  assert.match(navbar, /role="dialog"|aria-modal/);
  assert.match(navbar, /h-\[100dvh\]|100dvh/);
  assert.match(navbar, /Escape|keydown/);
  assert.match(navbar, /document\.body\.style\.overflow/);
  assert.match(navbar, /w-\[min\(.*92|min\(92vw/);
  console.log("PASS single_mobile_drawer_behavior");

  // No duplicate Account hamburger on mobile account pages
  assert.match(accountMenu, /hidden lg:|lg:inline-flex|max-lg:hidden/);
  assert.match(accountLayout, /AccountMenu/);
  console.log("PASS no_duplicate_mobile_account_menu");

  // C) My eSIMs journey + #install preserved
  assert.match(ordersPage, /My eSIMs/);
  assert.match(ordersPage, /#install/);
  assert.match(installPanel, /hasInstallHashIntent|location\.hash/);
  assert.match(installPanel, /autoOpenStarted/);
  console.log("PASS my_esims_install_journey");

  // D) Compact account dashboard — no repeated name/email in page body
  assert.match(accountPage, /My Account|My eSIMs/);
  assert.match(accountPage, /\/account\/orders/);
  assert.match(accountPage, /\/account\/wallet/);
  assert.match(accountPage, /\/account\/profile/);
  assert.match(accountPage, /\/account\/security/);
  assert.match(accountPage, /view, install, and manage|install and manage/i);
  assert.match(accountPage, /Email verified|EmailVerified/);
  assert.doesNotMatch(accountPage, /\{user\.name\}/);
  assert.doesNotMatch(accountPage, /\{user\.email\}/);
  console.log("PASS compact_account_page");

  // E) Layout wires customer summary without inventing APIs
  assert.match(layout, /Navbar/);
  assert.match(layout, /getCustomerWalletSummary/);
  assert.match(layout, /customer=\{customerNav\}|customer=\{customerNav\}/);
  assert.match(layout, /customerNav/);
  assert.doesNotMatch(layout, /decryptIccid|fetchBrokerOrderPayload/);
  console.log("PASS layout_customer_props_safe");

  assert.match(pkg, /"qa:customer-mobile-nav"/);
  console.log("PASS package_script");

  console.log("ALL_QA_PASSED=customer-mobile-nav");
}

main();
