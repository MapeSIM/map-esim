/**
 * Offline QA: order email QR uses HTTPS order-access URL, not CID/data URI.
 * Covers initial deliver + admin resend wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getSampleOrderEmailPayload,
  renderOrderEmailHtml,
} from "../app/lib/email/template";
import { getOrderAccessQrImageUrl } from "../app/lib/vesim/orderAccess";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function assertProductionSafeHtml(html: string, label: string): void {
  assert.doesNotMatch(html, /\bcid:/i, `${label}: no cid:`);
  assert.doesNotMatch(html, /data:image/i, `${label}: no data:image`);
  assert.match(html, /https:\/\/[^"'>\s]+\/api\/vesim\/install\/qr\?/i, `${label}: https qr`);
  assert.match(html, /Your eSIM is Ready!/);
  assert.match(html, /Scan to install your eSIM/);
  assert.match(html, /Open secure install page|Secure install/i);
  assert.match(html, /Device installation/);
  assert.match(html, /iPhone/);
  assert.match(html, /Android/);
  assert.match(html, /Plan details/);
}

function main() {
  const send = read("app/lib/email/sendOrderEmail.ts");
  const extract = read("app/lib/email/extract.ts");
  const deliver = read("app/lib/email/deliverAfterCheckout.ts");
  const resend = read("app/lib/admin/reconciliationEmailResend.ts");
  const orderAccess = read("app/lib/vesim/orderAccess.ts");

  assert.match(orderAccess, /export function getOrderAccessQrImageUrl/);
  assert.match(orderAccess, /\/api\/vesim\/install\/qr/);
  assert.doesNotMatch(send, /cid:\$\{ESIM_QR_CID\}|cid:mapesim-esim-qr/);
  assert.doesNotMatch(send, /contentDisposition:\s*"inline"/);
  assert.match(send, /contentDisposition:\s*"attachment"/);
  assert.match(send, /\^cid:|data:/);
  assert.match(extract, /getOrderAccessQrImageUrl/);
  assert.match(extract, /accessToken/);
  assert.match(deliver, /accessToken:\s*accessToken/);
  // Both wallet + assignment resend paths must mint HTTPS QR via accessToken.
  const resendAccessPasses = resend.match(/accessToken:\s*accessToken/g) || [];
  assert.ok(
    resendAccessPasses.length >= 2,
    "resend must pass accessToken on wallet + assignment paths"
  );

  const url = getOrderAccessQrImageUrl(
    "ord_test_1",
    "v1.token.sample",
    "inline"
  );
  assert.ok(url);
  assert.match(url!, /^https:\/\//);
  assert.match(url!, /\/api\/vesim\/install\/qr\?/);
  assert.match(url!, /orderId=ord_test_1/);
  assert.match(url!, /access=/);
  assert.match(url!, /disposition=inline/);
  assert.doesNotMatch(url!, /LPA:|smdp|activation/i);

  const sample = getSampleOrderEmailPayload();
  assert.ok(sample.qrImageUrl?.startsWith("https://"));
  const html = renderOrderEmailHtml(sample, {
    qrImageSrc: sample.qrImageUrl,
    hasQrAttachment: true,
  });
  assertProductionSafeHtml(html, "sample_https");
  assert.match(html, /do not forward this email/i);
  assert.match(html, /Enter details manually/);
  assert.match(html, /Can(?:'|&#39;)t scan/);
  assert.match(html, /Pakistan 1GB/);

  const withIphone = getSampleOrderEmailPayload({ withOfficialIphoneLink: true });
  const htmlIphone = renderOrderEmailHtml(withIphone, {
    qrImageSrc: withIphone.qrImageUrl,
    hasQrAttachment: true,
  });
  assertProductionSafeHtml(htmlIphone, "sample_iphone");
  assert.match(htmlIphone, /Install on iPhone/);

  console.log("ALL PASS qa-order-email-qr-https");
}

main();
