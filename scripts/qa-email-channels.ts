/**
 * Non-delivery QA for transactional email channels + branding footer.
 * Does not contact SMTP or send mail.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  EMAIL_CHANNEL_IDS,
  EMAIL_CHANNELS,
  formatChannelFrom,
  formatChannelReplyTo,
  SUPPORT_REPLY_TO,
} from "../app/lib/email/channels";
import {
  getEmailConfig,
  isEmailConfigured,
  resolveSmtpTls,
  sanitizeEmailHeaderValue,
} from "../app/lib/email/config";
import { clearTransporterCache } from "../app/lib/email/transport";
import { renderOtpEmailHtml, renderOtpEmailText } from "../app/lib/email/otpTemplate";
import {
  renderOrderEmailHtml,
  getSampleOrderEmailPayload,
} from "../app/lib/email/template";
import { renderPasswordChangedEmailHtml } from "../app/lib/email/securityNoticeTemplate";
import { EMAIL_LOGO_CID, getEmailLogoAttachment } from "../app/lib/email/logo";
import { ESIM_QR_CID } from "../app/lib/email/qr";
import { BRAND_NAME, BRAND_SITE_URL, BRAND_TAGLINE } from "../app/lib/brand";

function wipeEmailEnv() {
  const keys = [
    "EMAIL_PROVIDER",
    "EMAIL_FROM",
    "EMAIL_REPLY_TO",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_SECURITY_USER",
    "SMTP_SECURITY_PASSWORD",
    "SMTP_ORDERS_USER",
    "SMTP_ORDERS_PASSWORD",
    "SMTP_BILLING_USER",
    "SMTP_BILLING_PASSWORD",
    "SMTP_SUPPORT_USER",
    "SMTP_SUPPORT_PASSWORD",
  ];
  for (const key of keys) delete process.env[key];
  clearTransporterCache();
}

function main() {
  console.log("1) Public brand spelling");
  assert.equal(BRAND_NAME, "MAP eSIM");
  assert.equal(BRAND_TAGLINE, "Global eSIM Connectivity");
  assert.equal(BRAND_SITE_URL, "https://mapesim.com");
  assert.equal(BRAND_SITE_URL.includes("localhost"), false);

  console.log("2) Channel From / Reply-To mapping");
  for (const channel of EMAIL_CHANNEL_IDS) {
    const from = formatChannelFrom(channel);
    const reply = formatChannelReplyTo();
    assert.equal(from.includes(EMAIL_CHANNELS[channel].mailbox), true);
    assert.equal(from.startsWith("MAP eSIM "), true);
    assert.equal(from.includes("MAP-eSIM"), false);
    assert.equal(reply, SUPPORT_REPLY_TO);
    console.log(`   ${channel}: ${from}`);
  }

  console.log("3) Logo asset + unique CIDs");
  const logoPath = path.join(process.cwd(), "public", "brand", "map-esim-logo.png");
  assert.equal(existsSync(logoPath), true);
  const logo = getEmailLogoAttachment();
  assert.ok(logo);
  assert.equal(logo?.cid, EMAIL_LOGO_CID);
  assert.notEqual(EMAIL_LOGO_CID, ESIM_QR_CID);
  console.log("   ok -> logo CID distinct from QR CID");

  console.log("4) Missing env fails safely (no cross-channel fallback)");
  wipeEmailEnv();
  for (const channel of EMAIL_CHANNEL_IDS) {
    assert.equal(isEmailConfigured(channel), false);
  }
  process.env.SMTP_HOST = "smtp.hostinger.com";
  process.env.SMTP_PORT = "465";
  process.env.SMTP_SECURE = "true";
  process.env.SMTP_SECURITY_USER = "security@mapesim.com";
  process.env.SMTP_SECURITY_PASSWORD = "test-password-not-real";
  clearTransporterCache();
  assert.equal(isEmailConfigured("security"), true);
  assert.equal(isEmailConfigured("orders"), false);
  console.log("   ok -> no silent sender fallback");

  console.log("5) Mailbox mismatch rejected");
  process.env.SMTP_ORDERS_USER = "security@mapesim.com";
  process.env.SMTP_ORDERS_PASSWORD = "x";
  clearTransporterCache();
  const ordersMismatch = getEmailConfig("orders");
  assert.equal(ordersMismatch.configured, false);
  if (!ordersMismatch.configured) {
    assert.equal(ordersMismatch.reason, "mailbox_mismatch");
  }

  console.log("6) TLS policy");
  assert.equal(resolveSmtpTls(465, "true").ok, true);
  assert.equal(resolveSmtpTls(465, "false").ok, false);
  const tls587 = resolveSmtpTls(587, "true");
  assert.equal(tls587.ok, true);
  if (tls587.ok) {
    assert.equal(tls587.tls.requireTLS, true);
  }

  console.log("7) Header sanitization");
  assert.equal(
    sanitizeEmailHeaderValue("Hello\nWorld\rInjected").includes("\n"),
    false
  );

  console.log("8) Templates: brand, footer, no localhost, no secrets");
  const otpHtml = renderOtpEmailHtml({
    kind: "signup",
    code: "123456",
    recipientEmail: "qa@mapesim.com",
  });
  const otpText = renderOtpEmailText({
    kind: "password_reset",
    code: "654321",
    recipientEmail: "qa@mapesim.com",
  });
  assert.equal(otpHtml.includes("MAP eSIM"), true);
  assert.equal(otpHtml.includes("MAP-eSIM"), false);
  assert.equal(otpHtml.includes("Global eSIM Connectivity"), true);
  assert.equal(otpHtml.includes('href="https://mapesim.com"'), true);
  assert.equal(otpHtml.includes("localhost"), false);
  assert.equal(otpHtml.includes("cid:mapesim-brand-logo@mapesim.com"), true);
  assert.equal(otpHtml.includes("MAP eSIM Security"), true);
  assert.equal(otpHtml.includes("security@mapesim.com"), true);
  assert.equal(otpHtml.includes("billing@mapesim.com"), false);
  assert.equal(otpText.includes("https://mapesim.com"), true);
  assert.equal(otpHtml.includes("SMTP_"), false);

  const orderHtml = renderOrderEmailHtml(getSampleOrderEmailPayload());
  assert.equal(orderHtml.includes("MAP eSIM Orders"), true);
  assert.equal(orderHtml.includes("orders@mapesim.com"), true);
  assert.equal(orderHtml.includes("security@mapesim.com"), false);
  assert.equal(orderHtml.includes("localhost"), false);
  assert.equal(orderHtml.includes("cid:mapesim-brand-logo@mapesim.com"), true);

  const changed = renderPasswordChangedEmailHtml("qa@mapesim.com");
  assert.equal(changed.includes("Password changed"), true);
  assert.equal(changed.includes("MAP eSIM Security"), true);

  console.log("\nAll email-channel non-delivery checks passed.");
}

main();
