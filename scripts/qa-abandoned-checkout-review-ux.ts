/**
 * Offline QA: abandoned-checkout review UX for stale / terminal cases.
 * Display guidance only — no payment, wallet, or auth behavior changes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CUSTOMER_ABANDONED_REVIEW_OUTDATED_MESSAGE,
  CUSTOMER_ABANDONED_REVIEW_PAYMENT_ENDED_MESSAGE,
  CUSTOMER_ABANDONED_REVIEW_START_NEW_LABEL,
  CUSTOMER_PENDING_PURCHASES_MAX_AGE_MS,
  CUSTOMER_STALE_CHECKOUT_DISPLAY_MS,
  CUSTOMER_STALE_CHECKOUT_MESSAGE,
  resolveAbandonedCheckoutReviewGuidance,
} from "../app/lib/esim/customerPurchaseStatusMessaging";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const now = Date.now();

  // Fresh READY / in-flight AWAITING → no guidance (active checkout unchanged)
  assert.equal(
    resolveAbandonedCheckoutReviewGuidance({
      status: "READY",
      updatedAt: now - 60_000,
      now,
    }),
    null
  );
  assert.equal(
    resolveAbandonedCheckoutReviewGuidance({
      status: "AWAITING_GATEWAY_PAYMENT",
      updatedAt: now - 60_000,
      pendingGatewayAttemptId: "att_live",
      now,
    }),
    null
  );
  console.log("PASS fresh_active_checkout_no_guidance");

  // Stale unfinished checkout
  const stale = resolveAbandonedCheckoutReviewGuidance({
    status: "READY",
    updatedAt: now - CUSTOMER_STALE_CHECKOUT_DISPLAY_MS - 1,
    now,
  });
  assert.equal(stale?.kind, "stale");
  assert.equal(stale?.body, CUSTOMER_STALE_CHECKOUT_MESSAGE);
  assert.equal(stale?.startNewPurchaseLabel, CUSTOMER_ABANDONED_REVIEW_START_NEW_LABEL);
  console.log("PASS stale_abandoned_review_guidance");

  // Beyond pending UI max age → outdated
  const outdated = resolveAbandonedCheckoutReviewGuidance({
    status: "READY",
    updatedAt: now - CUSTOMER_PENDING_PURCHASES_MAX_AGE_MS - 1,
    now,
  });
  assert.equal(outdated?.kind, "outdated");
  assert.equal(outdated?.body, CUSTOMER_ABANDONED_REVIEW_OUTDATED_MESSAGE);
  console.log("PASS outdated_abandoned_review_guidance");

  // AWAITING with no pending attempt → payment ended (priority over stale)
  const ended = resolveAbandonedCheckoutReviewGuidance({
    status: "AWAITING_GATEWAY_PAYMENT",
    updatedAt: now - CUSTOMER_PENDING_PURCHASES_MAX_AGE_MS - 1,
    pendingGatewayAttemptId: null,
    now,
  });
  assert.equal(ended?.kind, "payment_not_completed");
  assert.equal(ended?.body, CUSTOMER_ABANDONED_REVIEW_PAYMENT_ENDED_MESSAGE);
  console.log("PASS payment_not_completed_guidance");

  // Non-confirmable statuses → null (page redirects / 404 elsewhere)
  assert.equal(
    resolveAbandonedCheckoutReviewGuidance({
      status: "COMPLETED",
      updatedAt: 0,
      now,
    }),
    null
  );
  assert.equal(
    resolveAbandonedCheckoutReviewGuidance({
      status: "DRAFT",
      updatedAt: 0,
      now,
    }),
    null
  );
  console.log("PASS non_confirmable_statuses_skip_guidance");

  // Wiring: review page keeps security 404s; shows banner; keeps form for READY/AWAITING
  const reviewPage = read("app/account/esim/buy/review/page.tsx");
  const banner = read(
    "app/components/account/AbandonedCheckoutReviewGuidanceBanner.tsx"
  );
  const form = read("app/components/account/WalletPurchaseConfirmForm.tsx");
  const readSrc = read("app/lib/esim/walletPurchaseRead.ts");
  const messaging = read("app/lib/esim/customerPurchaseStatusMessaging.ts");

  assert.match(reviewPage, /if \(!purchaseId\) notFound\(\)/);
  assert.match(reviewPage, /if \(!review\) notFound\(\)/);
  assert.match(reviewPage, /if \(!review\.canConfirm\) notFound\(\)/);
  assert.match(reviewPage, /resolveAbandonedCheckoutReviewGuidance/);
  assert.match(reviewPage, /AbandonedCheckoutReviewGuidanceBanner/);
  assert.match(reviewPage, /WalletPurchaseConfirmForm/);
  assert.match(reviewPage, /AWAITING_GATEWAY_PAYMENT stays on checkout/);
  assert.match(banner, /href="\/account\/esim\/buy"/);
  assert.match(banner, /startNewPurchaseLabel/);
  assert.match(banner, /data-abandoned-review-guidance/);
  assert.match(form, /CUSTOMER_AWAITING_GATEWAY_INACTIVE_MESSAGE/);
  assert.match(form, /CUSTOMER_AWAITING_GATEWAY_ACTIVE_MESSAGE/);
  assert.match(form, /CUSTOMER_ABANDONED_REVIEW_START_NEW_LABEL/);
  assert.match(form, /CUSTOMER_AWAITING_GATEWAY_CANCEL_LABEL/);
  assert.match(messaging, /No active mobile payment is in progress/);
  assert.match(messaging, /Mobile payment is still pending/);
  assert.match(messaging, /Start a new purchase/);
  assert.match(readSrc, /updatedAt:\s*row\.updatedAt/);
  assert.match(messaging, /resolveAbandonedCheckoutReviewGuidance/);
  assert.doesNotMatch(reviewPage, /confirmWalletEsimPurchaseAction|maybeReleasePending/);
  assert.doesNotMatch(banner, /prisma|walletPurchaseActions/);
  console.log("PASS abandoned_review_ux_wiring");

  console.log("OK qa-abandoned-checkout-review-ux");
}

main();
