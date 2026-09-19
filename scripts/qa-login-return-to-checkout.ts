/**
 * Offline QA: logged-out package selection → login → return to checkout.
 * Also covers abandoned checkout review resume + verify-email callback chain.
 * Covers credentials + Google callbackUrl handling and open-redirect rejection.
 * Does not call providers, mutate the database, or touch .env files.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendSafeCallbackUrlQuery,
  buildWalletBuyReturnPath,
  buildWalletBuyReviewReturnPath,
  postSignInPath,
  resolvePostSignInPath,
  safeCallbackPath,
} from "../app/lib/auth/redirects";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const buyHref = "/account/esim/buy?offerId=offer_abc&country=PK";
  const reviewHref = "/account/esim/buy/review?purchase=purchase_abc";
  const sameOrigin = "http://localhost:3000";
  const opts = { requestOrigin: sameOrigin };

  // 1) Package selection → login → checkout return (relative + absolute same-site)
  assert.equal(
    resolvePostSignInPath("CUSTOMER", buyHref, opts),
    buyHref
  );
  assert.equal(
    resolvePostSignInPath(
      "CUSTOMER",
      `${sameOrigin}${buyHref}`,
      opts
    ),
    buyHref
  );
  assert.equal(
    safeCallbackPath(`${sameOrigin}${buyHref}`, "/", opts),
    buyHref
  );
  assert.equal(
    buildWalletBuyReturnPath({ offerId: "offer_abc", country: "PK" }),
    buyHref
  );
  console.log("PASS package_selection_login_returns_to_checkout");

  // 1b) Abandoned checkout review resume URL preserved through post-login
  assert.equal(
    buildWalletBuyReviewReturnPath("purchase_abc"),
    reviewHref
  );
  assert.equal(
    resolvePostSignInPath("CUSTOMER", reviewHref, opts),
    reviewHref
  );
  assert.equal(
    resolvePostSignInPath(
      "CUSTOMER",
      `${sameOrigin}${reviewHref}`,
      opts
    ),
    reviewHref
  );
  assert.equal(
    safeCallbackPath(`${sameOrigin}${reviewHref}`, "/", opts),
    reviewHref
  );
  assert.equal(
    buildWalletBuyReviewReturnPath("bad id!!"),
    "/account/esim/buy/review"
  );
  console.log("PASS abandoned_checkout_review_login_return");

  // 1c) verify-email chain keeps callbackUrl (signin ↔ verify ↔ signin)
  const verifyWithCallback = appendSafeCallbackUrlQuery(
    "/verify-email?email=a%40b.co",
    reviewHref,
    opts
  );
  assert.match(
    verifyWithCallback,
    /callbackUrl=%2Faccount%2Fesim%2Fbuy%2Freview%3Fpurchase%3Dpurchase_abc/
  );
  const signInAfterVerify = appendSafeCallbackUrlQuery(
    "/signin?verified=1",
    reviewHref,
    opts
  );
  assert.match(signInAfterVerify, /verified=1/);
  assert.match(
    signInAfterVerify,
    /callbackUrl=%2Faccount%2Fesim%2Fbuy%2Freview%3Fpurchase%3Dpurchase_abc/
  );
  assert.equal(
    appendSafeCallbackUrlQuery("/signin?verified=1", "https://evil.example/x", opts),
    "/signin?verified=1"
  );
  console.log("PASS verify_email_callback_chain");

  // 2) Google OAuth path uses the same safe callback normalization
  const googleSignIn = read("app/lib/auth/googleSignInAction.ts");
  const signinPage = read("app/signin/page.tsx");
  const authConfig = read("auth.config.ts");
  assert.match(googleSignIn, /readRequestOrigin/);
  assert.match(googleSignIn, /safeCallbackPath\(rawCallback, "\/"/);
  assert.match(signinPage, /readRequestOrigin/);
  assert.match(signinPage, /callbackUrl \|\| "\/"/);
  assert.match(authConfig, /safeCallbackPath\(url,/);
  assert.equal(
    safeCallbackPath(
      `${sameOrigin}/account/esim/buy?offerId=g1`,
      "/",
      opts
    ),
    "/account/esim/buy?offerId=g1"
  );
  console.log("PASS google_oauth_callback_preserves_return");

  // 3) Invalid / external / protocol-relative / scheme abuse → fallback
  assert.equal(
    resolvePostSignInPath("CUSTOMER", "https://evil.example/phish", opts),
    "/"
  );
  assert.equal(safeCallbackPath("https://evil.example/phish", "/", opts), "/");
  assert.equal(safeCallbackPath("//evil.example/phish", "/", opts), "/");
  assert.equal(safeCallbackPath("javascript:alert(1)", "/", opts), "/");
  assert.equal(safeCallbackPath("data:text/html,hi", "/", opts), "/");
  assert.equal(safeCallbackPath("https://evil.example", "/", opts), "/");
  // Absolute URL whose host is not the request origin and not env allowlist
  assert.equal(
    safeCallbackPath("https://phish.test/account/esim/buy?offerId=x", "/"),
    "/"
  );
  console.log("PASS invalid_external_return_url_rejected");

  // 4) Direct normal login (no callback) still uses default home
  assert.equal(postSignInPath("CUSTOMER"), "/");
  assert.equal(resolvePostSignInPath("CUSTOMER"), "/");
  assert.equal(resolvePostSignInPath("CUSTOMER", ""), "/");
  assert.equal(resolvePostSignInPath("CUSTOMER", null), "/");
  assert.equal(safeCallbackPath("", "/", opts), "/");
  console.log("PASS normal_login_default_destination");

  // Wiring: buy + review preserve return; verify-email + layout/middleware
  const buyPage = read("app/account/esim/buy/page.tsx");
  const reviewPage = read("app/account/esim/buy/review/page.tsx");
  const session = read("app/lib/auth/session.ts");
  const actions = read("app/lib/auth/actions.ts");
  const guestGate = read("app/lib/vesim/guestCheckoutGate.ts");
  const planUtils = read("app/lib/plans/plan-utils.ts");
  const verifyPage = read("app/verify-email/page.tsx");
  const otpForm = read("app/components/auth/OtpVerifyForm.tsx");
  const accountLayout = read("app/account/layout.tsx");
  const middleware = read("middleware.ts");

  assert.match(buyPage, /buildWalletBuyReturnPath/);
  assert.match(buyPage, /requireRole\(\s*"CUSTOMER"/);
  assert.match(reviewPage, /buildWalletBuyReviewReturnPath/);
  assert.match(reviewPage, /requireRole\(/);
  assert.match(session, /callbackPath\?:/);
  assert.match(actions, /resolvePostSignInPath\(role, rawCallbackUrl/);
  assert.match(actions, /readRequestOrigin/);
  assert.match(actions, /appendSafeCallbackUrlQuery/);
  assert.match(actions, /verifyParams\.set\("callbackUrl"/);
  assert.match(planUtils, /\/account\/esim\/buy\?/);
  assert.match(verifyPage, /callbackUrl/);
  assert.match(otpForm, /callbackUrl/);
  assert.match(accountLayout, /x-map-pathname/);
  assert.match(accountLayout, /x-map-search/);
  assert.match(middleware, /x-map-search/);
  assert.match(
    guestGate,
    /process\.env\.ENABLE_GUEST_VESIM_CHECKOUT\s*===\s*"true"/
  );
  assert.doesNotMatch(buyPage, /ENABLE_GUEST_VESIM_CHECKOUT/);
  console.log("PASS wiring_and_guest_checkout_unchanged");

  console.log("OK qa-login-return-to-checkout");
}

main();
