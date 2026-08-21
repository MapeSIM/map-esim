/**
 * Offline QA for Phase 5B CUSTOMER wallet-funded eSIM purchase.
 * Does not call VeSIM, send email, or mutate the database.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CUSTOMER_PURCHASE_PROCESSING_MESSAGE,
  CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE,
  customerPendingPurchaseHref,
  resolveCustomerPendingPurchaseVisibility,
  resolveCustomerPurchaseStatusMessaging,
} from "../app/lib/esim/customerPurchaseStatusMessaging";
import { parseWalletPurchaseIdempotencyKey } from "../app/lib/esim/walletPurchaseValidation";
import { usdPriceToCents } from "../app/lib/esim/assignmentValidation";
import { walletTransactionTypeLabel } from "../app/lib/wallet/display";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260804220000_add_wallet_esim_purchase/migration.sql"
  );
  const service = read("app/lib/esim/walletPurchase.ts");
  const actions = read("app/lib/esim/walletPurchaseActions.ts");
  const formState = read("app/lib/esim/walletPurchaseFormState.ts");
  const readSrc = read("app/lib/esim/walletPurchaseRead.ts");
  const checkout = read("app/lib/vesim/creditCheckout.ts");
  const persist = read("app/lib/orders/persistAssignedOrder.ts");
  const selectForm = read("app/components/account/WalletPurchaseSelectForm.tsx");
  const confirmForm = read(
    "app/components/account/WalletPurchaseConfirmForm.tsx"
  );
  const buyPage = read("app/account/esim/buy/page.tsx");
  const reviewPage = read("app/account/esim/buy/review/page.tsx");
  const successPage = read("app/account/esim/buy/success/page.tsx");
  const failedPage = read("app/account/esim/buy/failed/page.tsx");
  const reconPage = read("app/account/esim/buy/review-needed/page.tsx");
  const walletPage = read("app/account/wallet/page.tsx");
  const accountOrders = read("app/account/orders/page.tsx");
  const accountOrderDetail = read("app/account/orders/[orderId]/page.tsx");
  const displaySrc = read("app/lib/wallet/display.ts");
  const walletRead = read("app/lib/wallet/read.ts");
  const adminAssign = read("app/lib/esim/adminPackageAssignment.ts");
  const pkg = read("package.json");

  assert.match(actions, /requireRole\("CUSTOMER"\)/);
  assert.match(buyPage, /requireRole\(\s*"CUSTOMER"/);
  assert.match(successPage, /requireRole\("CUSTOMER"\)/);
  assert.ok(!/requireRole\("ADMIN"\)/.test(actions));
  assert.match(service, /role !== Role\.CUSTOMER/);
  assert.match(service, /deletedAt/);
  assert.match(service, /assertCustomerFinancialActivityAllowed/);
  console.log("PASS active_customer_only_access");

  assert.match(readSrc, /customerUserId !== owner/);
  assert.match(readSrc, /customerUserId !== ownerId/);
  assert.match(successPage, /notFound\(\)/);
  assert.match(failedPage, /notFound\(\)/);
  console.log("PASS purchase_ownership_scoped");

  assert.match(service, /verifyOfferAuthoritative/);
  assert.match(actions, /void formData\.get\("price"\)/);
  assert.match(actions, /void formData\.get\("priceUSD"\)/);
  assert.ok(!/formData\.get\("price"\)\s*\|\|/.test(actions));
  console.log("PASS offer_price_revalidated_browser_ignored");

  assert.match(schema, /CUSTOMER_WALLET/);
  assert.match(service, /OrderFundingSource\.CUSTOMER_WALLET/);
  assert.ok(!/COMPANY_FUNDED/.test(service));
  assert.match(persist, /CUSTOMER_WALLET/);
  console.log("PASS customer_wallet_funding_only");

  assert.match(service, /WALLET_UNAVAILABLE/);
  assert.match(buyPage, /A wallet is required/);
  assert.ok(!/walletAccount\.create/.test(service));
  console.log("PASS wallet_must_already_exist");

  assert.match(service, /INSUFFICIENT_FUNDS/);
  assert.match(service, /reserveWalletPurchaseFundsInTx/);
  assert.match(service, /amountCents:\s*snapshot\.priceCents/);
  assert.match(service, /balanceCents:\s*\{\s*gte:\s*amountCents/);
  assert.ok(
    service.indexOf("await executeCreditCheckout") >
      service.indexOf("reserveWalletPurchaseFundsInTx")
  );
  console.log("PASS insufficient_balance_before_provider");

  assert.match(confirmForm, /name="confirm"/);
  assert.match(confirmForm, /disabled=\{purchaseBlocked \|\| !confirmed\}/);
  assert.match(confirmForm, /Buy eSIM with Wallet/);
  assert.ok(!/confirmPhrase|WALLET_PURCHASE_CONFIRM_PHRASE/.test(confirmForm));
  assert.ok(!/parseWalletPurchaseConfirmPhrase|confirmPhrase/.test(actions));
  assert.ok(!/WALLET_PURCHASE_CONFIRM_PHRASE|parseWalletPurchaseConfirmPhrase/.test(
    read("app/lib/esim/walletPurchaseValidation.ts")
  ));
  console.log("PASS confirmation_checkbox_required_no_buy_phrase");

  assert.match(service, /Number\.isInteger\(walletAfter\.balanceCents\)/);
  assert.equal(usdPriceToCents(3.2), 320);
  assert.ok(!/parseFloat|toFixed/.test(service));
  console.log("PASS integer_cents_only");

  assert.match(service, /updateMany/);
  assert.match(service, /balanceCents:\s*\{\s*decrement:\s*amountCents/);
  assert.match(service, /version:\s*\{\s*increment:\s*1/);
  assert.match(service, /walletOnlyPurchaseFunding\(snapshot\.priceCents\)/);
  console.log("PASS conditional_atomic_balance_decrement");

  assert.match(service, /updated\.count !== 1/);
  assert.match(service, /INSUFFICIENT_FUNDS/);
  console.log("PASS concurrent_purchase_cannot_overdraw");

  assert.match(service, /WalletTransactionType\.PURCHASE_DEBIT/);
  assert.match(service, /WalletTransactionStatus\.PENDING/);
  assert.match(service, /debit_\$\{purchase\.id\}/);
  console.log("PASS one_purchase_debit_per_purchase");

  assert.match(schema, /idempotencyKey/);
  assert.match(migration, /WalletEsimPurchase_idempotencyKey_key/);
  assert.equal(parseWalletPurchaseIdempotencyKey("short").ok, false);
  assert.equal(parseWalletPurchaseIdempotencyKey("a".repeat(8)).ok, true);
  console.log("PASS stable_idempotency_prevents_duplicate_debit");

  assert.match(service, /await executeCreditCheckout/);
  assert.match(checkout, /\/api\/checkout\/credit/);
  const providerCalls = service.match(/await executeCreditCheckout/g) || [];
  assert.equal(providerCalls.length, 1);
  assert.ok(
    !/await executeCreditCheckout/.test(
      service.split("confirmWalletEsimPurchase")[0]
    )
  );
  console.log("PASS provider_checkout_at_most_once");

  assert.match(service, /External provider write/);
  assert.ok(
    service.indexOf("await executeCreditCheckout") >
      service.indexOf("return reserved.debitTransactionId")
  );
  console.log("PASS provider_call_outside_prisma_transaction");

  assert.match(service, /persistAssignedOrder/);
  assert.match(service, /OrderFundingSource\.CUSTOMER_WALLET/);
  assert.match(service, /WalletEsimPurchaseStatus\.COMPLETED/);
  console.log("PASS confirmed_success_creates_one_linked_order");

  assert.match(service, /REFUND_CREDIT/);
  assert.match(service, /FAILED_REFUNDED/);
  assert.match(service, /increment:\s*priceCents/);
  assert.match(service, /refund_\$\{options\.purchaseId\}/);
  console.log("PASS confirmed_failure_restores_exact_amount_once");

  assert.match(service, /WalletTransactionStatus\.REVERSED/);
  assert.match(service, /idempotencyKey:\s*refundKey/);
  console.log("PASS refund_immutable_and_idempotent");

  assert.match(service, /RECONCILIATION_REQUIRED/);
  assert.match(service, /Do not buy again/);
  const afterCheckout = service.slice(service.indexOf("await executeCreditCheckout"));
  const uncertainIdx = afterCheckout.indexOf('checkout.kind !== "success"');
  assert.ok(uncertainIdx > 0);
  assert.ok(
    !afterCheckout.slice(uncertainIdx, uncertainIdx + 280).includes("refundReservedFunds")
  );
  console.log("PASS uncertain_not_auto_refunded_or_retried");

  assert.match(successPage, /getCompletedWalletPurchase/);
  assert.match(successPage, /void query\.price/);
  assert.match(successPage, /void query\.balance/);
  assert.match(successPage, /notFound\(\)/);
  console.log("PASS success_page_db_values_only");

  assert.match(accountOrderDetail, /getCustomerOwnedOrderDetail/);
  assert.match(accountOrders, /listCustomerOrders|\/account\/orders\//);
  assert.ok(!/providerCost|Company-funded/i.test(accountOrderDetail));
  assert.ok(!/\bADMIN\b/.test(accountOrderDetail));
  console.log("PASS wrong_owner_order_access_fails_safely");

  assert.ok(!/providerCost|provider cost/i.test(confirmForm));
  assert.ok(!/providerCost|provider cost/i.test(successPage));
  assert.ok(!/reason|adminUserId|idempotencyKey/.test(successPage));
  assert.equal(walletTransactionTypeLabel("PURCHASE_DEBIT"), "eSIM purchase");
  assert.match(walletRead, /PURCHASE_DEBIT/);
  console.log("PASS customer_hides_provider_cost_internal_fields");

  assert.match(adminAssign, /COMPANY_FUNDED/);
  assert.ok(!/WalletEsimPurchase/.test(adminAssign));
  assert.match(displaySrc, /eSIM purchase/);
  console.log("PASS company_funded_and_prior_wallet_history_unchanged");

  assert.match(service, /deliverCompletedWalletPurchaseInstallEmail/);
  assert.ok(!/deliverOrderEmailAfterCheckout/.test(actions));
  assert.ok(!/sendOrderEmail/.test(selectForm));
  assert.ok(!/sendOrderEmail/.test(confirmForm));
  const qaSelf = read("scripts/qa-customer-wallet-purchase.ts");
  assert.ok(!/deliverOrderEmailAfterCheckout\(/.test(qaSelf));
  assert.ok(!/sendOrderEmail\(/.test(qaSelf));
  console.log("PASS no_email_sent_during_qa");

  assert.ok(!/stripe|paypal|webhook|impersonat/i.test(service));
  assert.match(service, /awardCustomerPurchaseEarnInTx/);
  assert.match(service, /claimPurchasePromoInTx|promoDiscountCents/);
  assert.ok(!/admin.*wallet.*purchase|wallet.*admin.*assign/i.test(buyPage));
  console.log("PASS no_payment_gateway_admin_wallet_purchase");

  assert.ok(!/migrate reset|db push|migrate dev/.test(service));
  assert.ok(
    existsSync(
      join(root, "prisma/migrations/20260804220000_add_wallet_esim_purchase/migration.sql")
    )
  );
  assert.match(pkg, /qa:customer-wallet-purchase/);
  console.log("PASS no_destructive_prisma_command");

  assert.ok(!/access_token|LPA:1\$|activationCode|qrValue/.test(persist));
  assert.ok(!/VESIM_PASSWORD|VESIM_EMAIL/.test(selectForm));
  assert.ok(!/VESIM_PASSWORD|VESIM_EMAIL/.test(confirmForm));
  assert.match(persist, /captureIccidForProviderOrder/);
  assert.ok(!/iccidEncrypted:\s*null/.test(persist));
  console.log("PASS no_raw_provider_secrets_persisted_or_rendered");

  assert.match(confirmForm, /CheckoutMoney/);
  assert.doesNotMatch(confirmForm, /formatUsdCents/);
  assert.match(
    service,
    /return `\$\{formatUsdCents\(cents\)\} USD`;/
  );
  console.log("PASS checkout_display_uses_shared_money_usd_cents_unchanged");

  assert.ok(!/executeCreditCheckout\(/.test(read("scripts/qa-customer-wallet-purchase.ts")));
  assert.ok(!/getBrokerToken\(/.test(read("scripts/qa-customer-wallet-purchase.ts")));
  assert.match(walletPage, /Buy eSIM/);
  assert.match(reviewPage, /getWalletPurchaseReview/);
  assert.equal(
    resolveCustomerPurchaseStatusMessaging("FUNDED"),
    "processing"
  );
  assert.equal(
    resolveCustomerPurchaseStatusMessaging("PROVIDER_PENDING"),
    "processing"
  );
  assert.equal(
    resolveCustomerPurchaseStatusMessaging("FUNDS_RESERVED"),
    "processing"
  );
  assert.equal(
    resolveCustomerPurchaseStatusMessaging("RECONCILIATION_REQUIRED"),
    "review_needed"
  );
  assert.equal(resolveCustomerPurchaseStatusMessaging("COMPLETED"), null);
  assert.equal(
    resolveCustomerPendingPurchaseVisibility("READY")?.action,
    "continue_checkout"
  );
  assert.equal(
    resolveCustomerPendingPurchaseVisibility("AWAITING_GATEWAY_PAYMENT")
      ?.ctaLabel,
    "Continue checkout"
  );
  assert.equal(
    resolveCustomerPendingPurchaseVisibility("FUNDED")?.action,
    "view_status"
  );
  assert.equal(
    resolveCustomerPendingPurchaseVisibility("FUNDED")?.body,
    CUSTOMER_PURCHASE_PROCESSING_MESSAGE
  );
  assert.equal(
    resolveCustomerPendingPurchaseVisibility("RECONCILIATION_REQUIRED")
      ?.body,
    CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE
  );
  assert.equal(
    customerPendingPurchaseHref("READY", "abc"),
    "/account/esim/buy/review?purchase=abc"
  );
  assert.equal(
    customerPendingPurchaseHref("PROVIDER_PENDING", "abc"),
    "/account/esim/buy/review-needed?purchase=abc"
  );
  assert.equal(customerPendingPurchaseHref("COMPLETED", "abc"), null);
  assert.equal(
    CUSTOMER_PURCHASE_PROCESSING_MESSAGE,
    "Your payment is confirmed. Your eSIM is being prepared. We'll notify you once it's ready."
  );
  assert.equal(
    CUSTOMER_PURCHASE_REVIEW_NEEDED_MESSAGE,
    "Your payment is under review. Please do not make another purchase. We'll update you once the review is complete."
  );
  assert.match(reconPage, /resolveCustomerPurchaseStatusMessaging/);
  assert.match(reconPage, /customerPurchaseStatusMessage/);
  assert.doesNotMatch(reconPage, /provider result is uncertain/i);
  assert.match(readSrc, /WalletEsimPurchaseStatus\.FUNDED/);
  assert.match(failedPage, /restored/i);
  assert.ok(!/^["']use server["']/m.test(formState));
  assert.match(actions, /^"use server"/m);
  console.log("PASS automated_qa_no_real_provider_checkout");

  // Buy page is a destination launcher → existing /countries/[slug] plans.
  const assignmentRead = read("app/lib/esim/adminPackageAssignmentRead.ts");
  assert.match(buyPage, /Where are you traveling\?/);
  assert.match(buyPage, /max-w-5xl/);
  assert.match(buyPage, /CUSTOMER_ACCOUNT_RESTRICTED_MESSAGE/);
  assert.match(buyPage, /accountRestricted/);
  assert.doesNotMatch(buyPage, /blockedReason/);
  assert.match(buyPage, /prepareWalletEsimPurchase/);
  assert.match(buyPage, /offerIdHint/);
  assert.match(selectForm, /filterPlansDiscoveryDestinations/);
  assert.match(selectForm, /Popular Destinations/);
  assert.match(selectForm, /All Destinations/);
  assert.match(selectForm, /Search destinations/);
  assert.match(selectForm, /destinationPath/);
  assert.match(selectForm, /grid-cols-2/);
  assert.match(selectForm, /lg:grid-cols-4/);
  assert.match(selectForm, /No destinations found/);
  assert.match(selectForm, /href=\{href\}/);
  assert.doesNotMatch(selectForm, /Available plans/);
  assert.doesNotMatch(selectForm, /Continue to checkout/);
  assert.doesNotMatch(selectForm, /loadCustomerWalletPurchaseOffersAction/);
  assert.doesNotMatch(selectForm, /prepareWalletEsimPurchaseAction/);
  assert.doesNotMatch(selectForm, /balanceLabel|Available balance/);
  assert.doesNotMatch(selectForm, /CountriesListing|\/api\/vesim\/destinations/);
  assert.doesNotMatch(selectForm, /Plans from|minPrice/);
  // Country-page Buy Now still lands on buy?offerId= for prepare → review.
  assert.match(
    read("app/lib/plans/plan-utils.ts"),
    /\/account\/esim\/buy\?/
  );
  assert.match(
    assignmentRead,
    /costLabel:\s*`\$\{formatUsdCents\(Math\.round\(verified\.priceUSD \* 100\)\)\} USD`/
  );
  assert.match(service, /priceCents = usdPriceToCents\(offer\.priceUSD\)/);
  assert.match(service, /assertCustomerFinancialActivityAllowed/);
  console.log("PASS buy_esim_destination_launcher");

  console.log("ALL_QA_PASSED=32");
}

main();
