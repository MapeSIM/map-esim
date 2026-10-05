/**
 * Offline QA: abandoned-checkout review UX for stale / terminal cases.
 * Display guidance only — no payment, wallet, or auth behavior changes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CUSTOMER_ABANDONED_REVIEW_DRAFT_MESSAGE,
  CUSTOMER_ABANDONED_REVIEW_NON_CONFIRMABLE_MESSAGE,
  CUSTOMER_ABANDONED_REVIEW_OUTDATED_MESSAGE,
  CUSTOMER_ABANDONED_REVIEW_PAYMENT_ENDED_MESSAGE,
  CUSTOMER_ABANDONED_REVIEW_START_NEW_LABEL,
  CUSTOMER_PENDING_PURCHASES_MAX_AGE_MS,
  CUSTOMER_STALE_CHECKOUT_DISPLAY_MS,
  CUSTOMER_STALE_CHECKOUT_MESSAGE,
  resolveAbandonedCheckoutNonConfirmableGuidance,
  resolveAbandonedCheckoutReviewGuidance,
} from "../app/lib/esim/customerPurchaseStatusMessaging";
import { coalesceAbandonedCheckoutCandidatesByCustomer } from "../app/lib/esim/abandonedCheckoutRecoveryShared";

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

  // Non-confirmable statuses → guidance resolver returns null (page shows panel / redirects)
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
  console.log("PASS non_confirmable_statuses_skip_stale_guidance");

  const draft = resolveAbandonedCheckoutNonConfirmableGuidance("DRAFT");
  assert.equal(draft.kind, "draft");
  assert.equal(draft.body, CUSTOMER_ABANDONED_REVIEW_DRAFT_MESSAGE);
  assert.equal(draft.startNewPurchaseLabel, CUSTOMER_ABANDONED_REVIEW_START_NEW_LABEL);

  const unavailable = resolveAbandonedCheckoutNonConfirmableGuidance("UNKNOWN");
  assert.equal(unavailable.kind, "unavailable");
  assert.equal(
    unavailable.body,
    CUSTOMER_ABANDONED_REVIEW_NON_CONFIRMABLE_MESSAGE
  );
  console.log("PASS non_confirmable_owned_review_guidance");

  // Wiring: review page keeps security 404s; shows banner; keeps form for READY/AWAITING
  const reviewPage = read("app/account/esim/buy/review/page.tsx");
  const banner = read(
    "app/components/account/AbandonedCheckoutReviewGuidanceBanner.tsx"
  );
  const nonConfirmablePanel = read(
    "app/components/account/AbandonedCheckoutNonConfirmablePanel.tsx"
  );
  const form = read("app/components/account/WalletPurchaseConfirmForm.tsx");
  const readSrc = read("app/lib/esim/walletPurchaseRead.ts");
  const messaging = read("app/lib/esim/customerPurchaseStatusMessaging.ts");

  assert.match(reviewPage, /if \(!purchaseId\) notFound\(\)/);
  assert.match(reviewPage, /if \(!review\) notFound\(\)/);
  assert.doesNotMatch(reviewPage, /if \(!review\.canConfirm\) notFound\(\)/);
  assert.match(reviewPage, /resolveAbandonedCheckoutNonConfirmableGuidance/);
  assert.match(reviewPage, /AbandonedCheckoutNonConfirmablePanel/);
  assert.match(reviewPage, /resolveAbandonedCheckoutReviewGuidance/);
  assert.match(reviewPage, /AbandonedCheckoutReviewGuidanceBanner/);
  assert.match(reviewPage, /WalletPurchaseConfirmForm/);
  assert.match(reviewPage, /AWAITING_GATEWAY_PAYMENT stays on checkout/);
  assert.match(banner, /href="\/account\/esim\/buy"/);
  assert.match(banner, /startNewPurchaseLabel/);
  assert.match(banner, /data-abandoned-review-guidance/);
  assert.match(nonConfirmablePanel, /data-abandoned-review-non-confirmable/);
  assert.match(nonConfirmablePanel, /href="\/account\/esim\/buy"/);
  assert.match(nonConfirmablePanel, /startNewPurchaseLabel/);
  assert.match(form, /CUSTOMER_AWAITING_GATEWAY_INACTIVE_MESSAGE/);
  assert.match(form, /CUSTOMER_AWAITING_GATEWAY_ACTIVE_MESSAGE/);
  assert.match(form, /CUSTOMER_ABANDONED_REVIEW_START_NEW_LABEL/);
  assert.match(form, /CUSTOMER_AWAITING_GATEWAY_CANCEL_LABEL/);
  assert.match(messaging, /No active mobile payment is in progress/);
  assert.match(messaging, /Mobile payment is still pending/);
  assert.match(messaging, /Start a new purchase/);
  assert.match(messaging, /CUSTOMER_ABANDONED_REVIEW_DRAFT_MESSAGE/);
  assert.match(readSrc, /updatedAt:\s*row\.updatedAt/);
  assert.match(messaging, /resolveAbandonedCheckoutReviewGuidance/);
  assert.match(messaging, /resolveAbandonedCheckoutNonConfirmableGuidance/);
  assert.doesNotMatch(reviewPage, /confirmWalletEsimPurchaseAction|maybeReleasePending/);
  assert.doesNotMatch(banner, /prisma|walletPurchaseActions/);
  assert.doesNotMatch(nonConfirmablePanel, /prisma|walletPurchaseActions/);
  console.log("PASS abandoned_review_ux_wiring");

  // Per-customer coalescing (recovery runner) — newest updatedAt wins.
  const older = new Date(now - 60_000);
  const newer = new Date(now - 30_000);
  const coalesced = coalesceAbandonedCheckoutCandidatesByCustomer([
    { id: "p_old", customerUserId: "cust_a", updatedAt: older },
    { id: "p_new", customerUserId: "cust_a", updatedAt: newer },
    { id: "p_other", customerUserId: "cust_b", updatedAt: older },
  ]);
  assert.equal(coalesced.length, 2);
  assert.equal(
    coalesced.find((r) => r.customerUserId === "cust_a")?.id,
    "p_new"
  );
  assert.equal(
    coalesced.find((r) => r.customerUserId === "cust_b")?.id,
    "p_other"
  );
  const runner = read("app/lib/esim/abandonedCheckoutRecoveryRunner.ts");
  assert.match(runner, /coalesceAbandonedCheckoutCandidatesByCustomer/);
  assert.match(runner, /coalescedSkipped/);
  assert.match(runner, /createdAt:\s*\{/);
  assert.match(runner, /lte:\s*idleBefore/);
  assert.match(runner, /gte:\s*notOlderThan/);
  const recoveryShared = read("app/lib/esim/abandonedCheckoutRecoveryShared.ts");
  assert.match(
    recoveryShared,
    /ABANDONED_CHECKOUT_IDLE_MS_DEFAULT\s*=\s*30\s*\*\s*60\s*\*\s*1000/
  );
  assert.match(
    recoveryShared,
    /ABANDONED_CHECKOUT_MAX_AGE_MS_DEFAULT\s*=\s*90\s*\*\s*60\s*\*\s*1000/
  );
  console.log("PASS abandoned_recovery_customer_coalesce");

  // Recovery email template + once-only claim + purchase resume deep-link
  const template = read("app/lib/email/abandonedCheckoutTemplate.ts");
  const notify = read("app/lib/esim/abandonedCheckoutNotification.ts");
  const claim = read("app/lib/esim/abandonedCheckoutEmailClaim.ts");
  const cron = read("app/api/cron/abandoned-checkout-recovery/route.ts");
  const sample = read("app/dev/email-preview/samples.ts");

  assert.match(template, /Complete Your Order/);
  assert.match(template, /Destination/);
  assert.match(template, /Plan/);
  assert.match(template, /resumeCheckoutUrl/);
  assert.match(notify, /customerPendingPurchaseHref/);
  assert.match(notify, /dataAllowance/);
  assert.match(notify, /validity/);
  assert.match(notify, /planParts\.join\(" · "\)/);
  assert.match(notify, /ABANDONED_CHECKOUT_EMAIL_SENT/);
  assert.match(claim, /already_sent/);
  assert.match(claim, /isAbandonedCheckoutEmailClaimable/);
  assert.match(claim, /ABANDONED_CHECKOUT_EMAIL_SENT/);
  assert.match(cron, /Not registered in vercel\.json/);
  assert.match(cron, /30 and 90 minutes/);
  assert.match(cron, /runAbandonedCheckoutRecovery/);
  assert.match(
    sample,
    /\/account\/esim\/buy\/review\?purchase=/
  );
  assert.doesNotMatch(sample, /\?resume=/);
  console.log("PASS abandoned_recovery_email_cta_and_resume");

  console.log("OK qa-abandoned-checkout-review-ux");
}

main();
