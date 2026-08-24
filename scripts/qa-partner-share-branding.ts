/**
 * Isolated LOCAL Partner share-branding QA (Phase 3 Slice 3).
 * DATABASE_URL must be 127.0.0.1:55440 / map_esim_partner_phase3_uat.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  OrderFundingSource,
  OrderStatus,
  PartnerEsimPurchaseStatus,
  PrismaClient,
  Role,
} from "@prisma/client";
import { hashPassword } from "../app/lib/auth/password";
import { buildIccidPersistFields } from "../app/lib/orders/iccidCrypto";
import { getPartnerEsimSharePageData } from "../app/lib/partner/partnerEsimShareRead";
import {
  createPartnerEsimShareToken,
  hasActivePartnerEsimShareToken,
  revokePartnerEsimShareToken,
} from "../app/lib/partner/partnerEsimShareToken";
import {
  getPartnerShareBranding,
  updatePartnerShareBranding,
} from "../app/lib/partner/partnerShareBranding";
import {
  parsePartnerShareBrandingInput,
  PartnerShareBrandingError,
  publicShareBrandingDto,
  publicShareLogoSrc,
  SHARE_COMPANY_NAME_MAX,
  SHARE_COMPANY_NAME_TOO_LONG,
  sharePoweredByLabel,
} from "../app/lib/partner/partnerShareBrandingValidate";
import { prisma as appPrisma } from "../app/lib/db";
import {
  isOwnedPartnerLogoBlobUrl,
  isVercelBlobPublicHost,
  parsePartnerLogoBlobUrl,
  PARTNER_LOGO_MAX_BYTES,
} from "../app/lib/partner/partnerShareLogoBlob";
import {
  PARTNER_LOGO_INVALID,
  PARTNER_LOGO_UNAVAILABLE,
  preparePartnerLogoWebp,
} from "../app/lib/partner/partnerShareLogoImage";
import {
  isPartnerLogoBlobWriteConfigured,
  removePartnerShareLogo,
  uploadPartnerShareLogo,
  type PartnerLogoBlobStore,
} from "../app/lib/partner/partnerShareLogo";
import {
  PARTNER_LOGO_STAGE,
  safePartnerLogoStageMeta,
} from "../app/lib/partner/partnerShareLogoStages";
import sharp from "sharp";
import {
  assertSafeSharePayload,
  buildAbsoluteShareUrl,
  buildPartnerShareWhatsAppText,
  buildPartnerWebSharePayload,
  buildPartnerWhatsAppShareHref,
  countShareUrlOccurrences,
} from "../app/lib/partner/partnerShareCopy";
import {
  buildNextConfigHeaderSources,
  PRIVATE_NO_STORE_VALUE,
} from "../app/lib/security/headers";

const SAMPLE_ICCID = "8900000000000000777";
const QA_LPA = "LPA:1$rsp.example.com$MATCHING-ID-QA-BRAND";

function assertLocalPhase3Db(url: string): void {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing non-local host: ${host}`);
  }
  const port = parsed.port || "5432";
  const db = parsed.pathname.replace(/^\//, "");
  if (port !== "55440" || db !== "map_esim_partner_phase3_uat") {
    throw new Error(`Refusing unexpected Phase 3 target port=${port} db=${db}`);
  }
  console.log(`CONFIRMED_LOCAL_DB host=${host} port=${port} db=${db}`);
}

function idem(tag: string): string {
  return `pep_sbrand_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 128);
}

async function rasterBytes(
  format: "png" | "jpeg" | "webp",
  size = 16
): Promise<Buffer> {
  const image = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 16, g: 180, b: 40, alpha: 1 },
    },
  });
  if (format === "png") return image.png().toBuffer();
  if (format === "jpeg") return image.jpeg({ quality: 80 }).toBuffer();
  return image.webp({ quality: 80 }).toBuffer();
}

function mockBlobStore(host = "map-esim-partner-logos.public.blob.vercel-storage.com") {
  const events: string[] = [];
  const puts: { pathname: string; url: string }[] = [];
  const dels: string[] = [];
  const store: PartnerLogoBlobStore = {
    async put(input) {
      events.push("put");
      assert.equal(input.contentType, "image/webp");
      assert.match(input.pathname, /^partner-logos\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.webp$/);
      const url = `https://${host}/${input.pathname}`;
      puts.push({ pathname: input.pathname, url });
      return { url };
    },
    async del(url) {
      events.push("del");
      dels.push(url);
    },
  };
  return { store, events, puts, dels };
}

function read(rel: string): string {
  return readFileSync(path.join(__dirname, "..", rel), "utf8");
}

function expectInvalid(
  input: Parameters<typeof parsePartnerShareBrandingInput>[0],
  code: PartnerShareBrandingError["code"]
): void {
  try {
    parsePartnerShareBrandingInput(input);
    throw new Error(`expected ${code}`);
  } catch (err) {
    assert.ok(err instanceof PartnerShareBrandingError);
    assert.equal(err.code, code);
  }
}

function assertNoPublicSecrets(value: unknown, rawToken?: string): void {
  const json = JSON.stringify(value);
  for (const needle of [
    "discountBps",
    "partnerCharge",
    "providerCost",
    "balanceCents",
    "tokenHash",
    "passwordHash",
    "walletAccount",
    "partnerId",
    "orderId",
    "purchaseId",
    "providerOrderId",
  ]) {
    assert.equal(json.includes(needle), false, `leaked ${needle}`);
  }
  if (rawToken) {
    assert.equal(json.includes(rawToken), false, "leaked raw token");
  }
}

async function seedCompletedOrder(
  prisma: PrismaClient,
  options: { partnerId: string; email: string; tag: string }
): Promise<string> {
  const persist = buildIccidPersistFields(SAMPLE_ICCID);
  assert.ok(persist);
  const order = await prisma.order.create({
    data: {
      providerOrderId: `PO-SBRAND-${options.tag}-${randomBytes(4).toString("hex")}`,
      customerEmail: options.email,
      offerId: `ESIM-SBRAND-${options.tag}`,
      destination: "Japan",
      planName: "QA Brand 3GB",
      dataAllowance: "3 GB",
      validity: "30 Days",
      fundingSource: OrderFundingSource.PARTNER_BALANCE,
      status: OrderStatus.COMPLETED,
      ...persist,
      partnerEsimPurchase: {
        create: {
          partnerId: options.partnerId,
          offerId: `ESIM-SBRAND-${options.tag}`,
          destinationCode: "JP",
          destinationName: "Japan",
          planName: "QA Brand 3GB",
          dataAllowance: "3 GB",
          validity: "30 Days",
          retailPriceCents: 2000,
          discountBps: 1000,
          discountVersion: 1,
          partnerChargeCents: 1800,
          providerCostCents: 1500,
          fundingSource: OrderFundingSource.PARTNER_BALANCE,
          status: PartnerEsimPurchaseStatus.COMPLETED,
          idempotencyKey: idem(options.tag),
          completedAt: new Date(),
        },
      },
    },
    select: { id: true },
  });
  return order.id;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  assertLocalPhase3Db(url);

  process.env.ICCID_ENCRYPTION_KEY =
    process.env.ICCID_ENCRYPTION_KEY || randomBytes(32).toString("hex");

  const brandingSrc = read("app/lib/partner/partnerShareBranding.ts");
  const validateSrc = read("app/lib/partner/partnerShareBrandingValidate.ts");
  const copySrc = read("app/lib/partner/partnerShareCopy.ts");
  const actionsSrc = read("app/lib/partner/partnerShareBrandingActions.ts");
  const linkSrc = read("app/lib/partner/partnerShareLinkActions.ts");
  const viewSrc = read("app/components/partner/PartnerEsimShareView.tsx");
  const controlsSrc = read("app/components/partner/PartnerEsimShareControls.tsx");
  const formSrc = read("app/components/partner/PartnerShareBrandingForm.tsx");
  const pageSrc = read("app/share/[token]/page.tsx");
  const layoutSrc = read("app/share/layout.tsx");
  const headersSrc = read("app/lib/security/headers.ts");
  const profileSrc = read("app/partner/(portal)/profile/page.tsx");
  const tokenSrc = read("app/lib/partner/partnerEsimShareToken.ts");
  const logoSrc = read("app/lib/partner/partnerShareLogo.ts");
  const logoBlobSrc = read("app/lib/partner/partnerShareLogoBlob.ts");
  const logoImageSrc = read("app/lib/partner/partnerShareLogoImage.ts");
  const customerUsage = read("app/lib/orders/customerEsimUsage.ts");
  const customerInstall = read("app/lib/orders/customerOrderInstall.ts");
  const accountPage = read("app/account/page.tsx");
  const pkg = read("package.json");

  assert.match(brandingSrc, /import ["']server-only["']/);
  assert.match(brandingSrc, /partner\.share_branding_updated/);
  assert.match(brandingSrc, /changedFields/);
  assert.doesNotMatch(brandingSrc, /logoContents|rawToken|iccid|providerCost|discountBps/);
  assert.match(actionsSrc, /uploadPartnerShareLogoAction/);
  assert.match(actionsSrc, /void formData\.get\(["']pathname["']\)/);
  assert.match(actionsSrc, /void formData\.get\(["']partnerId["']\)/);
  assert.match(actionsSrc, /user\.id/);
  assert.match(logoSrc, /buildPartnerLogoBlobPathname\(actor\.partnerId/);
  assert.doesNotMatch(logoSrc, /formData\.get\(["']pathname["']\)/);
  assert.match(logoSrc, /access:\s*["']public["']/);
  assert.match(logoSrc, /new Blob\(/);
  assert.match(logoSrc, /\.\.\.auth/);
  assert.match(logoSrc, /blobWriteOptions/);
  assert.match(logoSrc, /PARTNER_LOGO_STAGE\.BLOB_PUT_FAILED/);
  assert.match(logoBlobSrc, /PARTNER_LOGO_BLOB_PREFIX/);
  assert.match(logoBlobSrc, /vercel-storage/);
  assert.match(logoImageSrc, /sharp/);
  assert.match(logoImageSrc, /image\/webp/);
  assert.match(logoImageSrc, /PARTNER_LOGO_STAGE\.IMAGE_PROCESS_FAILED/);
  assert.doesNotMatch(logoSrc, /console\.(?:log|info|warn)\(/);
  assert.doesNotMatch(logoSrc, /err\.message|error\.message|exception\.message/);
  assert.doesNotMatch(actionsSrc, /BLOB_READ_WRITE_TOKEN/);
  assert.doesNotMatch(actionsSrc, /result\.stage/);
  assert.match(logoBlobSrc, /BLOB_READ_WRITE_TOKEN/);
  assert.match(logoSrc, /PARTNER_LOGO_BLOB_TOKEN_ENV/);
  assert.match(formSrc, /Logo upload is temporarily unavailable/);
  assert.doesNotMatch(formSrc, /PARTNER_LOGO_BLOB_PUT_FAILED/);
  assert.match(validateSrc, /SHARE_HEX_RE/);
  assert.match(validateSrc, /https:/);
  assert.match(copySrc, /wa\.me\/\?text=/);
  assert.match(copySrc, /Here are the eSIM QR details for/);
  assert.match(copySrc, /countShareUrlOccurrences/);
  assert.doesNotMatch(copySrc, /has shared your eSIM details securely/);
  assert.doesNotMatch(copySrc, /Here are your eSIM details for/);
  assert.doesNotMatch(copySrc, / — /);
  assert.match(controlsSrc, /destination/);
  assert.match(controlsSrc, /planName/);
  assert.match(controlsSrc, /dataAllowance/);
  assert.match(controlsSrc, /validity/);
  assert.match(controlsSrc, /Regenerate Share Link/);
  assert.match(controlsSrc, /Create Share Link/);
  assert.match(controlsSrc, /Revoke Share Link/);
  assert.match(controlsSrc, /Copy Link/);
  assert.match(
    controlsSrc,
    /This share link stays\s+active until you revoke or regenerate it/
  );
  assert.doesNotMatch(controlsSrc, /expires in \d+|expires in X /i);
  assert.match(controlsSrc, /navigator\.share/);
  assert.match(controlsSrc, /window\.location\.origin/);
  assert.match(formSrc, /SHARE_COMPANY_NAME_MAX/);
  assert.match(formSrc, /maxLength=\{SHARE_COMPANY_NAME_MAX\}/);
  assert.match(validateSrc, /SHARE_COMPANY_NAME_MAX = 30/);
  assert.match(validateSrc, /Company name must be 30 characters or fewer/);
  assert.match(formSrc, /Save Branding/);
  assert.match(formSrc, /updatePartnerShareBrandingAction/);
  assert.match(formSrc, /data-branding-save/);
  assert.match(formSrc, /partner-share-branding-color-scratch/);
  assert.match(formSrc, /handleBrandingSubmit/);
  assert.match(formSrc, /form=\{COLOR_SCRATCH_FORM_ID\}/);
  assert.match(formSrc, /Upload Logo/);
  assert.match(formSrc, /Replace Logo/);
  assert.match(formSrc, /Remove Logo/);
  assert.match(formSrc, /PNG, JPG or WEBP\. Max 1 MB\./);
  assert.match(formSrc, /type=["']file["']/);
  assert.doesNotMatch(formSrc, /mapesim\.com\/brand\/your-logo/);
  assert.match(profileSrc, /PartnerShareBrandingForm/);
  assert.doesNotMatch(profileSrc, /Coming later/);
  assert.match(viewSrc, /Support|Visit website/);
  assert.match(viewSrc, /noopener noreferrer/);
  assert.match(viewSrc, /referrerPolicy=["']no-referrer["']/);
  assert.doesNotMatch(viewSrc, /wa\.me/i);
  assert.match(pageSrc, /companyName/);
  assert.match(pageSrc, /sharePoweredByLabel\(companyName\)/);
  assert.match(pageSrc, /PartnerSharePageLogo/);
  assert.match(pageSrc, /items-center text-center/);
  assert.doesNotMatch(pageSrc, /Powered by \{BRAND_NAME\}/);
  const shareLogoCmp = read("app/components/partner/PartnerSharePageLogo.tsx");
  assert.match(shareLogoCmp, /object-contain/);
  assert.match(shareLogoCmp, /justify-center/);
  assert.match(shareLogoCmp, /w-fit/);
  assert.match(shareLogoCmp, /max-w-\[170px\]/);
  assert.match(shareLogoCmp, /max-h-\[70px\]/);
  assert.match(shareLogoCmp, /onError/);
  assert.match(shareLogoCmp, /BRAND_LOGO_LIGHT_PUBLIC_PATH/);
  assert.doesNotMatch(shareLogoCmp, /object-cover|aspect-square/);
  assert.doesNotMatch(shareLogoCmp, /sm:max-w-\[180px\]|w-full min-w-0 max-w-\[160px\]/);
  assert.doesNotMatch(shareLogoCmp, /from ["']@\/app\/lib\/db["']/);
  assert.doesNotMatch(shareLogoCmp, /uploadPartnerShareLogo|prisma\./);
  assert.match(validateSrc, /export function sharePoweredByLabel/);
  assert.match(layoutSrc, /index:\s*false/);
  assert.match(layoutSrc, /referrer:\s*["']no-referrer["']/);
  assert.match(headersSrc, /SHARE_SURFACE_HEADERS/);
  assert.match(tokenSrc, /hasActivePartnerEsimShareToken/);
  assert.match(tokenSrc, /createHash\(["']sha256["']\)/);
  assert.match(tokenSrc, /no time-based expiry/);
  assert.doesNotMatch(tokenSrc, /rawToken.*prisma|prisma.*rawToken/);
  assert.doesNotMatch(customerUsage, /partnerShareBranding|shareCompanyName/);
  assert.doesNotMatch(customerInstall, /partnerShareBranding|shareCompanyName/);
  assert.doesNotMatch(accountPage, /shareCompanyName|PartnerShareBrandingForm/);
  assert.match(pkg, /"qa:partner-share-branding"/);
  assert.match(pkg, /"@vercel\/blob"/);
  assert.doesNotMatch(pkg, /@aws-sdk\/client-s3|cloudinary|uploadthing/);
  assert.match(headersSrc, /public\.blob\.vercel-storage\.com/);
  assert.match(linkSrc, /createPartnerEsimShareToken/);
  assert.match(linkSrc, /revokePartnerEsimShareToken/);

  const sources = buildNextConfigHeaderSources({ NODE_ENV: "development" });
  const shareHeaders = sources.find((s) => s.source === "/share/:path*");
  assert.ok(shareHeaders);
  assert.ok(
    shareHeaders.headers.some(
      (h) => h.key === "Referrer-Policy" && h.value === "no-referrer"
    )
  );
  assert.ok(
    shareHeaders.headers.some(
      (h) =>
        h.key === "X-Robots-Tag" &&
        h.value.includes("noindex") &&
        h.value.includes("noarchive")
    )
  );
  assert.ok(
    shareHeaders.headers.some(
      (h) => h.key === "Cache-Control" && h.value === PRIVATE_NO_STORE_VALUE
    )
  );
  console.log("PASS T_U_share_headers_and_noreferrer_actions");

  const partnerAId = "partnerAid012345678901234567";
  const partnerBId = "partnerBid012345678901234567";
  const officialUrl = `https://ce0rcu23vrrdzqap.public.blob.vercel-storage.com/partner-logos/${partnerAId}/abcd1234efgh5678.webp`;
  const suffixedUrl = `https://ce0rcu23vrrdzqap.public.blob.vercel-storage.com/partner-logos/${partnerAId}/abcd1234efgh5678-NoOVGDVcqSPc7VY.webp`;
  const namedStoreUrl = `https://map-esim-partner-logos.public.blob.vercel-storage.com/partner-logos/${partnerAId}/abcd1234efgh5678.webp`;
  assert.equal(isVercelBlobPublicHost("ce0rcu23vrrdzqap.public.blob.vercel-storage.com"), true);
  assert.equal(parsePartnerLogoBlobUrl(officialUrl)?.partnerId, partnerAId);
  assert.equal(parsePartnerLogoBlobUrl(`${officialUrl}?download=1`)?.partnerId, partnerAId);
  assert.equal(parsePartnerLogoBlobUrl(suffixedUrl)?.partnerId, partnerAId);
  assert.equal(parsePartnerLogoBlobUrl(namedStoreUrl)?.partnerId, partnerAId);
  assert.equal(isOwnedPartnerLogoBlobUrl(officialUrl, partnerAId), true);
  assert.equal(isOwnedPartnerLogoBlobUrl(suffixedUrl, partnerAId), true);
  assert.equal(isOwnedPartnerLogoBlobUrl(officialUrl, partnerBId), false);
  assert.equal(
    isOwnedPartnerLogoBlobUrl(
      `https://ce0rcu23vrrdzqap.public.blob.vercel-storage.com/partner-logos/${partnerBId}/abcd1234efgh5678.webp`,
      partnerAId
    ),
    false
  );
  assert.equal(
    parsePartnerLogoBlobUrl(
      "https://ce0rcu23vrrdzqap.public.blob.vercel-storage.com.evil.example/partner-logos/partnerAid012345678901234567/abcd1234efgh5678.webp"
    ),
    null
  );
  assert.equal(
    parsePartnerLogoBlobUrl(
      `https://map-esim.vercel.app/partner-logos/${partnerAId}/abcd1234efgh5678.webp`
    ),
    null
  );
  assert.equal(
    parsePartnerLogoBlobUrl(
      `https://ce0rcu23vrrdzqap.private.blob.vercel-storage.com/partner-logos/${partnerAId}/abcd1234efgh5678.webp`
    ),
    null
  );
  assert.equal(
    parsePartnerLogoBlobUrl(`https://cdn.example.com/partner-logos/${partnerAId}/abcd1234efgh5678.webp`),
    null
  );
  const safeMeta = safePartnerLogoStageMeta({
    stage: PARTNER_LOGO_STAGE.BLOB_PUT_FAILED,
    partnerId: partnerAId,
    contentType: "image/webp",
    inputBytes: 16558,
    processedBytes: 4000,
    pathnamePrefix: "partner-logos",
  });
  const safeJson = JSON.stringify(safeMeta);
  assert.equal(safeMeta.stage, PARTNER_LOGO_STAGE.BLOB_PUT_FAILED);
  assert.doesNotMatch(safeJson, /BLOB_READ_WRITE_TOKEN|vercel_blob_rw|exception|ECONN|secret/i);
  console.log("PASS D_E_F_G_blob_url_ownership_and_safe_stage_meta");

  const mapLogoBytes = readFileSync(
    path.join(__dirname, "..", "public", "brand", "map-esim-logo.png")
  );
  assert.ok(mapLogoBytes.length > 0 && mapLogoBytes.length <= PARTNER_LOGO_MAX_BYTES);
  const mapPrepared = await preparePartnerLogoWebp({
    bytes: mapLogoBytes,
    filename: "map-esim-logo.png",
  });
  assert.equal(mapPrepared.ok, true);
  if (mapPrepared.ok) {
    assert.equal(mapPrepared.logo.contentType, "image/webp");
    const mapMeta = await sharp(mapPrepared.logo.body).metadata();
    assert.equal(mapMeta.format, "webp");
    assert.ok((mapMeta.width ?? 0) > 0 && (mapMeta.width ?? 0) <= 1024);
    assert.ok((mapMeta.height ?? 0) > 0 && (mapMeta.height ?? 0) <= 1024);
  }
  console.log("PASS MAP_logo_fixture_sharp_rotate_resize_webp");

  expectInvalid({ supportEmail: "not-an-email" }, "INVALID_EMAIL");
  expectInvalid({ websiteUrl: "http://example.com" }, "INVALID_WEBSITE");
  expectInvalid({ websiteUrl: "javascript:alert(1)" }, "INVALID_WEBSITE");
  expectInvalid({ buttonBackground: "red" }, "INVALID_COLOR");
  expectInvalid({ buttonBackground: "#84ff00" }, "INVALID_COLOR");
  expectInvalid(
    { buttonBackground: "#ffffff", buttonTextColor: "#fefefe" },
    "LOW_CONTRAST"
  );
  expectInvalid({ logoUrl: "javascript:alert(1)" }, "INVALID_LOGO");
  expectInvalid({ logoUrl: "http://evil.example/logo.png" }, "INVALID_LOGO");
  expectInvalid({ logoUrl: "https://evil.example/not-an-image" }, "INVALID_LOGO");
  const name30 = "A".repeat(SHARE_COMPANY_NAME_MAX);
  const name31 = "A".repeat(SHARE_COMPANY_NAME_MAX + 1);
  assert.equal(parsePartnerShareBrandingInput({ companyName: name30 }).companyName, name30);
  try {
    parsePartnerShareBrandingInput({ companyName: name31 });
    throw new Error("expected INVALID_NAME");
  } catch (err) {
    assert.ok(err instanceof PartnerShareBrandingError);
    assert.equal(err.code, "INVALID_NAME");
    assert.equal(err.message, SHARE_COMPANY_NAME_TOO_LONG);
  }
  assert.equal(
    sharePoweredByLabel(name31),
    `Powered by ${name31}`
  );
  console.log("PASS D_E_F_G_invalid_inputs_rejected");

  const remoteLogo = parsePartnerShareBrandingInput({
    logoUrl: "https://cdn.example.com/logo.png",
  });
  const publicRemote = publicShareBrandingDto(remoteLogo);
  assert.equal(publicRemote.logoUrl, null);
  const mapLogo = parsePartnerShareBrandingInput({
    logoUrl: "https://mapesim.com/brand/map-esim-logo-dark.svg",
  });
  assert.equal(
    publicShareBrandingDto(mapLogo).logoUrl,
    "/brand/map-esim-logo-dark.svg"
  );
  const blobLogoUrl =
    "https://map-esim-partner-logos.public.blob.vercel-storage.com/partner-logos/partnerAid012345678901234567/abcd1234efgh5678.webp";
  assert.equal(publicShareLogoSrc(blobLogoUrl), blobLogoUrl);
  assert.equal(publicShareLogoSrc("https://cdn.example.com/logo.png"), null);
  assert.equal(
    isOwnedPartnerLogoBlobUrl(blobLogoUrl, "partnerAid012345678901234567"),
    true
  );
  assert.equal(
    isOwnedPartnerLogoBlobUrl(blobLogoUrl, "partnerBid012345678901234567"),
    false
  );

  const shareUrl = buildAbsoluteShareUrl(
    "/share/abcdefghijklmnopqrstuvwxyz0123456789ABCDE",
    "https://mapesim.com"
  );
  assert.equal(
    shareUrl,
    "https://mapesim.com/share/abcdefghijklmnopqrstuvwxyz0123456789ABCDE"
  );
  assertSafeSharePayload(shareUrl);
  const pakistanFields = {
    shareUrl,
    destination: "Pakistan",
    planName: "100MB 7Days",
    dataAllowance: "102 MB",
    validity: "7 Days",
  };
  const waText = buildPartnerShareWhatsAppText(pakistanFields);
  assert.equal(
    waText,
    `Here are the eSIM QR details for Pakistan 100MB 7Days (102 MB, 7 Days):\n${shareUrl}`
  );
  assert.equal(countShareUrlOccurrences(waText, shareUrl), 1);
  assert.doesNotMatch(waText, /—/);
  assert.doesNotMatch(waText, /iccid|LPA:|smdp|wallet|discount|activation code|provider|undefined|null/i);
  const waHref = buildPartnerWhatsAppShareHref(pakistanFields);
  assert.match(waHref, /^https:\/\/wa\.me\/\?text=/);
  const decodedWa = decodeURIComponent(new URL(waHref).searchParams.get("text") || "");
  assert.equal(decodedWa, waText);
  assert.equal(countShareUrlOccurrences(decodedWa, shareUrl), 1);
  const web = buildPartnerWebSharePayload(pakistanFields);
  assert.equal(web.url, shareUrl);
  assert.equal(
    web.text,
    "Here are the eSIM QR details for Pakistan 100MB 7Days (102 MB, 7 Days):"
  );
  assert.equal(web.text.includes(shareUrl), false);
  assert.equal(countShareUrlOccurrences(`${web.text}\n${web.url}`, shareUrl), 1);
  assertSafeSharePayload(web.text);
  assertSafeSharePayload(web.title);
  assertSafeSharePayload(web.url);
  assert.doesNotMatch(web.text, /iccid|LPA:|smdp|wallet|discount|activation code/i);

  const omitted = buildPartnerShareWhatsAppText({
    shareUrl,
    destination: "Pakistan",
    planName: "Not available",
    dataAllowance: null,
    validity: "undefined",
  });
  assert.equal(omitted, `Here are the eSIM QR details for Pakistan:\n${shareUrl}`);
  assert.doesNotMatch(omitted, /Not available|undefined|null/);
  assert.equal(countShareUrlOccurrences(omitted, shareUrl), 1);

  const fallback = buildPartnerShareWhatsAppText({ shareUrl });
  assert.equal(fallback, `Here are the eSIM QR details:\n${shareUrl}`);

  const strippedSecrets = buildPartnerShareWhatsAppText({
    shareUrl,
    destination: "Pakistan",
    planName: SAMPLE_ICCID,
    dataAllowance: QA_LPA,
    validity: "7 Days",
  });
  assert.equal(
    strippedSecrets,
    `Here are the eSIM QR details for Pakistan (7 Days):\n${shareUrl}`
  );
  assert.doesNotMatch(strippedSecrets, /8900000000000000777|LPA:|iccid/i);
  console.log("PASS P_Q_R_copy_whatsapp_webshare_payloads");

  assert.equal(sharePoweredByLabel("Rana Travel"), "Powered by Rana Travel");
  assert.equal(sharePoweredByLabel("ABC Tours"), "Powered by ABC Tours");
  assert.equal(sharePoweredByLabel(null), "Powered by MAP eSIM");
  assert.equal(sharePoweredByLabel(""), "Powered by MAP eSIM");
  assert.equal(sharePoweredByLabel("   "), "Powered by MAP eSIM");
  assert.equal(
    sharePoweredByLabel("<Rana Travel>"),
    "Powered by Rana Travel"
  );
  console.log("PASS R_S_powered_by_company_name_and_map_fallback");

  const prisma = new PrismaClient();
  const stamp = Date.now();
  const pw = await hashPassword(`Uat${randomBytes(18).toString("base64url")}!9`);

  try {
    const partnerA = await prisma.user.create({
      data: {
        name: "P3 Brand Partner A",
        email: `p3.brand.a.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 1000,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 80_000, version: 0 } },
          },
        },
      },
      select: { id: true, partnerProfile: { select: { id: true } } },
    });
    const partnerB = await prisma.user.create({
      data: {
        name: "P3 Brand Partner B",
        email: `p3.brand.b.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 500,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 10_000, version: 0 } },
          },
        },
      },
      select: { id: true, partnerProfile: { select: { id: true } } },
    });
    const disabled = await prisma.user.create({
      data: {
        name: "P3 Brand Disabled",
        email: `p3.brand.d.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 0,
            discountVersion: 1,
            disabledAt: new Date(),
            walletAccount: { create: { balanceCents: 0, version: 0 } },
          },
        },
      },
      select: { id: true },
    });

    const saved = await updatePartnerShareBranding(partnerA.id, {
      companyName: "Atlas Travel",
      supportEmail: "help@atlas-travel.example",
      websiteUrl: "https://atlas-travel.example",
      logoUrl: "https://mapesim.com/brand/map-esim-logo-dark.svg",
      buttonBackground: "#84ff00",
      buttonTextColor: "#102018",
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) throw new Error("expected save");
    assert.equal(saved.branding.companyName, "Atlas Travel");
    const loaded = await getPartnerShareBranding(partnerA.id);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) throw new Error("expected load");
    assert.equal(loaded.branding.supportEmail, "help@atlas-travel.example");
    console.log("PASS A_partner_can_save_own_branding");

    const otherBefore = await getPartnerShareBranding(partnerB.id);
    assert.equal(otherBefore.ok, true);
    if (!otherBefore.ok) throw new Error("expected B load");
    assert.equal(otherBefore.branding.companyName, null);
    const aAgain = await updatePartnerShareBranding(partnerA.id, {
      companyName: "Atlas Travel",
      supportEmail: "help@atlas-travel.example",
      websiteUrl: "https://atlas-travel.example",
      logoUrl: "https://mapesim.com/brand/map-esim-logo-dark.svg",
      buttonBackground: "#84ff00",
      buttonTextColor: "#102018",
    });
    assert.equal(aAgain.ok, true);
    const otherAfter = await getPartnerShareBranding(partnerB.id);
    assert.equal(otherAfter.ok, true);
    if (!otherAfter.ok) throw new Error("expected B after");
    assert.equal(otherAfter.branding.companyName, null);
    console.log("PASS B_cannot_edit_another_partner_branding");

    const disabledUpdate = await updatePartnerShareBranding(disabled.id, {
      companyName: "Nope",
    });
    assert.equal(disabledUpdate.ok, false);
    console.log("PASS C_disabled_partner_cannot_update");

    const badEmail = await updatePartnerShareBranding(partnerA.id, {
      supportEmail: "bad",
    });
    assert.equal(badEmail.ok, false);
    const badWeb = await updatePartnerShareBranding(partnerA.id, {
      websiteUrl: "http://atlas-travel.example",
    });
    assert.equal(badWeb.ok, false);
    const badColor = await updatePartnerShareBranding(partnerA.id, {
      buttonBackground: "green",
      buttonTextColor: "#000000",
    });
    assert.equal(badColor.ok, false);
    const badLogo = await updatePartnerShareBranding(partnerA.id, {
      logoUrl: "https://evil.example/track?x=1",
    });
    assert.equal(badLogo.ok, false);
    console.log("PASS D_E_F_G_server_rejects_invalid");

    const orderA = await seedCompletedOrder(prisma, {
      partnerId: partnerA.partnerProfile!.id,
      email: `p3.brand.orda.${stamp}@example.invalid`,
      tag: `a${stamp}`,
    });
    const orderB = await seedCompletedOrder(prisma, {
      partnerId: partnerB.partnerProfile!.id,
      email: `p3.brand.ordb.${stamp}@example.invalid`,
      tag: `b${stamp}`,
    });

    const createdA = await createPartnerEsimShareToken({
      partnerUserId: partnerA.id,
      orderId: orderA,
    });
    assert.equal(createdA.ok, true);
    if (!createdA.ok) throw new Error("expected token A");
    const createdB = await createPartnerEsimShareToken({
      partnerUserId: partnerB.id,
      orderId: orderB,
    });
    assert.equal(createdB.ok, true);
    if (!createdB.ok) throw new Error("expected token B");

    const fetchBroker = async () => ({
      iccid: SAMPLE_ICCID,
      lpa: QA_LPA,
    });
    const pageA = await getPartnerEsimSharePageData(createdA.rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    assert.ok(pageA);
    assert.equal(pageA.branding.companyName, "Atlas Travel");
    assert.equal(pageA.branding.supportEmail, "help@atlas-travel.example");
    assert.equal(pageA.branding.websiteUrl, "https://atlas-travel.example/");
    assert.equal(pageA.branding.logoUrl, "/brand/map-esim-logo-dark.svg");
    assert.equal(pageA.branding.buttonBackground, "#84ff00");
    assert.equal(pageA.branding.buttonTextColor, "#102018");
    assert.equal(sharePoweredByLabel(pageA.branding.companyName), "Powered by Atlas Travel");
    assertNoPublicSecrets(pageA, createdA.rawToken);
    assert.deepEqual(Object.keys(pageA.branding).sort(), [
      "buttonBackground",
      "buttonTextColor",
      "companyName",
      "logoUrl",
      "supportEmail",
      "websiteUrl",
    ]);
    console.log("PASS H_V_branded_allowlist_dto");

    const pageB = await getPartnerEsimSharePageData(createdB.rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    assert.ok(pageB);
    assert.equal(pageB.branding.companyName, null);
    assert.equal(pageB.branding.logoUrl, null);
    assert.equal(pageB.branding.buttonBackground, null);
    assert.equal(sharePoweredByLabel(pageB.branding.companyName), "Powered by MAP eSIM");
    console.log("PASS I_unbranded_falls_back_to_map");

    assert.doesNotMatch(customerUsage, /shareCompanyName/);
    assert.doesNotMatch(accountPage, /Share Branding/);
    console.log("PASS J_customer_share_unaffected");

    const afterEdit = await updatePartnerShareBranding(partnerA.id, {
      companyName: "Atlas Travel Updated",
      supportEmail: "help@atlas-travel.example",
      websiteUrl: "https://atlas-travel.example",
      logoUrl: "https://mapesim.com/brand/map-esim-logo-dark.svg",
      buttonBackground: "#84ff00",
      buttonTextColor: "#102018",
    });
    assert.equal(afterEdit.ok, true);
    const stillValid = await getPartnerEsimSharePageData(createdA.rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    assert.ok(stillValid);
    assert.equal(stillValid.branding.companyName, "Atlas Travel Updated");
    console.log("PASS K_existing_token_valid_after_branding_edit");

    const revoked = await revokePartnerEsimShareToken({
      partnerUserId: partnerA.id,
      orderId: orderA,
    });
    assert.equal(revoked.ok, true);
    const afterRevoke = await getPartnerEsimSharePageData(createdA.rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    assert.equal(afterRevoke, null);
    console.log("PASS L_O_revoke_still_invalidates");

    assert.equal(
      await hasActivePartnerEsimShareToken({
        partnerUserId: partnerA.id,
        orderId: orderA,
      }),
      false
    );
    const createdAgain = await createPartnerEsimShareToken({
      partnerUserId: partnerA.id,
      orderId: orderA,
    });
    assert.equal(createdAgain.ok, true);
    if (!createdAgain.ok) throw new Error("expected recreate");
    assert.equal(
      await hasActivePartnerEsimShareToken({
        partnerUserId: partnerA.id,
        orderId: orderA,
      }),
      true
    );
    const pageNew = await getPartnerEsimSharePageData(createdAgain.rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    assert.ok(pageNew);
    console.log("PASS M_create_share_link_works");

    const rotated = await createPartnerEsimShareToken({
      partnerUserId: partnerA.id,
      orderId: orderA,
    });
    assert.equal(rotated.ok, true);
    if (!rotated.ok) throw new Error("expected rotate");
    const oldGone = await getPartnerEsimSharePageData(createdAgain.rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    const newOk = await getPartnerEsimSharePageData(rotated.rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    assert.equal(oldGone, null);
    assert.ok(newOk);
    console.log("PASS N_regenerate_invalidates_old");

    const png = await rasterBytes("png");
    const jpeg = await rasterBytes("jpeg");
    const webp = await rasterBytes("webp");
    const aStore = mockBlobStore();
    const pngUp = await uploadPartnerShareLogo({
      partnerUserId: partnerA.id,
      bytes: png,
      filename: "logo.png",
      store: aStore.store,
    });
    assert.equal(pngUp.ok, true);
    if (!pngUp.ok) throw new Error("png upload");
    assert.match(pngUp.branding.logoUrl ?? "", /partner-logos\//);
    assert.match(pngUp.branding.logoUrl ?? "", /\.webp/);
    const prepared = await preparePartnerLogoWebp({ bytes: png, filename: "logo.png" });
    assert.equal(prepared.ok, true);
    if (prepared.ok) {
      assert.equal(prepared.logo.contentType, "image/webp");
      const outMeta = await sharp(prepared.logo.body).metadata();
      assert.equal(outMeta.format, "webp");
    }
    console.log("PASS A_K_L_valid_png_reencoded_webp_saved");

    const jpegUp = await uploadPartnerShareLogo({
      partnerUserId: partnerA.id,
      bytes: jpeg,
      filename: "logo.jpg",
      store: aStore.store,
    });
    assert.equal(jpegUp.ok, true);
    const webpUp = await uploadPartnerShareLogo({
      partnerUserId: partnerA.id,
      bytes: webp,
      filename: "logo.webp",
      store: aStore.store,
    });
    assert.equal(webpUp.ok, true);
    if (!webpUp.ok) throw new Error("webp upload");
    console.log("PASS B_C_jpeg_webp_accepted");

    const malformed = await uploadPartnerShareLogo({
      partnerUserId: partnerA.id,
      bytes: Buffer.from("not-an-image"),
      filename: "logo.png",
      store: aStore.store,
    });
    assert.equal(malformed.ok, false);
    const svg = await uploadPartnerShareLogo({
      partnerUserId: partnerA.id,
      bytes: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'
      ),
      filename: "logo.svg",
      store: aStore.store,
    });
    assert.equal(svg.ok, false);
    const oversized = await uploadPartnerShareLogo({
      partnerUserId: partnerA.id,
      bytes: Buffer.alloc(PARTNER_LOGO_MAX_BYTES + 1, 1),
      filename: "logo.png",
      store: aStore.store,
    });
    assert.equal(oversized.ok, false);
    const huge = await sharp({
      create: {
        width: 4100,
        height: 32,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    const hugeUp = await uploadPartnerShareLogo({
      partnerUserId: partnerA.id,
      bytes: huge,
      filename: "huge.png",
      store: aStore.store,
    });
    assert.equal(hugeUp.ok, false);
    console.log("PASS D_E_F_G_invalid_logo_bytes_rejected");

    const beforeB = await getPartnerShareBranding(partnerB.id);
    assert.equal(beforeB.ok, true);
    const cross = await uploadPartnerShareLogo({
      partnerUserId: partnerB.id,
      bytes: png,
      filename: "logo.png",
      store: aStore.store,
    });
    assert.equal(cross.ok, true);
    if (!cross.ok) throw new Error("b upload");
    assert.equal(
      (cross.branding.logoUrl ?? "").includes(partnerA.partnerProfile!.id),
      false
    );
    assert.equal(
      (cross.branding.logoUrl ?? "").includes(partnerB.partnerProfile!.id),
      true
    );
    const disabledLogo = await uploadPartnerShareLogo({
      partnerUserId: disabled.id,
      bytes: png,
      filename: "logo.png",
      store: aStore.store,
    });
    assert.equal(disabledLogo.ok, false);
    console.log("PASS H_I_J_cross_partner_path_and_disabled");

    const pageLogo = await getPartnerEsimSharePageData(rotated.rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    assert.ok(pageLogo);
    assert.equal(pageLogo.branding.logoUrl, webpUp.branding.logoUrl);
    assert.equal(sharePoweredByLabel(pageLogo.branding.companyName).startsWith("Powered by"), true);
    console.log("PASS M_V_share_page_renders_uploaded_logo");

    const replaceStore = mockBlobStore();
    const firstReplace = await uploadPartnerShareLogo({
      partnerUserId: partnerA.id,
      bytes: png,
      filename: "one.png",
      store: replaceStore.store,
    });
    assert.equal(firstReplace.ok, true);
    if (!firstReplace.ok) throw new Error("first replace");
    const oldLogo = firstReplace.branding.logoUrl;
    const secondReplace = await uploadPartnerShareLogo({
      partnerUserId: partnerA.id,
      bytes: jpeg,
      filename: "two.jpg",
      store: replaceStore.store,
    });
    assert.equal(secondReplace.ok, true);
    if (!secondReplace.ok) throw new Error("second replace");
    assert.notEqual(secondReplace.branding.logoUrl, oldLogo);
    assert.equal(replaceStore.events[0], "put");
    assert.equal(replaceStore.events.includes("del"), true);
    assert.equal(replaceStore.dels.includes(oldLogo ?? ""), true);
    console.log("PASS N_replace_deletes_old_after_success");

    const failStore: PartnerLogoBlobStore = {
      async put() {
        throw new Error("blob_down");
      },
      async del() {
        throw new Error("should_not_delete");
      },
    };
    const beforeFail = await getPartnerShareBranding(partnerA.id);
    assert.equal(beforeFail.ok, true);
    if (!beforeFail.ok) throw new Error("before fail");
    const failed = await uploadPartnerShareLogo({
      partnerUserId: partnerA.id,
      bytes: png,
      filename: "fail.png",
      store: failStore,
    });
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.equal(failed.stage, PARTNER_LOGO_STAGE.BLOB_PUT_FAILED);
      assert.equal(failed.error, PARTNER_LOGO_UNAVAILABLE);
      assert.equal(failed.error.includes("blob_down"), false);
    }
    const afterFail = await getPartnerShareBranding(partnerA.id);
    assert.equal(afterFail.ok, true);
    if (!afterFail.ok) throw new Error("after fail");
    assert.equal(afterFail.branding.logoUrl, beforeFail.branding.logoUrl);
    console.log("PASS O_failed_replace_keeps_old_logo");

    const brokenPng = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("not-a-png"),
    ]);
    const sharpFail = await uploadPartnerShareLogo({
      partnerUserId: partnerA.id,
      bytes: brokenPng,
      filename: "broken.png",
      store: aStore.store,
    });
    assert.equal(sharpFail.ok, false);
    if (!sharpFail.ok) {
      assert.ok(
        sharpFail.stage === PARTNER_LOGO_STAGE.INVALID_IMAGE ||
          sharpFail.stage === PARTNER_LOGO_STAGE.IMAGE_PROCESS_FAILED
      );
      assert.ok(
        sharpFail.error === PARTNER_LOGO_INVALID ||
          sharpFail.error === PARTNER_LOGO_UNAVAILABLE
      );
      assert.equal(sharpFail.error.includes("not-a-png"), false);
    }
    console.log("PASS A_sharp_failure_safe_ui");

    const savedToken = process.env.BLOB_READ_WRITE_TOKEN;
    const savedStoreId = process.env.BLOB_STORE_ID;
    const savedOidc = process.env.VERCEL_OIDC_TOKEN;
    try {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      delete process.env.BLOB_STORE_ID;
      delete process.env.VERCEL_OIDC_TOKEN;
      assert.equal(isPartnerLogoBlobWriteConfigured(), false);
      const missingCred = await uploadPartnerShareLogo({
        partnerUserId: partnerA.id,
        bytes: png,
        filename: "noconfig.png",
      });
      assert.equal(missingCred.ok, false);
      if (!missingCred.ok) {
        assert.equal(missingCred.stage, PARTNER_LOGO_STAGE.BLOB_CONFIG_MISSING);
        assert.equal(missingCred.error, PARTNER_LOGO_UNAVAILABLE);
      }
    } finally {
      if (savedToken) process.env.BLOB_READ_WRITE_TOKEN = savedToken;
      else delete process.env.BLOB_READ_WRITE_TOKEN;
      if (savedStoreId) process.env.BLOB_STORE_ID = savedStoreId;
      else delete process.env.BLOB_STORE_ID;
      if (savedOidc) process.env.VERCEL_OIDC_TOKEN = savedOidc;
      else delete process.env.VERCEL_OIDC_TOKEN;
    }
    console.log("PASS B_missing_blob_credential");

    const rejectStore: PartnerLogoBlobStore = {
      async put() {
        return {
          url: "https://cdn.example.com/partner-logos/not-ours/logo.webp",
        };
      },
      async del() {
        throw new Error("must_not_delete_foreign_url");
      },
    };
    const rejectedUrl = await uploadPartnerShareLogo({
      partnerUserId: partnerA.id,
      bytes: png,
      filename: "reject.png",
      store: rejectStore,
    });
    assert.equal(rejectedUrl.ok, false);
    if (!rejectedUrl.ok) {
      assert.equal(rejectedUrl.stage, PARTNER_LOGO_STAGE.BLOB_URL_REJECTED);
      assert.equal(rejectedUrl.error, PARTNER_LOGO_UNAVAILABLE);
    }
    console.log("PASS D_malformed_blob_url_rejected");

    const orphanStore = mockBlobStore();
    const origUpdate = appPrisma.partnerProfile.update.bind(appPrisma.partnerProfile);
    let forceDbFail = true;
    try {
      (
        appPrisma.partnerProfile as { update: typeof appPrisma.partnerProfile.update }
      ).update = (async (args: Parameters<typeof origUpdate>[0]) => {
        const data =
          args && typeof args === "object"
            ? (args as { data?: { shareLogoUrl?: unknown } }).data
            : undefined;
        if (forceDbFail && data && "shareLogoUrl" in data && data.shareLogoUrl) {
          forceDbFail = false;
          throw new Error("qa_forced_db_fail_SECRET");
        }
        return origUpdate(args as never);
      }) as unknown as typeof origUpdate;
      const dbFail = await uploadPartnerShareLogo({
        partnerUserId: partnerA.id,
        bytes: png,
        filename: "dbfail.png",
        store: orphanStore.store,
      });
      assert.equal(dbFail.ok, false);
      if (!dbFail.ok) {
        assert.equal(dbFail.stage, PARTNER_LOGO_STAGE.PROFILE_UPDATE_FAILED);
        assert.equal(dbFail.error, PARTNER_LOGO_UNAVAILABLE);
        assert.equal(dbFail.error.includes("qa_forced_db_fail_SECRET"), false);
      }
    } finally {
      (
        appPrisma.partnerProfile as { update: typeof appPrisma.partnerProfile.update }
      ).update = origUpdate;
    }
    assert.equal(orphanStore.events.includes("put"), true);
    assert.equal(orphanStore.events.includes("del"), true);
    const afterDbFail = await getPartnerShareBranding(partnerA.id);
    assert.equal(afterDbFail.ok, true);
    if (!afterDbFail.ok) throw new Error("after db fail");
    assert.notEqual(afterDbFail.branding.logoUrl, orphanStore.puts.at(-1)?.url);
    console.log("PASS H_db_update_failure_orphan_cleanup");

    const historic = "https://cdn.example.com/partner-logo.png";
    await prisma.partnerProfile.update({
      where: { id: partnerA.partnerProfile!.id },
      data: { shareLogoUrl: historic },
    });
    const historicStore = mockBlobStore();
    const removedHistoric = await removePartnerShareLogo({
      partnerUserId: partnerA.id,
      store: historicStore.store,
    });
    assert.equal(removedHistoric.ok, true);
    if (!removedHistoric.ok) throw new Error("remove historic");
    assert.equal(removedHistoric.branding.logoUrl, null);
    assert.equal(historicStore.dels.length, 0);
    const pageFallback = await getPartnerEsimSharePageData(rotated.rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    assert.ok(pageFallback);
    assert.equal(pageFallback.branding.logoUrl, null);
    console.log("PASS P_Q_R_remove_clears_and_skips_arbitrary_url_delete");

    const bUrl = cross.branding.logoUrl;
    assert.ok(bUrl);
    const stealStore = mockBlobStore();
    await prisma.partnerProfile.update({
      where: { id: partnerA.partnerProfile!.id },
      data: { shareLogoUrl: bUrl },
    });
    const steal = await removePartnerShareLogo({
      partnerUserId: partnerA.id,
      store: stealStore.store,
    });
    assert.equal(steal.ok, true);
    assert.equal(stealStore.dels.includes(bUrl), false);
    const bStill = await getPartnerShareBranding(partnerB.id);
    assert.equal(bStill.ok, true);
    if (!bStill.ok) throw new Error("b still");
    assert.equal(bStill.branding.logoUrl, bUrl);
    console.log("PASS S_cannot_delete_other_partner_blob");

    const audits = await prisma.auditLog.findMany({
      where: { actorUserId: partnerA.id },
    });
    const auditJson = JSON.stringify(audits);
    assert.match(auditJson, /partner\.share_branding_updated/);
    assert.match(auditJson, /partner\.share_logo_updated/);
    assert.match(auditJson, /partner\.share_logo_upload_failed/);
    assert.match(auditJson, /PARTNER_LOGO_BLOB_PUT_FAILED/);
    assert.match(auditJson, /PARTNER_LOGO_BLOB_CONFIG_MISSING/);
    assert.match(auditJson, /PARTNER_LOGO_PROFILE_UPDATE_FAILED/);
    assert.equal(auditJson.includes("qa_forced_db_fail_SECRET"), false);
    assert.equal(auditJson.includes("blob_down"), false);
    assert.equal(auditJson.includes("must_not_delete_foreign_url"), false);
    assert.equal(auditJson.includes(createdA.rawToken), false);
    assert.equal(auditJson.includes(createdAgain.rawToken), false);
    assert.equal(auditJson.includes(rotated.rawToken), false);
    assert.equal(auditJson.includes(SAMPLE_ICCID), false);
    assert.doesNotMatch(auditJson, /BLOB_READ_WRITE_TOKEN|vercel_blob_rw/i);
    assert.doesNotMatch(auditJson, /<svg|data:image/);
    console.log("PASS S_T_U_W_no_raw_token_or_blob_secret_in_audit");

    console.log("ALL_QA_PASSED=partner-share-branding");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
