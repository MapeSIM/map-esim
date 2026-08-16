/**
 * Isolated LOCAL Partner share-page QA (Phase 3 Slice 2).
 * DATABASE_URL must be 127.0.0.1:55440 / map_esim_partner_phase3_uat.
 * No live VeSIM write. Usage lookup is mocked. Broker payload is injected.
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
import {
  buildIccidPersistFields,
} from "../app/lib/orders/iccidCrypto";
import {
  getPartnerEsimSharePageData,
  getPartnerEsimShareUsage,
  SHARE_STATUS_READY,
} from "../app/lib/partner/partnerEsimShareRead";
import {
  createPartnerEsimShareToken,
  revokePartnerEsimShareToken,
} from "../app/lib/partner/partnerEsimShareToken";
import { SHARE_PAGE_UNAVAILABLE_MESSAGE } from "../app/lib/share/shareSurface";
import { isShareSurfacePath } from "../app/lib/share/shareSurface";
import {
  buildNextConfigHeaderSources,
  PRIVATE_NO_STORE_VALUE,
  SHARE_SURFACE_HEADERS,
} from "../app/lib/security/headers";
import { isTawkEnabledRoute } from "../app/lib/support/tawkRoutes";
import { isWhatsAppSupportRoute } from "../app/lib/support/whatsappSupportShared";

const SAMPLE_ICCID = "8900000000000000123";
const OTHER_ICCID = "8900000000000000456";
const QA_LPA = "LPA:1$rsp.example.com$MATCHING-ID-QA-SHARE";
const QA_SMDP = "rsp.example.com";
const QA_ACTIVATION = "MATCHING-ID-QA-SHARE";

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
  return `pep_spage_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 128);
}

function read(rel: string): string {
  return readFileSync(path.join(__dirname, "..", rel), "utf8");
}

function assertNoPublicSecrets(value: unknown, rawToken?: string): void {
  const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown> | unknown;
  if (clone && typeof clone === "object" && !Array.isArray(clone) && "qrDataUrl" in clone) {
    delete (clone as Record<string, unknown>).qrDataUrl;
  }
  const json = JSON.stringify(clone);
  for (const needle of [
    "discountBps",
    "discountVersion",
    "partnerCharge",
    "partnerChargeCents",
    "providerCost",
    "providerCostCents",
    "balanceCents",
    "tokenHash",
    "passwordHash",
    "customerEmail",
    "walletAccount",
    "providerAmount",
    "reconciliation",
    "partnerId",
    "orderId",
    "purchaseId",
    "providerOrderId",
  ]) {
    assert.equal(json.includes(needle), false, `public DTO leaked ${needle}`);
  }
  if (rawToken) {
    assert.equal(json.includes(rawToken), false, "public DTO leaked raw token");
  }
}

function mockBrokerPayload(): Record<string, unknown> {
  return {
    iccid: SAMPLE_ICCID,
    lpa: QA_LPA,
    smdpAddress: QA_SMDP,
    activationCode: QA_ACTIVATION,
  };
}

async function seedCompletedOrder(
  prisma: PrismaClient,
  options: {
    partnerId: string;
    email: string;
    tag: string;
    iccid?: string;
  }
): Promise<{ orderId: string; purchaseId: string }> {
  const persist = buildIccidPersistFields(options.iccid ?? SAMPLE_ICCID);
  assert.ok(persist, "expected ICCID persist fields");

  const order = await prisma.order.create({
    data: {
      providerOrderId: `PO-SPAGE-${options.tag}-${randomBytes(4).toString("hex")}`,
      customerEmail: options.email,
      offerId: `ESIM-SPAGE-${options.tag}`,
      destination: "Japan",
      planName: "QA Share Page 3GB",
      dataAllowance: "3 GB",
      validity: "30 Days",
      fundingSource: OrderFundingSource.PARTNER_BALANCE,
      status: OrderStatus.COMPLETED,
      ...persist,
      partnerEsimPurchase: {
        create: {
          partnerId: options.partnerId,
          offerId: `ESIM-SPAGE-${options.tag}`,
          destinationCode: "JP",
          destinationName: "Japan",
          planName: "QA Share Page 3GB",
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
    select: {
      id: true,
      partnerEsimPurchase: { select: { id: true } },
    },
  });

  return {
    orderId: order.id,
    purchaseId: order.partnerEsimPurchase!.id,
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  assertLocalPhase3Db(url);

  process.env.ICCID_ENCRYPTION_KEY =
    process.env.ICCID_ENCRYPTION_KEY || randomBytes(32).toString("hex");

  const readSrc = read("app/lib/partner/partnerEsimShareRead.ts");
  const pageSrc = read("app/share/[token]/page.tsx");
  const layoutSrc = read("app/share/layout.tsx");
  const viewSrc = read("app/components/partner/PartnerEsimShareView.tsx");
  const usageRoute = read("app/api/share/[token]/usage/route.ts");
  const tawkChat = read("app/components/support/TawkChat.tsx");
  const tawkRoutes = read("app/lib/support/tawkRoutes.ts");
  const whatsapp = read("app/lib/support/whatsappSupportShared.ts");
  const robots = read("app/robots.ts");
  const headersSrc = read("app/lib/security/headers.ts");
  const rootLayout = read("app/layout.tsx");
  const consent = read("app/components/cookies/CookieConsentProvider.tsx");
  const installExp = read("app/components/install/EsimInstallExperience.tsx");
  const customerUsage = read("app/lib/orders/customerEsimUsage.ts");
  const customerInstall = read("app/lib/orders/customerOrderInstall.ts");
  const iccidReveal = read("app/lib/orders/iccidReveal.ts");
  const sitemap = read("app/sitemap.ts");
  const pkg = read("package.json");
  const unavailable = read(
    "app/components/partner/PartnerEsimShareUnavailable.tsx"
  );
  const notFoundSrc = read("app/share/[token]/not-found.tsx");

  assert.match(readSrc, /import ["']server-only["']/);
  assert.match(readSrc, /resolvePartnerEsimShareToken/);
  assert.match(readSrc, /extractInstallDetails/);
  assert.match(readSrc, /generateEsimQrDataUrl/);
  assert.match(readSrc, /usageLookup/);
  assert.doesNotMatch(readSrc, /requireRole|from ["']@\/auth["']/);
  assert.doesNotMatch(readSrc, /writeAuditLog/);
  assert.doesNotMatch(readSrc, /console\.(?:log|info|warn)\([^\)]*rawToken/);
  assert.doesNotMatch(readSrc, /method:\s*["']POST["']/);
  assert.doesNotMatch(readSrc, /creditCheckout|buyPartnerEsim/);
  assert.match(pageSrc, /notFound\(\)/);
  assert.doesNotMatch(pageSrc, /auth\(|requireRole/);
  assert.match(layoutSrc, /index:\s*false/);
  assert.match(layoutSrc, /noarchive:\s*true/);
  assert.match(layoutSrc, /referrer:\s*["']no-referrer["']/);
  assert.doesNotMatch(layoutSrc, /openGraph|iccid|token/i);
  assert.match(viewSrc, /clipboard\.writeText/);
  assert.match(viewSrc, /\/api\/share\/\$\{encodeURIComponent\(token\)\}\/usage/);
  assert.match(viewSrc, /method:\s*["']POST["']/);
  assert.match(viewSrc, /Check Usage/);
  assert.match(viewSrc, /ManualInstallSheet/);
  assert.match(viewSrc, /Installation Guide/);
  assert.doesNotMatch(viewSrc, /wa\.me/i);
  assert.doesNotMatch(viewSrc, /partnerCharge|discountBps|providerCost|wallet/);
  assert.doesNotMatch(viewSrc, /Confirmation PIN|confirmationPin/);
  assert.doesNotMatch(viewSrc, /eSIM activated and ready to use/);
  assert.match(viewSrc, /data:image|qrDataUrl/);
  assert.match(usageRoute, /getPartnerEsimShareUsage\(token\)/);
  assert.match(usageRoute, /PRIVATE_API_RESPONSE_HEADERS/);
  assert.match(usageRoute, /Referrer-Policy.*no-referrer/);
  assert.match(usageRoute, /noarchive/);
  assert.match(usageRoute, /["']iccid["']/);
  assert.match(usageRoute, /["']providerOrderId["']/);
  assert.doesNotMatch(usageRoute, /method:\s*["']POST["'][\s\S]{0,80}vesim/i);
  assert.match(tawkRoutes, /["']\/share["']/);
  assert.match(whatsapp, /["']\/share["']/);
  assert.match(tawkChat, /!routeAllowed/);
  assert.match(robots, /["']\/share\/["']/);
  assert.match(headersSrc, /SHARE_SURFACE_HEADERS/);
  assert.match(headersSrc, /["']\/share\/:path\*["']/);
  assert.match(rootLayout, /HideOnShare/);
  assert.match(consent, /HideOnShare/);
  assert.doesNotMatch(installExp, /partnerEsimShare|\/share\//);
  assert.doesNotMatch(customerUsage, /partnerEsimShare/);
  assert.doesNotMatch(customerInstall, /partnerEsimShare/);
  assert.doesNotMatch(iccidReveal, /partnerEsimShare/);
  assert.doesNotMatch(sitemap, /\/share/);
  assert.match(pkg, /"qa:partner-share-page"/);
  assert.match(unavailable, /SHARE_PAGE_UNAVAILABLE_MESSAGE/);
  assert.match(notFoundSrc, /PartnerEsimShareUnavailable/);
  assert.equal(isShareSurfacePath("/share/abc"), true);
  assert.equal(isTawkEnabledRoute("/share/abc"), false);
  assert.equal(isTawkEnabledRoute("/share"), false);
  assert.equal(isWhatsAppSupportRoute("/share/abc"), false);
  assert.equal(isTawkEnabledRoute("/support"), true);

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
  assert.ok(
    SHARE_SURFACE_HEADERS.some((h) => h.key === "Referrer-Policy")
  );
  console.log("PASS N_O_P_Q_S_offline_protections_and_unchanged_install_paths");

  const prisma = new PrismaClient();
  const stamp = Date.now();
  const pw = await hashPassword(`Uat${randomBytes(18).toString("base64url")}!9`);

  try {
    const partner = await prisma.user.create({
      data: {
        name: "P3 Share Page Partner",
        email: `p3.spage.${stamp}@example.invalid`,
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
    const partnerUserId = partner.id;
    const partnerId = partner.partnerProfile!.id;

    const seeded = await seedCompletedOrder(prisma, {
      partnerId,
      email: `p3.spage.ord.${stamp}@example.invalid`,
      tag: `a${stamp}`,
      iccid: SAMPLE_ICCID,
    });
    const other = await seedCompletedOrder(prisma, {
      partnerId,
      email: `p3.spage.other.${stamp}@example.invalid`,
      tag: `b${stamp}`,
      iccid: OTHER_ICCID,
    });

    const created = await createPartnerEsimShareToken({
      partnerUserId,
      orderId: seeded.orderId,
    });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("expected create");
    const rawToken = created.rawToken;

    const fetchBroker = async () => mockBrokerPayload();
    const page = await getPartnerEsimSharePageData(rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    assert.ok(page);
    assert.equal(page.destinationName, "Japan");
    assert.equal(page.planName, "QA Share Page 3GB");
    assert.equal(page.dataAllowance, "3 GB");
    assert.equal(page.validity, "30 Days");
    assert.equal(page.statusLabel, SHARE_STATUS_READY);
    assert.equal(page.fullIccid, SAMPLE_ICCID);
    assert.equal(page.lpa, QA_LPA);
    assert.equal(page.smdpAddress, QA_SMDP);
    assert.equal(page.activationCode, QA_ACTIVATION);
    assert.equal(page.installDetailsAvailable, true);
    assert.ok(page.qrDataUrl?.startsWith("data:image/png;base64,"));
    assert.equal(page.lpa?.includes("/share/"), false);
    assert.equal(page.lpa?.includes(rawToken), false);
    assert.equal(page.qrDataUrl?.includes(rawToken), false);
    assert.equal(page.qrDataUrl?.includes("/share/"), false);
    assertNoPublicSecrets(page, rawToken);
    assert.deepEqual(Object.keys(page.branding).sort(), [
      "buttonBackground",
      "buttonTextColor",
      "companyName",
      "logoUrl",
      "supportEmail",
      "websiteUrl",
    ]);
    assert.equal(page.branding.companyName, null);
    assert.equal(page.branding.logoUrl, null);
    assert.deepEqual(
      Object.keys(page).sort(),
      [
        "activationCode",
        "branding",
        "dataAllowance",
        "destinationName",
        "fullIccid",
        "hasInstallDetails",
        "installDetailsAvailable",
        "lpa",
        "planName",
        "qrDataUrl",
        "smdpAddress",
        "statusLabel",
        "validity",
      ].sort()
    );
    console.log("PASS A_G_H_I_K_valid_share_page_dto");

    assert.doesNotMatch(pageSrc, /auth\(|getSessionUser|requireRole/);
    console.log("PASS B_no_login_required");

    const malformedPage = await Promise.all([
      getPartnerEsimSharePageData(""),
      getPartnerEsimSharePageData("short"),
      getPartnerEsimSharePageData("not valid token!!!"),
      getPartnerEsimSharePageData("a".repeat(200)),
    ]);
    for (const result of malformedPage) {
      assert.equal(result, null);
    }
    console.log("PASS C_malformed_generic_unavailable");

    const unknown = await getPartnerEsimSharePageData(
      randomBytes(32).toString("base64url")
    );
    assert.equal(unknown, null);
    console.log("PASS D_unknown_generic_unavailable");

    const toRevoke = await createPartnerEsimShareToken({
      partnerUserId,
      orderId: other.orderId,
    });
    assert.equal(toRevoke.ok, true);
    if (!toRevoke.ok) throw new Error("expected other token");
    const revoked = await revokePartnerEsimShareToken({
      partnerUserId,
      orderId: other.orderId,
    });
    assert.equal(revoked.ok, true);
    const afterRevoke = await getPartnerEsimSharePageData(toRevoke.rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    assert.equal(afterRevoke, null);
    console.log("PASS E_revoked_generic_unavailable");

    const first = await createPartnerEsimShareToken({
      partnerUserId,
      orderId: seeded.orderId,
    });
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error("expected rotate first");
    const second = await createPartnerEsimShareToken({
      partnerUserId,
      orderId: seeded.orderId,
    });
    assert.equal(second.ok, true);
    if (!second.ok) throw new Error("expected rotate second");
    const oldPage = await getPartnerEsimSharePageData(first.rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    const newPage = await getPartnerEsimSharePageData(second.rawToken, {
      fetchBrokerPayload: fetchBroker,
    });
    assert.equal(oldPage, null);
    assert.ok(newPage);
    assert.equal(newPage.fullIccid, SAMPLE_ICCID);
    assert.equal(newPage.lpa, QA_LPA);
    console.log("PASS F_rotated_old_invalid_new_works");

    const emptyInstall = await getPartnerEsimSharePageData(second.rawToken, {
      fetchBrokerPayload: async () => ({}),
    });
    assert.ok(emptyInstall);
    assert.equal(emptyInstall.installDetailsAvailable, false);
    assert.equal(emptyInstall.qrDataUrl, null);
    assert.equal(emptyInstall.fullIccid, SAMPLE_ICCID);
    console.log("PASS install_details_not_available_yet_safe");

    const audits = await prisma.auditLog.findMany({
      where: {
        actorUserId: partnerUserId,
      },
    });
    const auditJson = JSON.stringify(audits);
    assert.equal(auditJson.includes(second.rawToken), false);
    assert.equal(auditJson.includes(first.rawToken), false);
    assert.equal(auditJson.includes(SAMPLE_ICCID), false);
    assert.equal(auditJson.toLowerCase().includes("iccid"), false);
    console.log("PASS J_R_iccid_and_raw_token_absent_from_audit");

    let seenIccid: string | null = null;
    const usageLookup = async (iccid: string) => {
      seenIccid = iccid;
      return {
        ok: true as const,
        payload: {
          usage: {
            status: "active",
            statusLabel: "Active",
            initialDataGB: 3,
            remainingDataGB: 2.5,
            usagePercent: 17,
            isUnlimited: false,
            daysRemaining: 28,
          },
        },
      };
    };

    const usage = await getPartnerEsimShareUsage(second.rawToken, {
      fetchBrokerPayload: fetchBroker,
      usageLookup,
    });
    assert.equal(usage.ok, true);
    if (!usage.ok) throw new Error("expected usage");
    assert.equal(seenIccid, SAMPLE_ICCID);
    assert.notEqual(seenIccid, OTHER_ICCID);
    assert.equal(usage.usage.statusLabel, "Active");
    assert.equal(usage.usage.remainingDataGB, 2.5);
    assertNoPublicSecrets(usage, second.rawToken);
    assert.equal(JSON.stringify(usage).includes(SAMPLE_ICCID), false);
    console.log("PASS L_valid_token_safe_usage_server_derived_iccid");

    const badUsage = await Promise.all([
      getPartnerEsimShareUsage(""),
      getPartnerEsimShareUsage("short"),
      getPartnerEsimShareUsage(first.rawToken),
      getPartnerEsimShareUsage(randomBytes(32).toString("base64url")),
    ]);
    for (const result of badUsage) {
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, "UNAVAILABLE");
      }
    }
    assert.equal(SHARE_PAGE_UNAVAILABLE_MESSAGE.length > 8, true);
    console.log("PASS L_invalid_revoked_usage_generic");

    assert.match(customerUsage, /method:\s*["']GET["']/);
    assert.doesNotMatch(readSrc, /vesimAuthorizedFetch\([\s\S]*POST/);
    console.log("PASS M_no_live_provider_write_in_share_read");

    console.log("ALL_QA_PASSED=partner-share-page");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
