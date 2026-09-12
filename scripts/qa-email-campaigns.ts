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
  campaignCanStartBulkSend,
  campaignConfirmPhraseMatches,
  EMAIL_CAMPAIGN_AUDIENCE_HELP,
  EMAIL_CAMPAIGN_AUDIENCES,
  EMAIL_CAMPAIGN_BODY_MAX,
  EMAIL_CAMPAIGN_CHANNEL,
  EMAIL_CAMPAIGN_CONFIRM_PHRASE,
  EMAIL_CAMPAIGN_SEND_BATCH,
  EMAIL_CAMPAIGN_SUBJECT_MAX,
  emailCampaignAudienceLabel,
  parseEmailCampaignAudience,
  sanitizeCampaignBody,
  sanitizeCampaignSubject,
} from "../app/lib/admin/emailCampaignShared";
import { renderCampaignEmailHtml } from "../app/lib/email/campaignTemplate";

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
  assert.equal(EMAIL_CAMPAIGN_CHANNEL, "support");
  assert.equal(EMAIL_CAMPAIGN_SUBJECT_MAX, 160);
  assert.equal(EMAIL_CAMPAIGN_BODY_MAX, 20_000);
  assert.equal(EMAIL_CAMPAIGN_SEND_BATCH, 20);
  assert.equal(campaignConfirmPhraseMatches("SEND CUSTOMER CAMPAIGN"), true);
  assert.equal(campaignConfirmPhraseMatches(" send customer campaign "), false);
  assert.equal(campaignConfirmPhraseMatches("SEND"), false);
  assert.equal(campaignCanStartBulkSend("DRAFT"), true);
  assert.equal(campaignCanStartBulkSend("TEST_SENT"), true);
  assert.equal(campaignCanStartBulkSend("SENDING"), false);
  assert.equal(campaignCanContinueBulkSend("SENDING"), true);
  assert.equal(campaignCanContinueBulkSend("DRAFT"), false);
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

  console.log("3) Schema and migration store history + logs");
  assert.match(schema, /enum EmailCampaignAudience/);
  assert.match(schema, /ALL_CUSTOMERS/);
  assert.match(schema, /PURCHASED_CUSTOMERS/);
  assert.match(schema, /ACTIVE_CUSTOMERS/);
  assert.match(schema, /model EmailCampaign /);
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
  assert.match(detailPage, /Eligible now/);
  assert.match(detailPage, /Send log/);
  assert.match(form, /name="subject"/);
  assert.match(form, /name="bodyText"/);
  assert.match(form, /name="audience"/);
  assert.match(form, /EMAIL_CAMPAIGN_AUDIENCES\.map/);
  assert.match(form, /defaultValue="ALL_CUSTOMERS"/);
  assert.match(shared, /"PURCHASED_CUSTOMERS"/);
  assert.match(shared, /"ACTIVE_CUSTOMERS"/);
  assert.match(sendForms, /EMAIL_CAMPAIGN_CONFIRM_PHRASE/);
  assert.match(sendForms, /name="confirmPhrase"/);
  assert.match(sendForms, /name="expectedRecipientCount"/);
  assert.match(sendForms, /Send test email/);
  assert.match(sendForms, /Send to \$\{recipientCount\} customers/);
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
  assert.match(service, /channel: EMAIL_CAMPAIGN_CHANNEL/);
  assert.match(service, /sendChannelMail/);
  assert.match(service, /email_campaign\.created/);
  assert.match(service, /email_campaign\.test_sent/);
  assert.match(service, /email_campaign\.bulk_started/);
  assert.match(service, /email_campaign\.bulk_completed/);
  assert.doesNotMatch(service, /metadata:\s*\{[^}]*\bemail\s*:/);
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /revalidatePath\("\/admin\/email-campaigns"\)/);
  assert.match(shared, /EMAIL_CAMPAIGN_CHANNEL = "support"/);
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
