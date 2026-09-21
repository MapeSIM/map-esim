/**
 * Offline QA for Admin Email Center UX (display/filter only).
 * Asserts no delivery-logic regression and safer resend wording.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMAIL_CENTER_CATEGORIES,
  EMAIL_CENTER_RESEND_BUTTON_LABEL,
  EMAIL_CENTER_RESEND_SAFE_HINT,
  buildAdminEmailCenterHref,
  emailCenterCategoryForKind,
  emailCenterRowMatchesSearch,
  emailCenterStatusBucket,
  parseEmailCenterCategory,
  parseEmailCenterTab,
  summarizeEmailCenterRows,
} from "../app/lib/admin/emailCenterShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(existsSync(join(root, "app/admin/emails/page.tsx")));
  assert.ok(existsSync(join(root, "app/lib/admin/emailCenter.ts")));
  assert.ok(existsSync(join(root, "app/lib/admin/emailCenterShared.ts")));
  assert.ok(existsSync(join(root, "app/lib/admin/emailCenterRetry.ts")));
  assert.ok(
    existsSync(join(root, "app/components/admin/EmailCenterRetryButton.tsx"))
  );

  const page = read("app/admin/emails/page.tsx");
  const service = read("app/lib/admin/emailCenter.ts");
  const shared = read("app/lib/admin/emailCenterShared.ts");
  const retry = read("app/lib/admin/emailCenterRetry.ts");
  const retryBtn = read("app/components/admin/EmailCenterRetryButton.tsx");
  const actions = read("app/lib/admin/emailCenterActions.ts");
  const nav = read("app/components/admin/AdminNav.tsx");
  const access = read("app/lib/admin/adminPageAccess.ts");
  const pkg = read("package.json");

  assert.match(page, /getAdminEmailCenterPage/);
  assert.match(page, /data-email-center-summary/);
  assert.match(page, /data-email-center-filters/);
  assert.match(page, /data-email-center-detail/);
  assert.match(page, /label="Sent"/);
  assert.match(page, /label="Failed"/);
  assert.match(page, /label="Pending"/);
  assert.match(page, /name="q"/);
  assert.match(page, /name="category"/);
  assert.match(page, /Email type/);
  assert.match(page, /Order \/ reference/);
  assert.match(page, /EMAIL_CENTER_RESEND_SAFE_HINT|Safe retry only/);
  assert.match(nav, /\/admin\/emails/);
  assert.match(access, /SUPPORT_EMAILS/);
  console.log("PASS email_center_ux_page");

  assert.equal(parseEmailCenterTab("failed"), "failed");
  assert.equal(parseEmailCenterCategory("refunds"), "refunds");
  assert.equal(emailCenterCategoryForKind("wallet_transaction"), "wallet");
  assert.equal(emailCenterStatusBucket("sent"), "sent");
  assert.equal(emailCenterStatusBucket("failed"), "failed");
  assert.equal(emailCenterStatusBucket("sending"), "pending");
  assert.deepEqual(
    summarizeEmailCenterRows([
      { deliveryStatus: "sent" },
      { deliveryStatus: "failed" },
      { deliveryStatus: "sending" },
    ]),
    { sent: 1, failed: 1, pending: 1 }
  );
  assert.equal(
    buildAdminEmailCenterHref({
      tab: "failed",
      category: "orders",
      q: "install",
    }),
    "/admin/emails?tab=failed&category=orders&q=install"
  );
  assert.equal(
    emailCenterRowMatchesSearch(
      {
        kindLabel: "eSIM install / QR",
        actionLabel: "eSIM install / QR",
        targetType: "WalletEsimPurchase",
        targetId: "abc123",
        emailEvent: null,
        orderId: "ord999",
        recipientSearchText: "WalletEsimPurchase abc123",
        deliveryStatusLabel: "Failed",
        failureReason: null,
      },
      "ord999"
    ),
    true
  );
  assert.deepEqual([...EMAIL_CENTER_CATEGORIES], [
    "all",
    "orders",
    "payments",
    "refunds",
    "wallet",
    "other",
  ]);
  console.log("PASS email_center_shared_helpers");

  assert.match(service, /listAdminEmailCenter/);
  assert.match(service, /getAdminEmailCenterPage/);
  assert.match(service, /summarizeEmailCenterRows/);
  assert.doesNotMatch(service, /nodemailer|createTransport|sendMail/);
  assert.doesNotMatch(service, /refundReservedFunds|markPaid|balanceCents/);
  assert.match(retry, /retryAdminEmailCenterSend/);
  assert.doesNotMatch(retry, /balanceCents|refundReservedFunds|markPaid/);
  assert.match(actions, /SUPPORT_EMAILS/);
  assert.match(actions, /retryAdminEmailCenterSend/);
  assert.match(retryBtn, /EMAIL_CENTER_RESEND_BUTTON_LABEL/);
  assert.match(retryBtn, /EMAIL_CENTER_RESEND_SAFE_HINT/);
  assert.equal(EMAIL_CENTER_RESEND_BUTTON_LABEL, "Try sending again");
  assert.match(EMAIL_CENTER_RESEND_SAFE_HINT, /does not move money/i);
  assert.doesNotMatch(retryBtn, />Retry Send</);
  console.log("PASS delivery_logic_unchanged_safer_resend_wording");

  assert.match(pkg, /qa:admin-email-center/);
  console.log("PASS package_script");

  console.log("ALL_QA_PASSED=admin-email-center");
}

main();
