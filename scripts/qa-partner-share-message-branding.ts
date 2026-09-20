/**
 * Offline QA: partner eSIM share message branding (copy / WhatsApp / Web Share).
 * No DB. No token mint. No public share page or install changes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND_NAME } from "../app/lib/brand";
import {
  buildAbsoluteShareUrl,
  buildPartnerShareClipboardText,
  buildPartnerShareIntroLine,
  buildPartnerWebSharePayload,
  buildPartnerWhatsAppShareHref,
  countShareUrlOccurrences,
  resolvePartnerShareDisplayName,
} from "../app/lib/partner/partnerShareCopy";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.equal(resolvePartnerShareDisplayName(null), BRAND_NAME);
  assert.equal(resolvePartnerShareDisplayName(""), BRAND_NAME);
  assert.equal(resolvePartnerShareDisplayName("Rana Travel"), "Rana Travel");
  assert.equal(resolvePartnerShareDisplayName("<ABC Tours>"), "ABC Tours");

  const shareUrl = buildAbsoluteShareUrl(
    "/share/abcdefghijklmnopqrstuvwxyz0123456789ABCDE",
    "https://mapesim.com"
  );

  const branded = {
    shareUrl,
    partnerDisplayName: "Rana Travel",
    destination: "Pakistan",
    planName: "100MB 7Days",
    dataAllowance: "102 MB",
    validity: "7 Days",
  };

  const intro = buildPartnerShareIntroLine(branded);
  assert.equal(
    intro,
    "Here are the eSIM QR details from Rana Travel for Pakistan 100MB 7Days (102 MB, 7 Days):"
  );
  assert.match(intro, /Pakistan/);
  assert.match(intro, /102 MB/);
  assert.match(intro, /7 Days/);
  assert.match(intro, /Rana Travel/);

  const clipboard = buildPartnerShareClipboardText(branded);
  assert.equal(clipboard, `${intro}\n${shareUrl}`);
  assert.equal(countShareUrlOccurrences(clipboard, shareUrl), 1);

  const waHref = buildPartnerWhatsAppShareHref(branded);
  assert.match(waHref, /^https:\/\/wa\.me\/\?text=/);
  assert.equal(
    decodeURIComponent(new URL(waHref).searchParams.get("text") || ""),
    clipboard
  );

  const web = buildPartnerWebSharePayload(branded);
  assert.equal(web.title, "Your eSIM from Rana Travel");
  assert.equal(web.text, intro);
  assert.equal(web.url, shareUrl);
  assert.equal(web.text.includes(shareUrl), false);

  const mapFallback = buildPartnerShareClipboardText({
    shareUrl,
    destination: "Japan",
    dataAllowance: "1 GB",
    validity: "30 Days",
  });
  assert.equal(
    mapFallback,
    `Here are the eSIM QR details from ${BRAND_NAME} for Japan (1 GB, 30 Days):\n${shareUrl}`
  );
  console.log("PASS partner_share_message_branding_payloads");

  const copySrc = read("app/lib/partner/partnerShareCopy.ts");
  const controls = read("app/components/partner/PartnerEsimShareControls.tsx");
  const install = read("app/components/partner/PartnerEsimInstallPanel.tsx");
  const card = read("app/components/partner/PartnerEsimOrderCard.tsx");
  const detail = read("app/partner/(portal)/orders/[orderId]/page.tsx");
  const token = read("app/lib/partner/partnerEsimShareToken.ts");
  const sharePage = read("app/share/[token]/page.tsx");

  assert.match(copySrc, /partnerDisplayName/);
  assert.match(copySrc, /buildPartnerShareClipboardText/);
  assert.match(controls, /buildPartnerShareClipboardText/);
  assert.match(controls, /partnerDisplayName/);
  assert.match(install, /partnerDisplayName/);
  assert.match(card, /partnerDisplayName/);
  assert.match(detail, /getPartnerShareBranding/);
  assert.match(detail, /partnerDisplayName/);
  assert.doesNotMatch(detail, /createPartnerEsimShareToken/);
  assert.doesNotMatch(copySrc, /createPartnerEsimShareToken|prisma/);
  assert.doesNotMatch(controls, /prisma\.|walletPurchase|confirmWallet/);
  // Token mint + public share page remain untouched by this messaging change.
  assert.match(token, /buildPartnerEsimSharePath/);
  assert.match(sharePage, /getPartnerEsimSharePageData/);
  assert.doesNotMatch(sharePage, /buildPartnerShareClipboardText/);
  console.log("PASS partner_share_message_branding_wiring");

  console.log("OK qa-partner-share-message-branding");
}

main();
