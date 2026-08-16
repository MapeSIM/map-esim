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
} from "../app/lib/partner/partnerShareBrandingValidate";
import {
  assertSafeSharePayload,
  buildAbsoluteShareUrl,
  buildPartnerShareWhatsAppText,
  buildPartnerWebSharePayload,
  buildPartnerWhatsAppShareHref,
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
  const customerUsage = read("app/lib/orders/customerEsimUsage.ts");
  const customerInstall = read("app/lib/orders/customerOrderInstall.ts");
  const accountPage = read("app/account/page.tsx");
  const pkg = read("package.json");

  assert.match(brandingSrc, /import ["']server-only["']/);
  assert.match(brandingSrc, /partner\.share_branding_updated/);
  assert.match(brandingSrc, /changedFields/);
  assert.doesNotMatch(brandingSrc, /logoContents|rawToken|iccid|providerCost|discountBps/);
  assert.match(actionsSrc, /void formData\.get\(["']partnerId["']\)/);
  assert.match(actionsSrc, /user\.id/);
  assert.match(validateSrc, /SHARE_HEX_RE/);
  assert.match(validateSrc, /https:/);
  assert.match(copySrc, /wa\.me\/\?text=/);
  assert.match(controlsSrc, /Regenerate Share Link/);
  assert.match(controlsSrc, /Create Share Link/);
  assert.match(controlsSrc, /Revoke Share Link/);
  assert.match(controlsSrc, /Copy Link/);
  assert.match(controlsSrc, /navigator\.share/);
  assert.match(controlsSrc, /window\.location\.origin/);
  assert.match(formSrc, /Save Branding/);
  assert.match(profileSrc, /PartnerShareBrandingForm/);
  assert.doesNotMatch(profileSrc, /Coming later/);
  assert.match(viewSrc, /Mail Support|Visit Partner Website/);
  assert.match(viewSrc, /noopener noreferrer/);
  assert.match(viewSrc, /referrerPolicy=["']no-referrer["']/);
  assert.doesNotMatch(viewSrc, /navigator\.share|wa\.me/i);
  assert.match(pageSrc, /companyName/);
  assert.match(layoutSrc, /index:\s*false/);
  assert.match(layoutSrc, /referrer:\s*["']no-referrer["']/);
  assert.match(headersSrc, /SHARE_SURFACE_HEADERS/);
  assert.match(tokenSrc, /hasActivePartnerEsimShareToken/);
  assert.match(tokenSrc, /createHash\(["']sha256["']\)/);
  assert.doesNotMatch(tokenSrc, /rawToken.*prisma|prisma.*rawToken/);
  assert.doesNotMatch(customerUsage, /partnerShareBranding|shareCompanyName/);
  assert.doesNotMatch(customerInstall, /partnerShareBranding|shareCompanyName/);
  assert.doesNotMatch(accountPage, /shareCompanyName|PartnerShareBrandingForm/);
  assert.match(pkg, /"qa:partner-share-branding"/);
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

  const shareUrl = buildAbsoluteShareUrl(
    "/share/abcdefghijklmnopqrstuvwxyz0123456789ABCDE",
    "http://127.0.0.1:3005"
  );
  assert.equal(
    shareUrl,
    "http://127.0.0.1:3005/share/abcdefghijklmnopqrstuvwxyz0123456789ABCDE"
  );
  assertSafeSharePayload(shareUrl);
  const waText = buildPartnerShareWhatsAppText({
    shareUrl,
    companyName: "Travel Co",
  });
  assert.match(waText, /Travel Co has shared your eSIM details securely via MAP eSIM/);
  assert.equal(waText.includes(shareUrl), true);
  assert.doesNotMatch(waText, /iccid|LPA:|smdp|wallet|discount/i);
  const waHref = buildPartnerWhatsAppShareHref({ shareUrl, companyName: "Travel Co" });
  assert.match(waHref, /^https:\/\/wa\.me\/\?text=/);
  const web = buildPartnerWebSharePayload({ shareUrl, companyName: "Travel Co" });
  assert.equal(web.url, shareUrl);
  assertSafeSharePayload(web.text);
  assertSafeSharePayload(web.title);
  assert.doesNotMatch(web.text, /iccid|LPA:|smdp|wallet|discount|activation code/i);
  console.log("PASS P_Q_R_copy_whatsapp_webshare_payloads");

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

    const audits = await prisma.auditLog.findMany({
      where: { actorUserId: partnerA.id },
    });
    const auditJson = JSON.stringify(audits);
    assert.match(auditJson, /partner\.share_branding_updated/);
    assert.equal(auditJson.includes(createdA.rawToken), false);
    assert.equal(auditJson.includes(createdAgain.rawToken), false);
    assert.equal(auditJson.includes(rotated.rawToken), false);
    assert.equal(auditJson.includes(SAMPLE_ICCID), false);
    assert.doesNotMatch(auditJson, /<svg|data:image/);
    console.log("PASS S_no_raw_token_or_logo_contents_in_audit");

    console.log("ALL_QA_PASSED=partner-share-branding");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
