/**
 * Isolated LOCAL Partner install recovery + persist-diagnostic QA.
 * DATABASE_URL must be 127.0.0.1:55440 / map_esim_partner_phase3_uat.
 * No live VeSIM purchase — broker GET is injected.
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
import { extractInstallDetails, hasInstallDetails } from "../app/lib/email/extract";
import { persistAssignedOrder } from "../app/lib/orders/persistAssignedOrder";
import { buildIccidPersistFields } from "../app/lib/orders/iccidCrypto";
import { revealIccidForPartner } from "../app/lib/orders/iccidReveal";
import { classifyOrderPersistError } from "../app/lib/orders/orderPersistError";
import {
  getPartnerOwnedOrderInstall,
  toPartnerOrderInstallDto,
} from "../app/lib/partner/partnerOrderInstall";
import { PARTNER_INSTALL_UNAVAILABLE_MESSAGE } from "../app/lib/partner/partnerOrderInstallClient";
import { classifyProviderOrderResponse } from "../app/lib/vesim/providerOrderStatusCore";
import type { VerifiedCheckoutOffer } from "../app/lib/vesim/server";

const SAMPLE_ICCID = "8900000000000000123";
const QA_LPA = "LPA:1$rsp.example.com$MATCHING-ID-QA-INSTALL";
const QA_SMDP = "rsp.example.com";
const QA_ACTIVATION = "MATCHING-ID-QA-INSTALL";

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

function read(rel: string): string {
  return readFileSync(path.join(__dirname, "..", rel), "utf8");
}

function idem(tag: string): string {
  return `pep_inst_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 128);
}

function assertNoInstallSecrets(value: unknown): void {
  const json = JSON.stringify(value);
  for (const needle of [
    "discountBps",
    "discountVersion",
    "partnerCharge",
    "partnerChargeCents",
    "providerCost",
    "providerCostCents",
    "balanceCents",
    "walletAccount",
    "customerEmail",
    "passwordHash",
    "tokenHash",
    "providerAmount",
    "rawPayload",
    "esim_activation_code",
    "esim_qr_code",
    "confirmationPin",
    "Confirmation PIN",
  ]) {
    assert.equal(json.includes(needle), false, `install DTO leaked ${needle}`);
  }
}

function vesimStylePayload(): Record<string, unknown> {
  return {
    orderId: "PO-VESIM-KEYS",
    status: "completed",
    esim_iccid: SAMPLE_ICCID,
    esim_activation_code: QA_LPA,
    esim_smdp_address: QA_SMDP,
    qrCode: QA_LPA,
    lpaString: QA_LPA,
  };
}

async function seedCompletedOrder(
  prisma: PrismaClient,
  options: {
    partnerId: string;
    email: string;
    tag: string;
    iccid?: string | null;
  }
): Promise<{ orderId: string; purchaseId: string; providerOrderId: string }> {
  const persist = options.iccid
    ? buildIccidPersistFields(options.iccid)
    : null;
  const providerOrderId = `PO-INST-${options.tag}-${randomBytes(4).toString("hex")}`;

  const order = await prisma.order.create({
    data: {
      providerOrderId,
      customerEmail: options.email,
      offerId: `ESIM-INST-${options.tag}`,
      destination: "Japan",
      planName: "QA Install Recovery 3GB",
      dataAllowance: "3 GB",
      validity: "30 Days",
      fundingSource: OrderFundingSource.PARTNER_BALANCE,
      status: OrderStatus.COMPLETED,
      ...(persist ?? {}),
      partnerEsimPurchase: {
        create: {
          partnerId: options.partnerId,
          offerId: `ESIM-INST-${options.tag}`,
          destinationCode: "JP",
          destinationName: "Japan",
          planName: "QA Install Recovery 3GB",
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
      providerOrderId: true,
      partnerEsimPurchase: { select: { id: true } },
    },
  });

  return {
    orderId: order.id,
    purchaseId: order.partnerEsimPurchase!.id,
    providerOrderId: order.providerOrderId,
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  assertLocalPhase3Db(url);

  process.env.ICCID_ENCRYPTION_KEY =
    process.env.ICCID_ENCRYPTION_KEY || randomBytes(32).toString("hex");

  const partnerInstall = read("app/lib/partner/partnerOrderInstall.ts");
  const partnerProvider = read("app/lib/partner/partnerEsimPurchaseProvider.ts");
  const persistSrc = read("app/lib/orders/persistAssignedOrder.ts");
  const reconLocal = read("app/lib/admin/reconciliationLocalFinalization.ts");
  const refreshCore = read("app/lib/vesim/providerOrderStatusCore.ts");
  const partnerPage = read("app/partner/(portal)/orders/[orderId]/page.tsx");
  const partnerPanel = read("app/components/partner/PartnerEsimInstallPanel.tsx");
  const installSheet = read("app/components/install/InstallEsimSheet.tsx");
  const customerPanel = read("app/components/orders/CustomerEsimInstallPanel.tsx");
  const customerInstall = read("app/lib/orders/customerOrderInstall.ts");
  const apple = read("app/lib/install/appleEsimInstall.ts");
  const iccidReveal = read("app/lib/orders/iccidReveal.ts");
  const persistErr = read("app/lib/orders/orderPersistError.ts");
  const pkg = read("package.json");

  assert.match(pkg, /qa:partner-install-recovery/);
  assert.match(partnerInstall, /extractInstallDetails/);
  assert.match(partnerInstall, /fetchBrokerOrderPayload/);
  assert.doesNotMatch(partnerInstall, /executeCreditCheckout|buyPartnerEsimPurchase/);
  assert.doesNotMatch(partnerInstall, /method:\s*["']POST["']/);
  assert.match(refreshCore, /extractInstallDetails/);
  assert.match(refreshCore, /hasInstallDetails/);
  assert.match(partnerPage, /PartnerEsimOrderCard/);
  assert.match(partnerPage, /CustomerEsimUsagePanel|PartnerEsimOrderCard/);
  assert.doesNotMatch(
    partnerPage,
    /Use the full ICCID above|Secure QR and one-tap install for Partners will follow/
  );
  assert.match(partnerPanel, /useAppleOneTapInstallState/);
  assert.match(partnerPanel, /Install your eSIM/);
  assert.match(partnerPanel, /View QR Code & Install/);
  assert.match(partnerPanel, /PARTNER_INSTALL_UNAVAILABLE_MESSAGE/);
  assert.match(partnerPanel, /ManualInstallSheet/);
  assert.match(partnerPanel, /Installation Guide/);
  assert.match(partnerPanel, /iPhone Guide/);
  assert.match(partnerPanel, /Android Guide/);
  assert.match(partnerPanel, /\/install\/iphone/);
  assert.match(partnerPanel, /\/install\/android/);
  assert.match(partnerPanel, /eligibleIphone \? \(\s*<AppleOneTapInstallButton/);
  assert.doesNotMatch(partnerPanel, /EsimInstallExperience/);
  assert.doesNotMatch(partnerPanel, /Confirmation PIN|confirmationPin/);
  assert.match(installSheet, />\s*iPhone Guide\s*</);
  assert.match(installSheet, />\s*Android Guide\s*</);
  assert.match(installSheet, /href=\{iphoneGuideHref\}/);
  assert.match(installSheet, /href=\{androidGuideHref\}/);
  assert.match(installSheet, /label="One-Tap Install eSIM"/);
  assert.match(installSheet, /eligibleIphone \? \(\s*<AppleOneTapInstallButton/);
  assert.doesNotMatch(installSheet, /Confirmation PIN|confirmationPin/);
  assert.match(customerPanel, /\/api\/account\/orders\/\$\{encodeURIComponent\(orderId\)\}\/install/);
  assert.match(customerInstall, /\/api\/account\/orders\//);
  assert.match(apple, /iOS 17\.4\+/);
  assert.match(apple, /minor >= 4/);
  assert.match(iccidReveal, /ICCID_REVEAL_PARTNER_ACTION/);
  assert.match(persistSrc, /Never stores QR\/LPA/);
  assert.match(persistSrc, /never fails the order on ICCID/);
  assert.match(reconLocal, /Never places\/retries VeSIM/);
  assert.match(reconLocal, /classifyProviderOrderResponse/);
  assert.doesNotMatch(reconLocal, /executeCreditCheckout/);
  assert.match(partnerProvider, /classifyOrderPersistError/);
  assert.match(partnerProvider, /failureCode: options.code/);
  assert.match(partnerProvider, /persistErrorCode/);
  const persistCatch = partnerProvider.slice(
    partnerProvider.indexOf("const persistDiagnostic = classifyOrderPersistError")
  );
  assert.match(persistCatch, /persistErrorCode: persistDiagnostic.persistErrorCode/);
  assert.doesNotMatch(persistCatch, /error\.message/);
  assert.doesNotMatch(persistCatch, /String\(error\)/);
  assert.match(persistErr, /prisma_p2002_unique_conflict/);
  assert.match(persistErr, /prisma_p2003_fk_conflict/);
  assert.match(persistErr, /prisma_p2025_missing_record/);
  assert.match(persistErr, /transaction_conflict/);
  assert.match(persistErr, /order_persist_unknown/);
  console.log("PASS source_invariants");

  const vesimExtracted = extractInstallDetails(vesimStylePayload());
  assert.equal(hasInstallDetails(vesimExtracted), true);
  assert.ok(vesimExtracted.iccid);
  assert.ok(vesimExtracted.qrValue);
  assert.ok(vesimExtracted.smdpAddress);
  const vesimClassified = classifyProviderOrderResponse({
    httpStatus: 200,
    payload: vesimStylePayload(),
    requestedProviderOrderId: "PO-VESIM-KEYS",
  });
  assert.equal(vesimClassified.installDataPresent, "yes");
  assert.equal(JSON.stringify(vesimClassified).includes(SAMPLE_ICCID), false);
  assert.equal(JSON.stringify(vesimClassified).includes("LPA:1"), false);
  console.log("PASS vesim_keys_canonical_parser");

  const iccidOnlyDto = toPartnerOrderInstallDto("ord_x", { iccid: SAMPLE_ICCID });
  assert.equal(iccidOnlyDto.hasInstallDetails, false);
  assert.equal(iccidOnlyDto.lpa, null);
  assertNoInstallSecrets(iccidOnlyDto);
  assert.equal("iccid" in iccidOnlyDto, false);
  console.log("PASS iccid_only_not_install_credential");

  const secret = "password=supersecret host=db.internal sql=SELECT *";
  for (const [code, expected] of [
    ["P2002", "prisma_p2002_unique_conflict"],
    ["P2003", "prisma_p2003_fk_conflict"],
    ["P2025", "prisma_p2025_missing_record"],
    ["P2034", "transaction_conflict"],
  ] as const) {
    const classified = classifyOrderPersistError({
      name: "PrismaClientKnownRequestError",
      code,
      message: secret,
    });
    assert.equal(classified.persistErrorCode, expected);
    assert.equal(JSON.stringify(classified).includes("password"), false);
    assert.equal(JSON.stringify(classified).includes("SELECT"), false);
    assert.equal(JSON.stringify(classified).includes("supersecret"), false);
  }
  const unknown = classifyOrderPersistError(new Error(secret));
  assert.equal(unknown.persistErrorCode, "order_persist_unknown");
  assert.equal(JSON.stringify(unknown).includes("password"), false);
  console.log("PASS persist_error_classification");

  const prisma = new PrismaClient();
  const stamp = Date.now();
  const pw = await hashPassword(`Uat${randomBytes(18).toString("base64url")}!9`);

  try {
    const partnerA = await prisma.user.create({
      data: {
        name: "P3 Install Partner A",
        email: `p3.inst.a.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 1000,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 50_000, version: 0 } },
          },
        },
      },
      select: { id: true, email: true, partnerProfile: { select: { id: true } } },
    });
    const partnerB = await prisma.user.create({
      data: {
        name: "P3 Install Partner B",
        email: `p3.inst.b.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 500,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 20_000, version: 0 } },
          },
        },
      },
      select: { id: true },
    });
    const disabled = await prisma.user.create({
      data: {
        name: "P3 Install Disabled",
        email: `p3.inst.dis.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 500,
            discountVersion: 1,
            disabledAt: new Date(),
            walletAccount: { create: { balanceCents: 10_000, version: 0 } },
          },
        },
      },
      select: { id: true },
    });

    const seeded = await seedCompletedOrder(prisma, {
      partnerId: partnerA.partnerProfile!.id,
      email: partnerA.email,
      tag: `a${stamp}`,
      iccid: SAMPLE_ICCID,
    });

    let brokerGets = 0;
    const fetchBroker = async (providerOrderId: string) => {
      brokerGets += 1;
      assert.equal(providerOrderId, seeded.providerOrderId);
      return {
        orderId: providerOrderId,
        status: "completed",
        lpa: QA_LPA,
        smdpAddress: QA_SMDP,
        activationCode: QA_ACTIVATION,
        iccid: SAMPLE_ICCID,
      };
    };

    const own = await getPartnerOwnedOrderInstall(
      partnerA.id,
      seeded.orderId,
      { fetchBrokerPayload: fetchBroker }
    );
    assert.equal(own.ok, true);
    if (!own.ok) throw new Error("expected install");
    assert.equal(own.dto.hasVerifiedLpa, true);
    assert.equal(own.dto.smdpAddress, QA_SMDP);
    assert.equal(own.dto.activationCode, QA_ACTIVATION);
    assert.equal(own.dto.lpa, QA_LPA);
    assert.ok(own.dto.qrViewHref?.includes("/api/partner/orders/"));
    assert.ok(own.dto.qrDownloadHref?.includes("download=1"));
    assertNoInstallSecrets(own.dto);
    assert.equal("iccid" in own.dto, false);
    assert.equal(brokerGets, 1);
    console.log("PASS A_own_completed_install_dto");

    const cross = await getPartnerOwnedOrderInstall(partnerB.id, seeded.orderId, {
      fetchBrokerPayload: fetchBroker,
    });
    assert.equal(cross.ok, false);
    if (!cross.ok) assert.equal(cross.code, "NOT_FOUND");
    console.log("PASS B_cross_partner_denied");

    const disabledResult = await getPartnerOwnedOrderInstall(
      disabled.id,
      seeded.orderId,
      { fetchBrokerPayload: fetchBroker }
    );
    assert.equal(disabledResult.ok, false);
    if (!disabledResult.ok) assert.equal(disabledResult.code, "NOT_FOUND");
    console.log("PASS C_disabled_partner_denied");

    const vesimOwn = await getPartnerOwnedOrderInstall(
      partnerA.id,
      seeded.orderId,
      { fetchBrokerPayload: async () => vesimStylePayload() }
    );
    assert.equal(vesimOwn.ok, true);
    if (vesimOwn.ok) {
      assert.equal(vesimOwn.dto.hasVerifiedLpa, true);
      assert.equal(vesimOwn.dto.lpa, QA_LPA);
      assertNoInstallSecrets(vesimOwn.dto);
    }
    console.log("PASS D_E_canonical_vesim_keys");

    const missing = await getPartnerOwnedOrderInstall(
      partnerA.id,
      seeded.orderId,
      { fetchBrokerPayload: async () => ({ status: "completed" }) }
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, "MISSING_INSTALL");
    assert.equal(
      PARTNER_INSTALL_UNAVAILABLE_MESSAGE,
      "Installation details are not available yet."
    );
    console.log("PASS J_missing_install_safe_state");

    const reveal = await revealIccidForPartner(partnerA.id, seeded.orderId);
    assert.equal(reveal.ok, true);
    if (reveal.ok) assert.equal(reveal.iccid, SAMPLE_ICCID);
    const revealCross = await revealIccidForPartner(partnerB.id, seeded.orderId);
    assert.equal(revealCross.ok, false);
    console.log("PASS H_iccid_authorization_unchanged");

    const customer = await prisma.user.create({
      data: {
        name: "P3 Install Customer",
        email: `p3.inst.cust.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    const offer: VerifiedCheckoutOffer = {
      offerId: `ESIM-INST-FIN-${stamp}`,
      name: "QA Finalize No ICCID",
      countryCode: "JP",
      countryName: "Japan",
      dataFormatted: "1 GB",
      durationDays: 7,
      priceUSD: 10,
      providerPriceUSD: 8,
      currency: "USD",
    };
    const providerOrderId = `PO-INST-FIN-${stamp}`;
    const first = await prisma.$transaction((tx) =>
      persistAssignedOrder(tx, {
        providerOrderId,
        customerUserId: customer.id,
        customerEmail: customer.email,
        verifiedOffer: offer,
        fundingSource: OrderFundingSource.PARTNER_BALANCE,
      })
    );
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: first.id },
    });
    assert.equal(stored.providerOrderId, providerOrderId);
    assert.equal(stored.iccidEncrypted, null);
    const second = await prisma.$transaction((tx) =>
      persistAssignedOrder(tx, {
        providerOrderId,
        customerUserId: customer.id,
        customerEmail: customer.email,
        verifiedOffer: offer,
        fundingSource: OrderFundingSource.PARTNER_BALANCE,
      })
    );
    assert.equal(second.id, first.id);
    const count = await prisma.order.count({ where: { providerOrderId } });
    assert.equal(count, 1);
    console.log("PASS L_M_local_finalize_no_iccid_idempotent");

    assert.equal(brokerGets >= 1, true);
    console.log("PASS K_provider_get_only_injected");
  } finally {
    await prisma.$disconnect();
  }

  console.log("ALL_QA_PASSED=partner-install-recovery");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
