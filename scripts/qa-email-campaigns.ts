/**
 * Offline QA for Admin Email Campaign broadcasts.
 * Does not send SMTP, mutate the database, or change transactional emails.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BRAND_EMAIL_COPYRIGHT,
  BRAND_EMAIL_TAGLINE,
  BRAND_NAME,
  BRAND_SITE_URL,
  BRAND_SUPPORT_EMAIL,
} from "../app/lib/brand";
import {
  campaignCanContinueBulkSend,
  campaignCanResendFailed,
  campaignCanStartBulkSend,
  campaignConfirmPhraseMatches,
  campaignResendFailedPhraseMatches,
  EMAIL_CAMPAIGN_AUDIENCE_HELP,
  EMAIL_CAMPAIGN_AUDIENCES,
  EMAIL_CAMPAIGN_BATCH_DELAY_MS_DEFAULT,
  EMAIL_CAMPAIGN_BATCH_DELAY_MS_MAX,
  EMAIL_CAMPAIGN_BODY_MAX,
  EMAIL_CAMPAIGN_CHANNEL,
  EMAIL_CAMPAIGN_CONFIRM_PHRASE,
  EMAIL_CAMPAIGN_MAX_BATCHES_PER_RUN,
  EMAIL_CAMPAIGN_RESEND_FAILED_PHRASE,
  EMAIL_CAMPAIGN_SELECTABLE_TEMPLATES,
  EMAIL_CAMPAIGN_SEND_BATCH,
  EMAIL_CAMPAIGN_SUBJECT_MAX,
  EMAIL_CAMPAIGN_TEMPLATE_KEYS,
  EMAIL_CAMPAIGN_TEMPLATE_PRESETS,
  emailCampaignAudienceLabel,
  emailCampaignTemplateLabel,
  parseEmailCampaignAudience,
  parseEmailCampaignTemplateKey,
  parseEmailCampaignTestRecipient,
  resolveEmailCampaignBatchDelayMs,
  resolveEmailCampaignTestRecipient,
  sanitizeCampaignBody,
  sanitizeCampaignSubject,
} from "../app/lib/admin/emailCampaignShared";
import {
  renderCampaignEmailHtml,
  renderCampaignEmailText,
} from "../app/lib/email/campaignTemplate";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function assertFile(rel: string): string {
  const abs = join(root, rel);
  assert.equal(existsSync(abs), true, `missing ${rel}`);
  return read(rel);
}

function assertNoForbiddenImports(src: string, label: string): void {
  assert.doesNotMatch(src, /walletPurchase|PURCHASE_DEBIT|WalletAccount/, label);
  assert.doesNotMatch(src, /safepayAdapter|simpaisaAdapter|executeCreditCheckout/, label);
  assert.doesNotMatch(src, /vesim\/server|verifyOfferAuthoritative|createProviderOrder/, label);
  assert.doesNotMatch(src, /sendOrderEmail|renderOrderEmailHtml/, label);
  assert.doesNotMatch(src, /from ["']@\/app\/lib\/email\/sendSupportEmail["']/, label);
}

function main() {
  const shared = assertFile("app/lib/admin/emailCampaignShared.ts");
  const service = assertFile("app/lib/admin/emailCampaigns.ts");
  const actions = assertFile("app/lib/admin/emailCampaignActions.ts");
  const template = assertFile("app/lib/email/campaignTemplate.ts");
  const nav = assertFile("app/components/admin/AdminNav.tsx");
  const form = assertFile("app/components/admin/EmailCampaignForm.tsx");
  const sendForms = assertFile("app/components/admin/EmailCampaignSendForms.tsx");
  const listPage = assertFile("app/admin/email-campaigns/page.tsx");
  const newPage = assertFile("app/admin/email-campaigns/new/page.tsx");
  const detailPage = assertFile("app/admin/email-campaigns/[id]/page.tsx");
  const schema = assertFile("prisma/schema.prisma");
  const migration = assertFile(
    "prisma/migrations/20260912180000_add_email_campaigns/migration.sql"
  );
  const templateKeyMigration = assertFile(
    "prisma/migrations/20260922190000_add_email_campaign_template_key/migration.sql"
  );
  const pkg = assertFile("package.json");
  const sendOrderEmail = assertFile("app/lib/email/sendOrderEmail.ts");
  const sendSupportEmail = assertFile("app/lib/email/sendSupportEmail.ts");
  const orderTemplate = assertFile("app/lib/email/template.ts");
  const walletPurchase = assertFile("app/lib/esim/walletPurchase.ts");
  const paymentAdapter = assertFile("app/lib/payments/safepayAdapter.ts");

  console.log("1) Shared safety constants");
  assert.deepEqual(EMAIL_CAMPAIGN_AUDIENCES, [
    "ALL_CUSTOMERS",
    "PURCHASED_CUSTOMERS",
    "ACTIVE_CUSTOMERS",
  ]);
  assert.equal(emailCampaignAudienceLabel("ALL_CUSTOMERS"), "All customers");
  assert.equal(
    emailCampaignAudienceLabel("PURCHASED_CUSTOMERS"),
    "Purchased customers"
  );
  assert.equal(emailCampaignAudienceLabel("ACTIVE_CUSTOMERS"), "Active customers");
  assert.match(EMAIL_CAMPAIGN_AUDIENCE_HELP.ALL_CUSTOMERS, /valid email/);
  assert.match(EMAIL_CAMPAIGN_AUDIENCE_HELP.PURCHASED_CUSTOMERS, /completed purchase/);
  assert.match(EMAIL_CAMPAIGN_AUDIENCE_HELP.ACTIVE_CUSTOMERS, /not blocked/);
  assert.equal(EMAIL_CAMPAIGN_CONFIRM_PHRASE, "SEND CUSTOMER CAMPAIGN");
  assert.equal(EMAIL_CAMPAIGN_RESEND_FAILED_PHRASE, "RESEND FAILED EMAILS");
  assert.equal(EMAIL_CAMPAIGN_CHANNEL, "support");
  assert.equal(EMAIL_CAMPAIGN_SUBJECT_MAX, 160);
  assert.equal(EMAIL_CAMPAIGN_BODY_MAX, 20_000);
  assert.equal(EMAIL_CAMPAIGN_SEND_BATCH, 20);
  assert.equal(EMAIL_CAMPAIGN_BATCH_DELAY_MS_DEFAULT, 2_000);
  assert.equal(EMAIL_CAMPAIGN_MAX_BATCHES_PER_RUN, 5);
  assert.equal(resolveEmailCampaignBatchDelayMs(undefined), 2_000);
  assert.equal(resolveEmailCampaignBatchDelayMs("1500"), 1500);
  assert.equal(resolveEmailCampaignBatchDelayMs("-1"), 2_000);
  assert.equal(resolveEmailCampaignBatchDelayMs("999999"), EMAIL_CAMPAIGN_BATCH_DELAY_MS_MAX);
  assert.equal(campaignConfirmPhraseMatches("SEND CUSTOMER CAMPAIGN"), true);
  assert.equal(campaignConfirmPhraseMatches(" send customer campaign "), false);
  assert.equal(campaignConfirmPhraseMatches("SEND"), false);
  assert.equal(campaignResendFailedPhraseMatches("RESEND FAILED EMAILS"), true);
  assert.equal(campaignResendFailedPhraseMatches("resend failed emails"), false);
  console.log("   ok");

  console.log("1b) EMAIL_TEST_RECIPIENT resolution (env preferred, secrets not logged)");
  assert.equal(parseEmailCampaignTestRecipient(undefined), null);
  assert.equal(parseEmailCampaignTestRecipient(""), null);
  assert.equal(parseEmailCampaignTestRecipient("not-an-email"), null);
  assert.equal(parseEmailCampaignTestRecipient("a@b"), null);
  assert.equal(parseEmailCampaignTestRecipient("list@map.esim,other@map.esim"), null);
  assert.equal(parseEmailCampaignTestRecipient("test@example.com"), null);
  assert.equal(parseEmailCampaignTestRecipient("qa@foo.example"), null);
  assert.equal(
    parseEmailCampaignTestRecipient(" QA.Inbox+campaign@Map-eSIM.test "),
    "qa.inbox+campaign@map-esim.test"
  );
  assert.equal(
    resolveEmailCampaignTestRecipient({
      envValue: "env-inbox@map-esim.test",
      formValue: "form-inbox@map-esim.test",
    }),
    "env-inbox@map-esim.test"
  );
  assert.equal(
    resolveEmailCampaignTestRecipient({
      envValue: "bad",
      formValue: "form-inbox@map-esim.test",
    }),
    "form-inbox@map-esim.test"
  );
  assert.equal(
    resolveEmailCampaignTestRecipient({
      envValue: "placeholder@example.com",
      formValue: "form-inbox@map-esim.test",
    }),
    "form-inbox@map-esim.test"
  );
  assert.equal(
    resolveEmailCampaignTestRecipient({
      envValue: undefined,
      formValue: "form-inbox@map-esim.test",
    }),
    "form-inbox@map-esim.test"
  );
  assert.equal(
    resolveEmailCampaignTestRecipient({
      envValue: "  ",
      formValue: "  ",
      fallbackEmail: "fallback@map-esim.test",
    }),
    "fallback@map-esim.test"
  );
  assert.equal(
    resolveEmailCampaignTestRecipient({
      envValue: "  ",
      formValue: "  ",
    }),
    null
  );
  assert.equal(shared.includes("EMAIL_TEST_RECIPIENT"), true);
  assert.doesNotMatch(shared, /process\.env\.EMAIL_TEST_RECIPIENT/);
  assert.match(service, /resolveEmailCampaignTestRecipient/);
  assert.match(service, /process\.env\.EMAIL_TEST_RECIPIENT/);
  assert.match(service, /sendAdminEmailCampaignTest/);
  assert.match(detailPage, /parseEmailCampaignTestRecipient/);
  assert.match(detailPage, /process\.env\.EMAIL_TEST_RECIPIENT/);
  assert.match(detailPage, /lockedToEnvRecipient/);
  assert.match(sendForms, /lockedToEnvRecipient/);
  assert.match(sendForms, /readOnly=\{lockedToEnvRecipient\}/);
  // Bulk send path must not redirect to the test recipient.
  const bulkFnStart = service.indexOf(
    "export async function sendAdminEmailCampaignBulk"
  );
  assert.ok(bulkFnStart >= 0, "sendAdminEmailCampaignBulk missing");
  const bulkFnNext = service.indexOf("\nexport async function", bulkFnStart + 1);
  const bulkFnSrc = service.slice(
    bulkFnStart,
    bulkFnNext > 0 ? bulkFnNext : undefined
  );
  assert.doesNotMatch(bulkFnSrc, /EMAIL_TEST_RECIPIENT/);
  assert.doesNotMatch(bulkFnSrc, /resolveEmailCampaignTestRecipient/);
  assert.doesNotMatch(actions, /console\.(log|info|debug|warn|error)\([^)]*EMAIL_TEST/);
  assert.doesNotMatch(service, /console\.(log|info|debug|warn|error)\([^)]*EMAIL_TEST/);
  assert.doesNotMatch(detailPage, /console\.(log|info|debug|warn|error)\([^)]*EMAIL_TEST/);
  console.log("   ok");

  console.log("1c) Bulk-send gates unchanged");
  assert.equal(campaignCanStartBulkSend("DRAFT"), true);
  assert.equal(campaignCanStartBulkSend("TEST_SENT"), true);
  assert.equal(campaignCanStartBulkSend("SENDING"), false);
  assert.equal(campaignCanContinueBulkSend("SENDING"), true);
  assert.equal(campaignCanContinueBulkSend("DRAFT"), false);
  assert.equal(campaignCanResendFailed("SENT", 3), true);
  assert.equal(campaignCanResendFailed("FAILED", 1), true);
  assert.equal(campaignCanResendFailed("SENT", 0), false);
  assert.equal(campaignCanResendFailed("SENDING", 5), false);
  assert.equal(campaignCanResendFailed("DRAFT", 2), false);
  assert.equal(parseEmailCampaignAudience("all_customers"), "ALL_CUSTOMERS");
  assert.equal(parseEmailCampaignAudience("admins"), null);
  assert.equal(sanitizeCampaignSubject("  Hello\nWorld  "), "Hello World");
  assert.equal(
    sanitizeCampaignSubject("x".repeat(EMAIL_CAMPAIGN_SUBJECT_MAX + 20)).length,
    EMAIL_CAMPAIGN_SUBJECT_MAX
  );
  assert.equal(sanitizeCampaignBody("Line 1\r\nLine 2"), "Line 1\nLine 2");
  console.log("   ok");

  console.log("2) Branded preview escapes admin content");
  const html = renderCampaignEmailHtml({
    subject: 'Launch <script>alert(1)</script>',
    bodyText: "Hello\n<script>alert(1)</script>",
  });
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("&lt;script&gt;"), true);
  assert.equal(html.includes("<br/>"), true);
  assert.equal(html.includes(BRAND_NAME), true);
  assert.equal(html.includes(BRAND_EMAIL_TAGLINE), true);
  assert.equal(html.includes(BRAND_SITE_URL), true);
  assert.equal(html.includes(BRAND_SUPPORT_EMAIL), true);
  assert.equal(html.includes(BRAND_EMAIL_COPYRIGHT), true);
  assert.equal(
    html.includes("https://mapesim.com/brand/map-esim-logo.png"),
    true
  );
  assert.match(template, /renderTransactionalEmailLayoutHtml/);
  assert.match(template, /escapeHtml\(body\)/);
  console.log("   ok");

  console.log("2b) Reusable campaign templates");
  assert.deepEqual([...EMAIL_CAMPAIGN_TEMPLATE_KEYS], [
    "ANNOUNCEMENT",
    "OFFER",
    "ALERT",
    "TRAVEL_PROMOTION",
    "DISCOUNT_PROMO",
    "FEATURE_UPDATE",
    "WELCOME",
    "MAINTENANCE_ALERT",
    "CLASSIC",
  ]);
  assert.deepEqual([...EMAIL_CAMPAIGN_SELECTABLE_TEMPLATES], [
    "ANNOUNCEMENT",
    "OFFER",
    "ALERT",
    "TRAVEL_PROMOTION",
    "DISCOUNT_PROMO",
    "FEATURE_UPDATE",
    "WELCOME",
    "MAINTENANCE_ALERT",
  ]);
  assert.equal(parseEmailCampaignTemplateKey(""), "CLASSIC");
  assert.equal(parseEmailCampaignTemplateKey("offer"), "OFFER");
  assert.equal(parseEmailCampaignTemplateKey("welcome"), "WELCOME");
  assert.equal(parseEmailCampaignTemplateKey("unknown"), "CLASSIC");
  assert.equal(
    emailCampaignTemplateLabel("ANNOUNCEMENT"),
    "Simple Announcement"
  );
  assert.equal(emailCampaignTemplateLabel("OFFER"), "Offer / Discount");
  assert.equal(
    emailCampaignTemplateLabel("ALERT"),
    "Alert / Important Update"
  );
  assert.equal(emailCampaignTemplateLabel("TRAVEL_PROMOTION"), "Travel Promotion");
  assert.equal(emailCampaignTemplateLabel("DISCOUNT_PROMO"), "Discount / Promo");
  assert.equal(emailCampaignTemplateLabel("FEATURE_UPDATE"), "Feature Update");
  assert.equal(emailCampaignTemplateLabel("WELCOME"), "Welcome Email");
  assert.equal(
    emailCampaignTemplateLabel("MAINTENANCE_ALERT"),
    "Maintenance Alert"
  );
  assert.equal(emailCampaignTemplateLabel(null), "Classic travel promo");
  for (const key of EMAIL_CAMPAIGN_TEMPLATE_KEYS) {
    const preset = EMAIL_CAMPAIGN_TEMPLATE_PRESETS[key];
    assert.equal(preset.key, key);
    assert.ok(preset.label.length > 0);
    assert.ok(preset.defaultSubject.length > 0);
    assert.ok(preset.defaultBody.length > 0);
  }
  const classicHtml = renderCampaignEmailHtml({
    subject: "Classic subject",
    bodyText: "Classic body",
    templateKey: "CLASSIC",
  });
  assert.match(classicHtml, /Stay connected wherever you go/);
  assert.match(classicHtml, /Global Coverage/);
  assert.match(classicHtml, /Buy eSIM Now/);
  const announcementHtml = renderCampaignEmailHtml({
    subject: "Announce subject",
    bodyText: "Announce body",
    templateKey: "ANNOUNCEMENT",
  });
  assert.match(announcementHtml, /Announcement/);
  assert.doesNotMatch(announcementHtml, /Global Coverage/);
  const offerHtml = renderCampaignEmailHtml({
    subject: "Offer subject",
    bodyText: "Offer body",
    templateKey: "OFFER",
  });
  assert.match(offerHtml, /Special offer/);
  assert.match(offerHtml, /Browse eSIM plans/);
  assert.match(offerHtml, /Limited-time promo/);
  const alertHtml = renderCampaignEmailHtml({
    subject: "Alert subject",
    bodyText: "Alert body",
    templateKey: "ALERT",
  });
  assert.match(alertHtml, /Important update/);
  assert.match(alertHtml, /What you need to know/);
  const travelHtml = renderCampaignEmailHtml({
    subject: "Travel subject",
    bodyText: "Travel body",
    templateKey: "TRAVEL_PROMOTION",
  });
  assert.match(travelHtml, /Travel promotion/);
  assert.match(travelHtml, /Browse destinations/);
  const discountHtml = renderCampaignEmailHtml({
    subject: "Discount subject",
    bodyText: "Discount body",
    templateKey: "DISCOUNT_PROMO",
  });
  assert.match(discountHtml, /Discount \/ promo/);
  assert.match(discountHtml, /Promo details/);
  const featureHtml = renderCampaignEmailHtml({
    subject: "Feature subject",
    bodyText: "Feature body",
    templateKey: "FEATURE_UPDATE",
  });
  assert.match(featureHtml, /Feature update/);
  assert.match(featureHtml, /Release notes/);
  const welcomeHtml = renderCampaignEmailHtml({
    subject: "Welcome subject",
    bodyText: "Welcome body",
    templateKey: "WELCOME",
  });
  assert.match(welcomeHtml, /Welcome/);
  assert.match(welcomeHtml, /Getting started/);
  const maintenanceHtml = renderCampaignEmailHtml({
    subject: "Maintenance subject",
    bodyText: "Maintenance body",
    templateKey: "MAINTENANCE_ALERT",
  });
  assert.match(maintenanceHtml, /Maintenance alert/);
  assert.match(maintenanceHtml, /Maintenance details/);
  const offerText = renderCampaignEmailText({
    subject: "Offer subject",
    bodyText: "Offer body",
    templateKey: "OFFER",
  });
  assert.match(offerText, /Browse eSIM plans:/);
  assert.match(template, /case "ANNOUNCEMENT"/);
  assert.match(template, /case "OFFER"/);
  assert.match(template, /case "ALERT"/);
  assert.match(template, /case "TRAVEL_PROMOTION"/);
  assert.match(template, /case "DISCOUNT_PROMO"/);
  assert.match(template, /case "FEATURE_UPDATE"/);
  assert.match(template, /case "WELCOME"/);
  assert.match(template, /case "MAINTENANCE_ALERT"/);
  assert.match(template, /case "CLASSIC"/);
  console.log("   ok");

  console.log("3) Schema and migration store history + logs");
  assert.match(schema, /enum EmailCampaignAudience/);
  assert.match(schema, /ALL_CUSTOMERS/);
  assert.match(schema, /PURCHASED_CUSTOMERS/);
  assert.match(schema, /ACTIVE_CUSTOMERS/);
  assert.match(schema, /model EmailCampaign /);
  assert.match(schema, /templateKey\s+String\s+@default\("CLASSIC"\)/);
  assert.match(schema, /model EmailCampaignRecipient /);
  assert.match(schema, /emailCampaignsCreated/);
  assert.match(schema, /emailCampaignRecipients/);
  assert.match(schema, /@@unique\(\[campaignId, customerUserId\]\)/);
  assert.match(migration, /CREATE TABLE "EmailCampaign"/);
  assert.match(migration, /CREATE TABLE "EmailCampaignRecipient"/);
  assert.match(
    migration,
    /UNIQUE INDEX "EmailCampaignRecipient_campaignId_customerUserId_key"/
  );
  assert.doesNotMatch(migration, /WalletAccount|PaymentAttempt|VeSim/);
  assert.match(
    templateKeyMigration,
    /ADD COLUMN "templateKey" TEXT NOT NULL DEFAULT 'CLASSIC'/
  );
  console.log("   ok");

  console.log("4) Admin UI + nav");
  assert.match(nav, /href: "\/admin\/email-campaigns"/);
  assert.match(nav, /label: "Email Campaigns"/);
  assert.match(listPage, /requireRole\("ADMIN"\)/);
  assert.match(listPage, /listAdminEmailCampaigns/);
  assert.match(listPage, /Create campaign/);
  assert.match(newPage, /requireRole\("ADMIN"\)/);
  assert.match(newPage, /EmailCampaignForm/);
  assert.match(detailPage, /requireRole\("ADMIN"\)/);
  assert.match(detailPage, /srcDoc=\{detail\.previewHtml\}/);
  assert.match(detailPage, /EmailCampaignTestForm/);
  assert.match(detailPage, /EmailCampaignBulkSendForm/);
  assert.match(detailPage, /EmailCampaignResendFailedForm/);
  assert.match(detailPage, /Resend failed emails/);
  assert.match(detailPage, /Eligible now/);
  assert.match(detailPage, /Send log/);
  assert.match(detailPage, /detail\.templateLabel/);
  assert.match(detailPage, /batchDelayMs=\{detail\.batchDelayMs\}/);
  assert.match(detailPage, /autoStart/);
  assert.match(form, /name="subject"/);
  assert.match(form, /name="bodyText"/);
  assert.match(form, /name="audience"/);
  assert.match(form, /name="templateKey"/);
  assert.match(form, /EMAIL_CAMPAIGN_SELECTABLE_TEMPLATES/);
  assert.match(form, /EMAIL_CAMPAIGN_AUDIENCES\.map/);
  assert.match(form, /defaultValue="ALL_CUSTOMERS"/);
  assert.match(shared, /"PURCHASED_CUSTOMERS"/);
  assert.match(shared, /"ACTIVE_CUSTOMERS"/);
  assert.match(sendForms, /EMAIL_CAMPAIGN_CONFIRM_PHRASE/);
  assert.match(sendForms, /EMAIL_CAMPAIGN_RESEND_FAILED_PHRASE/);
  assert.match(sendForms, /name="confirmPhrase"/);
  assert.match(sendForms, /name="expectedRecipientCount"/);
  assert.match(sendForms, /Send test email/);
  assert.match(sendForms, /Send to \$\{recipientCount\} customers/);
  assert.match(sendForms, /Resend Failed/);
  assert.match(sendForms, /useAutoContinueQueue|Sending queue/);
  console.log("   ok");

  console.log("5) Audience + send safety");
  assert.match(service, /role: Role\.CUSTOMER/);
  assert.match(service, /deletedAt: null/);
  assert.match(service, /orders: \{ some: \{ status: OrderStatus\.COMPLETED \} \}/);
  assert.match(service, /blockedAt: null/);
  assert.match(service, /emailVerifiedAt: \{ not: null \}/);
  assert.match(service, /expectedRecipientCount !== liveCount/);
  assert.match(service, /campaignConfirmPhraseMatches/);
  assert.match(service, /EMAIL_CAMPAIGN_SEND_BATCH/);
  assert.match(service, /EMAIL_CAMPAIGN_MAX_BATCHES_PER_RUN/);
  assert.match(service, /resolveEmailCampaignBatchDelayMs/);
  assert.match(service, /processPendingCampaignBatches/);
  assert.match(service, /resendAdminEmailCampaignFailed/);
  assert.match(service, /EmailCampaignRecipientStatus\.FAILED/);
  assert.match(service, /email_campaign\.failed_resend_started/);
  assert.match(service, /email_campaign\.smtp_failure/);
  assert.match(service, /channel: EMAIL_CAMPAIGN_CHANNEL/);
  assert.match(service, /sendChannelMail/);
  assert.match(service, /email_campaign\.created/);
  assert.match(service, /email_campaign\.test_sent/);
  assert.match(service, /email_campaign\.bulk_started/);
  assert.match(service, /email_campaign\.bulk_completed/);
  assert.match(service, /templateKey/);
  assert.match(actions, /templateKeyRaw/);
  assert.match(actions, /resendEmailCampaignFailedAction/);
  assert.doesNotMatch(service, /metadata:\s*\{[^}]*\bemail\s*:/);
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /revalidatePath\("\/admin\/email-campaigns"\)/);
  assert.match(shared, /EMAIL_CAMPAIGN_CHANNEL = "support"/);
  assert.match(shared, /campaignCanResendFailed/);
  console.log("   ok");

  console.log("6) Isolated from payments, wallet, VeSIM, order mail");
  assertNoForbiddenImports(shared, "shared");
  assertNoForbiddenImports(service, "service");
  assertNoForbiddenImports(actions, "actions");
  assertNoForbiddenImports(template, "template");
  assert.doesNotMatch(sendOrderEmail, /emailCampaign|EmailCampaign/);
  assert.doesNotMatch(sendSupportEmail, /emailCampaign|EmailCampaign/);
  assert.doesNotMatch(orderTemplate, /emailCampaign|EmailCampaign/);
  assert.doesNotMatch(walletPurchase, /emailCampaign|EmailCampaign/);
  assert.doesNotMatch(paymentAdapter, /emailCampaign|EmailCampaign/);
  assert.match(sendOrderEmail, /channel: "orders"/);
  assert.match(sendSupportEmail, /channel: "support"/);
  assert.match(sendSupportEmail, /\[MAP eSIM Support\]/);
  assert.doesNotMatch(service, /\[MAP eSIM Support\]/);
  console.log("   ok");

  console.log("7) Package script");
  assert.match(pkg, /"qa:email-campaigns": "tsx scripts\/qa-email-campaigns.ts"/);
  console.log("   ok");

  console.log("ALL_QA_PASSED=email-campaigns");
}

main();
