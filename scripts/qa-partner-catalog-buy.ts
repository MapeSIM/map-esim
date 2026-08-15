/**
 * Isolated LOCAL Partner catalog + buy-flow QA (Slice 6).
 * DATABASE_URL must be 127.0.0.1:55439 / map_esim_partner_phase2_uat.
 * No live VeSIM purchase — injected offer verifier + provider mock.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  OperationalControlKey,
  OrderFundingSource,
  PartnerEsimPurchaseStatus,
  PartnerWalletTransactionType,
  PrismaClient,
  Role,
} from "@prisma/client";
import { hashPassword } from "../app/lib/auth/password";
import {
  partnerCatalogOfferForbiddenKeys,
  partnerCatalogOfferFromRetail,
} from "../app/lib/partner/partnerCatalogRead";
import { buyPartnerEsimPurchase } from "../app/lib/partner/partnerPurchaseBuy";
import {
  PARTNER_FAILED_REFUNDED_MESSAGE,
  PARTNER_INSUFFICIENT_BALANCE_MESSAGE,
  PARTNER_PRICING_CHANGED_MESSAGE,
  PARTNER_PURCHASES_PAUSED_MESSAGE,
  PARTNER_RECONCILIATION_MESSAGE,
  mapPartnerPurchaseErrorCode,
} from "../app/lib/partner/partnerPurchaseFormState";
import type { PartnerOfferVerifier } from "../app/lib/partner/partnerEsimPurchase";
import type { PartnerProviderCheckoutExecutor } from "../app/lib/partner/partnerEsimPurchaseProvider";
import type { CreditCheckoutResult } from "../app/lib/vesim/creditCheckout";
import type { VerifiedCheckoutOffer } from "../app/lib/vesim/server";

function assertLocalPhase2Db(url: string): void {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing non-local host: ${host}`);
  }
  const port = parsed.port || "5432";
  const db = parsed.pathname.replace(/^\//, "");
  if (port !== "55439" || db !== "map_esim_partner_phase2_uat") {
    throw new Error(`Refusing unexpected target port=${port} db=${db}`);
  }
  console.log(`CONFIRMED_LOCAL_DB host=${host} port=${port} db=${db}`);
}

function idem(tag: string): string {
  return `pep_cat_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 128);
}

function makeOffer(
  overrides?: Partial<VerifiedCheckoutOffer>
): VerifiedCheckoutOffer {
  return {
    offerId: "ESIM-PK-QA-CAT-1",
    name: "QA Pakistan 1GB Catalog",
    countryCode: "PK",
    countryName: "Pakistan",
    dataFormatted: "1 GB",
    durationDays: 7,
    priceUSD: 10,
    providerPriceUSD: 8,
    currency: "USD",
    ...overrides,
  };
}

function successCheckout(providerOrderId: string): CreditCheckoutResult {
  return {
    kind: "success",
    providerOrderId,
    payload: { orderId: providerOrderId, iccid: "8900000000000000009" },
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  assertLocalPhase2Db(url);
  const prisma = new PrismaClient();
  const stamp = Date.now();
  const pw = await hashPassword(`Uat${randomBytes(18).toString("base64url")}!9`);

  let offerState = makeOffer();
  const verifyOffer: PartnerOfferVerifier = async ({ offerId }) => {
    if (offerId !== offerState.offerId) return null;
    return { ...offerState };
  };

  let providerCalls = 0;
  let nextCheckout: CreditCheckoutResult = successCheckout(`PO-CAT-${stamp}-A`);
  const providerCheckout: PartnerProviderCheckoutExecutor = async () => {
    providerCalls += 1;
    return nextCheckout;
  };

  try {
    await prisma.operationalControl.upsert({
      where: { key: OperationalControlKey.PARTNER_WALLET_PURCHASES },
      create: {
        id: "opsctl_partner_wallet_purchases",
        key: OperationalControlKey.PARTNER_WALLET_PURCHASES,
        paused: false,
        version: 0,
      },
      update: { paused: false },
    });
    await prisma.operationalControl.upsert({
      where: { key: OperationalControlKey.PROVIDER_ORDER_CREATION },
      create: {
        id: "opsctl_provider_order_creation",
        key: OperationalControlKey.PROVIDER_ORDER_CREATION,
        paused: false,
        version: 0,
      },
      update: { paused: false },
    });
    await prisma.operationalControl.upsert({
      where: { key: OperationalControlKey.TRANSACTION_MAINTENANCE },
      create: {
        id: "opsctl_transaction_maintenance",
        key: OperationalControlKey.TRANSACTION_MAINTENANCE,
        paused: false,
        version: 0,
      },
      update: { paused: false },
    });

    // A + B. retail catalog shape — no discount/provider cost in payload
    const catalogOffer = partnerCatalogOfferFromRetail({
      offerId: offerState.offerId,
      name: offerState.name,
      dataFormatted: offerState.dataFormatted,
      durationDays: offerState.durationDays,
      priceUSD: offerState.priceUSD,
      countryName: offerState.countryName,
      countryCode: offerState.countryCode,
    });
    assert.ok(catalogOffer);
    assert.equal(catalogOffer!.retailPriceLabel, "$10.00 USD");
    assert.equal(catalogOffer!.dataLabel, "1 GB");
    assert.equal(catalogOffer!.validityLabel, "7 Days");
    const payloadJson = JSON.stringify(catalogOffer);
    for (const key of partnerCatalogOfferForbiddenKeys()) {
      assert.equal(payloadJson.includes(key), false, `leaked ${key}`);
      assert.equal(
        Object.prototype.hasOwnProperty.call(catalogOffer, key),
        false
      );
    }
    assert.equal(payloadJson.includes("providerPrice"), false);
    assert.equal(payloadJson.includes("discount"), false);
    assert.equal(payloadJson.includes("8"), false); // provider $8 not shown
    console.log("PASS A_B_retail_catalog_no_discount_provider");

    // UI source checks: catalog component + actions never render forbidden labels
    const root = path.join(__dirname, "..");
    const catalogUi = readFileSync(
      path.join(root, "app/components/partner/PartnerCatalogBuy.tsx"),
      "utf8"
    );
    const actionsSrc = readFileSync(
      path.join(root, "app/lib/partner/partnerPurchaseActions.ts"),
      "utf8"
    );
    const catalogReadSrc = readFileSync(
      path.join(root, "app/lib/partner/partnerCatalogRead.ts"),
      "utf8"
    );
    for (const needle of [
      "discountBps",
      "partnerChargeCents",
      "providerCostCents",
      "providerCostLabel",
      "providerPriceUSD",
    ]) {
      assert.equal(catalogUi.includes(needle), false, `UI has ${needle}`);
    }
    void catalogReadSrc;
    // Actions must void-ignore client money fields
    assert.ok(actionsSrc.includes('void formData.get("discountBps")'));
    assert.ok(actionsSrc.includes('void formData.get("partnerChargeCents")'));
    assert.ok(actionsSrc.includes('void formData.get("providerCostCents")'));
    console.log("PASS M_no_client_money_trusted_in_actions");

    const partnerUser = await prisma.user.create({
      data: {
        name: "P2 Catalog Partner",
        email: `p2.cat.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 500,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 50_000, version: 0 } },
          },
        },
      },
      select: {
        id: true,
        partnerProfile: { select: { id: true } },
      },
    });
    const partnerUserId = partnerUser.id;
    const partnerId = partnerUser.partnerProfile!.id;

    const customer = await prisma.user.create({
      data: {
        name: "P2 Cat Customer",
        email: `p2.cat.cust.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
        walletAccount: { create: { balanceCents: 66_666, version: 0 } },
      },
      select: { id: true },
    });
    const customerWalletBefore = (
      await prisma.walletAccount.findUniqueOrThrow({
        where: { userId: customer.id },
      })
    ).balanceCents;

    // C + D. buy success + server-side discount debit
    providerCalls = 0;
    nextCheckout = successCheckout(`PO-CAT-${stamp}-C`);
    const balBeforeC = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    const resultC = await buyPartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("c"),
      countryHint: "PK",
      verifyOffer,
      providerCheckout,
    });
    assert.equal(resultC.ok, true);
    if (!resultC.ok) throw new Error("expected success");
    assert.equal(resultC.kind, "success");
    assert.equal(providerCalls, 1);
    const rowC = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: resultC.purchaseId },
    });
    assert.equal(rowC.status, PartnerEsimPurchaseStatus.COMPLETED);
    assert.equal(rowC.retailPriceCents, 1000);
    assert.equal(rowC.partnerChargeCents, 950);
    assert.equal(rowC.discountBps, 500);
    assert.equal(rowC.fundingSource, OrderFundingSource.PARTNER_BALANCE);
    const balAfterC = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    assert.equal(balAfterC, balBeforeC - 950);
    assert.equal(
      await prisma.partnerWalletTransaction.count({
        where: {
          wallet: { partnerId },
          type: PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT,
          referenceId: resultC.purchaseId,
        },
      }),
      1
    );
    console.log("PASS C_D_buy_success_discounted_debit");

    // I. same idempotency → no duplicate debit/provider
    const sameKey = (
      await prisma.partnerEsimPurchase.findUniqueOrThrow({
        where: { id: resultC.purchaseId },
        select: { idempotencyKey: true },
      })
    ).idempotencyKey;
    providerCalls = 0;
    const resultI2 = await buyPartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: sameKey,
      countryHint: "PK",
      verifyOffer,
      providerCheckout,
    });
    assert.equal(resultI2.ok, true);
    if (resultI2.ok) {
      assert.ok(
        resultI2.kind === "success" || resultI2.kind === "duplicate_success"
      );
      assert.equal(resultI2.purchaseId, resultC.purchaseId);
    }
    assert.equal(providerCalls, 0);
    assert.equal(
      await prisma.partnerWalletTransaction.count({
        where: {
          wallet: { partnerId },
          type: PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT,
          referenceId: resultC.purchaseId,
        },
      }),
      1
    );
    console.log("PASS I_idempotent_no_duplicate_provider");

    // E. insufficient balance — no provider
    const lowPartner = await prisma.user.create({
      data: {
        name: "P2 Low Bal",
        email: `p2.cat.low.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 500,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 100, version: 0 } },
          },
        },
      },
      select: { id: true, partnerProfile: { select: { id: true } } },
    });
    providerCalls = 0;
    const resultE = await buyPartnerEsimPurchase({
      partnerUserId: lowPartner.id,
      offerId: offerState.offerId,
      idempotencyKey: idem("e"),
      countryHint: "PK",
      verifyOffer,
      providerCheckout,
    });
    assert.equal(resultE.ok, false);
    if (resultE.ok) throw new Error("expected fail");
    assert.equal(resultE.kind, "insufficient_balance");
    assert.equal(resultE.message, PARTNER_INSUFFICIENT_BALANCE_MESSAGE);
    assert.equal(providerCalls, 0);
    console.log("PASS E_insufficient_no_provider");

    // F. disabled Partner blocked
    await prisma.partnerProfile.update({
      where: { id: partnerId },
      data: { disabledAt: new Date() },
    });
    providerCalls = 0;
    const resultF = await buyPartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("f"),
      countryHint: "PK",
      verifyOffer,
      providerCheckout,
    });
    assert.equal(resultF.ok, false);
    if (resultF.ok) throw new Error("expected fail");
    assert.equal(resultF.kind, "unavailable");
    assert.equal(providerCalls, 0);
    await prisma.partnerProfile.update({
      where: { id: partnerId },
      data: { disabledAt: null },
    });
    console.log("PASS F_disabled_partner_blocked");

    // G. pricing drift — safe message, no debit/provider
    providerCalls = 0;
    const debitBeforeG = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT,
      },
    });
    let verifyHits = 0;
    const driftVerify: PartnerOfferVerifier = async ({ offerId }) => {
      if (offerId !== "ESIM-PK-QA-CAT-1") return null;
      verifyHits += 1;
      if (verifyHits === 1) {
        return makeOffer({ priceUSD: 10, providerPriceUSD: 8 });
      }
      return makeOffer({ priceUSD: 12, providerPriceUSD: 8 });
    };
    const resultG = await buyPartnerEsimPurchase({
      partnerUserId,
      offerId: "ESIM-PK-QA-CAT-1",
      idempotencyKey: idem("g2"),
      countryHint: "PK",
      verifyOffer: driftVerify,
      providerCheckout,
    });
    assert.equal(resultG.ok, false);
    if (resultG.ok) throw new Error("expected pricing_changed");
    assert.equal(resultG.kind, "pricing_changed");
    assert.equal(resultG.message, PARTNER_PRICING_CHANGED_MESSAGE);
    assert.equal(providerCalls, 0);
    const debitAfterG = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT,
      },
    });
    assert.equal(debitAfterG, debitBeforeG);
    offerState = makeOffer();
    console.log("PASS G_pricing_drift_safe_retry");

    // H. operational pause
    await prisma.operationalControl.update({
      where: { key: OperationalControlKey.PARTNER_WALLET_PURCHASES },
      data: { paused: true },
    });
    providerCalls = 0;
    const resultH = await buyPartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("h"),
      countryHint: "PK",
      verifyOffer,
      providerCheckout,
    });
    assert.equal(resultH.ok, false);
    if (resultH.ok) throw new Error("expected paused");
    assert.equal(resultH.kind, "purchases_paused");
    assert.equal(resultH.message, PARTNER_PURCHASES_PAUSED_MESSAGE);
    assert.equal(providerCalls, 0);
    await prisma.operationalControl.update({
      where: { key: OperationalControlKey.PARTNER_WALLET_PURCHASES },
      data: { paused: false },
    });
    console.log("PASS H_ops_pause_blocked");

    // J. confirmed failure → exact refund + safe UI
    providerCalls = 0;
    nextCheckout = { kind: "declined", httpStatus: 402, payload: {} };
    const balBeforeJ = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    const resultJ = await buyPartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("j"),
      countryHint: "PK",
      verifyOffer,
      providerCheckout,
    });
    assert.equal(resultJ.ok, false);
    if (resultJ.ok) throw new Error("expected failed_refunded");
    assert.equal(resultJ.kind, "failed_refunded");
    assert.equal(resultJ.message, PARTNER_FAILED_REFUNDED_MESSAGE);
    assert.equal(providerCalls, 1);
    assert.ok(resultJ.purchaseId);
    const rowJ = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: resultJ.purchaseId! },
    });
    assert.equal(rowJ.status, PartnerEsimPurchaseStatus.FAILED_REFUNDED);
    assert.ok(rowJ.refundTransactionId);
    const refundJ = await prisma.partnerWalletTransaction.findUniqueOrThrow({
      where: { id: rowJ.refundTransactionId! },
    });
    assert.equal(refundJ.amountCents, rowJ.partnerChargeCents);
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents,
      balBeforeJ
    );
    console.log("PASS J_confirmed_failure_refund_ui");

    // K. uncertain → recon message, no auto-refund (funds remain reserved)
    providerCalls = 0;
    nextCheckout = {
      kind: "uncertain",
      category: "provider_timeout",
      code: "checkout_transport_error",
    };
    const balBeforeK = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    const resultK = await buyPartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("k"),
      countryHint: "PK",
      verifyOffer,
      providerCheckout,
    });
    assert.equal(resultK.ok, false);
    if (resultK.ok) throw new Error("expected recon");
    assert.equal(resultK.kind, "reconciliation_required");
    assert.equal(resultK.message, PARTNER_RECONCILIATION_MESSAGE);
    assert.equal(providerCalls, 1);
    const rowK = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: resultK.purchaseId! },
    });
    assert.equal(
      rowK.status,
      PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED
    );
    assert.equal(rowK.refundTransactionId, null);
    assert.equal(rowK.partnerChargeCents, 950);
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents,
      balBeforeK - rowK.partnerChargeCents
    );
    assert.equal(
      await prisma.partnerWalletTransaction.count({
        where: {
          wallet: { partnerId },
          type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
          referenceId: resultK.purchaseId!,
        },
      }),
      0
    );
    console.log("PASS K_uncertain_recon_no_refund");

    // L. customer wallet untouched
    assert.equal(
      (
        await prisma.walletAccount.findUniqueOrThrow({
          where: { userId: customer.id },
        })
      ).balanceCents,
      customerWalletBefore
    );
    assert.equal(
      await prisma.walletTransaction.count({
        where: { wallet: { userId: customer.id } },
      }),
      0
    );
    console.log("PASS L_customer_wallet_untouched");

    // Error mapper sanity
    assert.equal(
      mapPartnerPurchaseErrorCode("INSUFFICIENT_FUNDS").message,
      PARTNER_INSUFFICIENT_BALANCE_MESSAGE
    );

    // Nav / route presence
    const layoutSrc = readFileSync(
      path.join(root, "app/partner/(portal)/layout.tsx"),
      "utf8"
    );
    assert.ok(layoutSrc.includes('href: "/partner/catalog"'));
    assert.ok(layoutSrc.includes('label: "Orders", disabled: true'));
    console.log("PASS nav_catalog_enabled_orders_soon");

    console.log("ALL PASS qa-partner-catalog-buy");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
