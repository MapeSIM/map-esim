/**
 * Safe offline checks for the order-email delivery helpers.
 * Does not contact SMTP or VeSIM. Does not read .env.local secrets into logs.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function loadTs(relPath) {
  const abs = path.resolve(process.cwd(), relPath);
  return import(pathToFileURL(abs).href);
}

async function main() {
  // Ensure SMTP env is empty so send path returns not_configured.
  for (const key of [
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
  ]) {
    delete process.env[key];
  }

  const { getEmailConfig, isEmailConfigured } = await loadTs(
    "app/lib/email/config.ts"
  );
  const {
    extractInstallDetails,
    hasInstallDetails,
    buildOrderEmailPayload,
  } = await loadTs("app/lib/email/extract.ts");
  const { sendOrderEmail } = await loadTs("app/lib/email/sendOrderEmail.ts");
  const {
    markEmailDelivery,
    wasEmailAlreadySent,
    getEmailDeliveryRecord,
  } = await loadTs("app/lib/email/deliveryStore.ts");
  const { renderOrderEmailHtml, getSampleOrderEmailPayload } = await loadTs(
    "app/lib/email/template.ts"
  );
  const {
    resolveInstallQrValue,
    generateEsimQrPngBuffer,
    isValidInstallQrValue,
  } = await loadTs("app/lib/email/qr.ts");

  console.log("1) Email provider unavailable / not configured");
  assert.equal(isEmailConfigured("orders"), false);
  assert.equal(getEmailConfig("orders").configured, false);
  const notConfigured = await sendOrderEmail({
    customerEmail: "customer@example.com",
    orderId: "TEST-ORDER-NC-1",
    destination: "Japan",
    planName: "Japan 3GB",
    dataAllowance: "3 GB",
    validity: "7 Days",
    iccid: "8900000000000000001",
    smdpAddress: "smdp.example.invalid",
    activationCode: "CODE",
  });
  assert.equal(notConfigured.emailDelivery, "not_configured");
  console.log("   ok ->", notConfigured.emailDelivery);

  console.log("2) Missing installation details");
  const missing = extractInstallDetails({ orderId: "x", status: "ok" });
  assert.equal(hasInstallDetails(missing), false);
  const payload = buildOrderEmailPayload({
    customerEmail: "customer@example.com",
    orderId: "TEST-ORDER-NO-INSTALL",
    verifiedOffer: {
      offerId: "ESIM-JP-1",
      name: "Japan 3GB",
      countryCode: "JP",
      countryName: "Japan",
      dataFormatted: "3 GB",
      durationDays: 7,
      priceUSD: 9,
      currency: "USD",
    },
    orderPayload: { orderId: "TEST-ORDER-NO-INSTALL" },
  });
  assert.equal(payload, null);
  console.log("   ok -> skipped_no_install_details path available");

  console.log("3) Duplicate email attempt");
  markEmailDelivery("TEST-ORDER-DUP", "sent", "customer@example.com");
  assert.equal(wasEmailAlreadySent("TEST-ORDER-DUP"), true);
  const dup = await sendOrderEmail({
    customerEmail: "customer@example.com",
    orderId: "TEST-ORDER-DUP",
    destination: "Japan",
    planName: "Japan 3GB",
    dataAllowance: "3 GB",
    validity: "7 Days",
    qrValue: "LPA:1$smdp.example.invalid$CODE",
  });
  assert.equal(dup.emailDelivery, "already_sent");
  console.log("   ok ->", dup.emailDelivery);

  console.log("4) Invalid customer email");
  const invalid = await sendOrderEmail({
    customerEmail: "not-an-email",
    orderId: "TEST-ORDER-BAD-EMAIL",
    destination: "Japan",
    planName: "Japan 3GB",
    dataAllowance: "3 GB",
    validity: "7 Days",
    iccid: "8900000000000000001",
  });
  assert.equal(invalid.emailDelivery, "invalid_email");
  assert.equal(
    getEmailDeliveryRecord("TEST-ORDER-BAD-EMAIL")?.status,
    "invalid_email"
  );
  console.log("   ok ->", invalid.emailDelivery);

  console.log("5) Safe error handling / template sanitization");
  const sample = getSampleOrderEmailPayload();
  const html = renderOrderEmailHtml({
    ...sample,
    planName: '<script>alert("x")</script>',
  });
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("&lt;script&gt;"), true);
  assert.equal(html.includes("SMTP_PASSWORD"), false);
  assert.equal(html.includes("VESIM"), false);
  console.log("   ok -> HTML escaped; no secrets in template");

  console.log("6) QR generation from verified LPA only");
  assert.equal(isValidInstallQrValue("https://evil.example/?x=1"), false);
  assert.equal(
    resolveInstallQrValue({
      ...sample,
      qrValue: undefined,
      smdpAddress: undefined,
      activationCode: undefined,
    }),
    null
  );
  const lpa = resolveInstallQrValue(sample);
  assert.ok(lpa && lpa.startsWith("LPA:1$"));
  const png = await generateEsimQrPngBuffer(lpa);
  assert.ok(png && png.length > 100);
  const htmlWithQr = renderOrderEmailHtml(sample, {
    qrImageSrc: "cid:mapesim-esim-qr@mapesim.com",
  });
  assert.equal(htmlWithQr.includes("Scan to install your eSIM"), true);
  assert.equal(htmlWithQr.includes("cid:mapesim-esim-qr@mapesim.com"), true);
  assert.equal(htmlWithQr.includes("Complete LPA installation value"), true);
  const htmlNoQr = renderOrderEmailHtml({
    ...sample,
    qrValue: undefined,
    smdpAddress: undefined,
    activationCode: undefined,
  });
  assert.equal(htmlNoQr.includes("Scan to install your eSIM"), false);
  assert.equal(htmlNoQr.includes("cid:mapesim-esim-qr@mapesim.com"), false);
  // Brand logo footer may still include an <img>; QR CID must stay absent.
  assert.equal(htmlNoQr.includes("cid:mapesim-brand-logo@mapesim.com"), true);
  console.log("   ok -> PNG QR + CID template; logo footer without QR CID");

  // Prove install extraction works for common VeSIM-like shapes.
  const install = extractInstallDetails({
    order: {
      iccid: "8900111122223333444",
      smdpAddress: "smdp.provider.example",
      activationCode: "ACT-123",
    },
  });
  assert.equal(hasInstallDetails(install), true);
  assert.equal(install.iccid, "8900111122223333444");

  console.log("\nAll email delivery self-tests passed.");
}

main().catch((error) => {
  console.error("Self-test failed:", error);
  process.exit(1);
});
