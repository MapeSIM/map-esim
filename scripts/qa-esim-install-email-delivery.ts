/**
 * Offline QA: unified post-fulfillment MAP eSIM QR/install email delivery (P1A).
 * Does not call SMTP, VeSIM, or mutate any database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyAutomaticInstallEmailStatus,
} from "../app/lib/esim/esimPurchaseInstallEmailStatus";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const helper = read("app/lib/esim/esimPurchaseInstallEmail.ts");
  const statusSrc = read("app/lib/esim/esimPurchaseInstallEmailStatus.ts");
  const wallet = read("app/lib/esim/walletPurchase.ts");
  const apply = read("app/lib/esim/esimPurchasePaymentApply.ts");
  const localFinalize = read(
    "app/lib/admin/reconciliationLocalFinalization.ts"
  );
  const credit = read("app/lib/vesim/creditCheckout.ts");
  const resend = read("app/lib/admin/reconciliationEmailResend.ts");
  const eligibility = read("app/lib/admin/reconciliationCaseShared.ts");
  const orders = read("app/lib/orders/customerOrders.ts");
  const billing = read("app/lib/email/sendBillingEmail.ts");
  const security = read("app/lib/email/sendSecurityNoticeEmail.ts");
  const pkg = read("package.json");

  assert.equal(classifyAutomaticInstallEmailStatus(null), "claim");
  assert.equal(classifyAutomaticInstallEmailStatus(""), "claim");
  assert.equal(
    classifyAutomaticInstallEmailStatus("skipped_no_install_details"),
    "claim"
  );
  assert.equal(classifyAutomaticInstallEmailStatus("sent"), "skip_sent");
  assert.equal(
    classifyAutomaticInstallEmailStatus("already_sent"),
    "skip_sent"
  );
  assert.equal(
    classifyAutomaticInstallEmailStatus("sending"),
    "uncertain_sending"
  );
  assert.equal(
    classifyAutomaticInstallEmailStatus("failed"),
    "skip_failed_for_admin"
  );
  assert.equal(
    classifyAutomaticInstallEmailStatus("not_configured"),
    "skip_failed_for_admin"
  );
  assert.equal(
    classifyAutomaticInstallEmailStatus("invalid_email"),
    "skip_failed_for_admin"
  );
  assert.equal(classifyAutomaticInstallEmailStatus("mystery"), "skip_other");
  assert.match(statusSrc, /skipped_no_install_details/);
  assert.match(statusSrc, /uncertain_sending/);
  console.log("PASS automatic_status_machine");

  assert.match(helper, /deliverCompletedWalletPurchaseInstallEmail/);
  assert.match(helper, /emailDeliveryStatus:\s*"sending"/);
  assert.match(
    helper,
    /OR:\s*\[[\s\S]*emailDeliveryStatus:\s*null[\s\S]*skipped_no_install_details/
  );
  const helperCas = helper.slice(
    helper.indexOf("const claimed = await prisma.walletEsimPurchase.updateMany"),
    helper.indexOf("if (claimed.count !== 1)")
  );
  assert.match(helperCas, /emailDeliveryStatus:\s*null/);
  assert.match(helperCas, /skipped_no_install_details/);
  assert.doesNotMatch(helperCas, /not_configured/);
  assert.match(helper, /customerEmail:\s*true/);
  assert.match(helper, /alternateDeliveryEmail/);
  assert.match(helper, /resolveFrozenInstallDeliveryEmail/);
  assert.match(helper, /customerEmail:\s*frozenEmail/);
  assert.match(helper, /deliverOrderEmailAfterCheckout/);
  assert.doesNotMatch(helper, /executeCreditCheckout\(/);
  assert.doesNotMatch(helper, /refundReservedFunds\(|debitWallet\(|creditWallet\(/);
  assert.doesNotMatch(helper, /balanceCents:\s*\{/);
  assert.doesNotMatch(helper, /walletTransaction\.create/);
  assert.doesNotMatch(helper, /\/api\/checkout\/credit/);
  assert.doesNotMatch(helper, /orders@mapesim\.com/);
  assert.doesNotMatch(
    helper,
    /status:\s*WalletEsimPurchaseStatus\.(FAILED_REFUNDED|RECONCILIATION_REQUIRED)/
  );
  assert.match(helper, /WALLET_DELIVERY_EMAIL_FAILED/);
  assert.match(helper, /sending_in_progress/);
  assert.match(helper, /schedulePaymentReceivedPendingNotification/);
  assert.match(
    helper,
    /skipped_no_install_details[\s\S]{0,180}schedulePaymentReceivedPendingNotification/
  );
  console.log("PASS helper_cas_frozen_email_no_financial_mutation");

  const walletCheckoutCount = (wallet.match(/executeCreditCheckout\(/g) || [])
    .length;
  assert.equal(walletCheckoutCount, 1);
  assert.match(wallet, /deliverCompletedWalletPurchaseInstallEmail/);
  assert.equal(
    (wallet.match(/deliverCompletedWalletPurchaseInstallEmail\(/g) || [])
      .length,
    2
  );
  assert.ok(
    wallet.indexOf("persistAssignedOrder") <
      wallet.lastIndexOf("deliverCompletedWalletPurchaseInstallEmail")
  );
  assert.match(
    wallet,
    /status === WalletEsimPurchaseStatus\.COMPLETED[\s\S]{0,280}deliverCompletedWalletPurchaseInstallEmail/
  );
  assert.match(wallet, /if \(orderId\) \{\s*await deliverCompletedWalletPurchaseInstallEmail/);
  assert.doesNotMatch(wallet, /deliverOrderEmailAfterCheckout/);
  console.log("PASS full_wallet_one_install_email_after_persist");

  assert.match(apply, /deliverCompletedWalletPurchaseInstallEmail/);
  assert.match(apply, /deliverFundedPurchaseInstallEmail/);
  assert.equal((apply.match(/executeCreditCheckout\(/g) || []).length, 1);
  assert.ok(
    apply.indexOf("persistAssignedOrder") <
      apply.lastIndexOf("deliverFundedPurchaseInstallEmail")
  );
  assert.match(
    apply,
    /COMPLETED &&[\s\S]{0,80}purchase\.orderId[\s\S]{0,160}deliverFundedPurchaseInstallEmail/
  );
  assert.doesNotMatch(apply, /deliverOrderEmailAfterCheckout/);
  assert.match(apply, /schedulePaymentReceivedPendingNotification/);
  assert.match(apply, /fulfillFundedEsimPurchaseAfterPayment/);
  console.log("PASS gateway_split_one_install_email_after_persist");

  assert.match(localFinalize, /deliverCompletedWalletPurchaseInstallEmail/);
  assert.ok(
    localFinalize.lastIndexOf("persistAssignedOrder") <
      localFinalize.lastIndexOf("deliverCompletedWalletPurchaseInstallEmail")
  );
  assert.match(
    localFinalize,
    /if \(ids\.sourceType === "wallet_purchase"\) \{\s*try \{\s*await deliverCompletedWalletPurchaseInstallEmail/
  );
  assert.doesNotMatch(localFinalize, /executeCreditCheckout/);
  assert.doesNotMatch(localFinalize, /\/api\/checkout\/credit/);
  assert.doesNotMatch(localFinalize, /sendOrderEmail|deliverOrderEmailAfterCheckout/);
  assert.doesNotMatch(localFinalize, /walletTransaction\.create/);
  console.log("PASS local_finalization_wallet_only_install_email");

  assert.match(
    credit,
    /export const VESIM_PROVIDER_CUSTOMER_EMAIL = "orders@mapesim\.com"/
  );
  assert.match(credit, /customerEmail:\s*VESIM_PROVIDER_CUSTOMER_EMAIL/);
  console.log("PASS vesim_payload_still_orders_inbox");

  assert.match(orders, /userId:\s*id/);
  assert.match(orders, /userId:\s*owner\.id/);
  assert.doesNotMatch(orders, /where:\s*\{\s*customerEmail/);
  console.log("PASS my_esims_by_user_not_email");

  const resendFn = resend.slice(
    resend.indexOf("export async function resendReconciliationEmail")
  );
  const eligIdx = resendFn.indexOf(
    "const eligibility = await getEmailResendEligibility"
  );
  const genericIdx = resendFn.indexOf("if (!eligibility?.allowed)");
  assert.ok(eligIdx >= 0 && genericIdx > eligIdx);
  const smtpOffLive = resendFn.slice(eligIdx, genericIdx);
  assert.match(smtpOffLive, /!isEmailConfigured\("orders"\)/);
  assert.doesNotMatch(smtpOffLive, /reason:\s*reasonParsed/);
  assert.match(
    resend,
    /emailDeliveryStatus:\s*\{\s*in:\s*\["failed",\s*"not_configured"\]/
  );
  assert.match(resend, /resolveFrozenInstallDeliveryEmail/);
  assert.match(resend, /alternateDeliveryEmail/);
  assert.doesNotMatch(resend, /otp|codeHash|verifiedAt/i);
  assert.doesNotMatch(
    resend.slice(resend.indexOf("async function resendPurchaseOrderEmail")),
    /row\.customer\.email/
  );
  assert.match(
    eligibility,
    /emailStatus === "sending"[\s\S]{0,80}email_send_in_progress/
  );
  assert.match(eligibility, /CLEAR_STUCK_SEND_PHRASE/);
  assert.match(
    eligibility,
    /emailStatus !== "sending"[\s\S]{0,200}email_not_sending|email_not_sending/
  );
  console.log("PASS admin_resend_compatible_account_email_only");

  assert.doesNotMatch(billing, /qrValue|activationCode|LPA:1\$/);
  assert.doesNotMatch(security, /qrValue|activationCode|LPA:1\$/);
  assert.doesNotMatch(helper, /qrValue:|activationCode:|emailBody/);
  console.log("PASS no_qr_in_billing_security_or_audit_helper");

  const qaSelf = read("scripts/qa-esim-install-email-delivery.ts");
  assert.ok(!/sendOrderEmail\(/.test(qaSelf));
  assert.ok(!/executeCreditCheckout\(/.test(qaSelf));
  assert.match(pkg, /qa:esim-install-email-delivery/);
  console.log("PASS no_real_provider_or_email_calls");

  console.log("OK qa-esim-install-email-delivery");
}

main();
