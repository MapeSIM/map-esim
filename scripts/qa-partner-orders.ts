/**
 * Isolated LOCAL Partner Orders + ICCID reveal QA (Slice 7).
 * DATABASE_URL must be 127.0.0.1:55439 / map_esim_partner_phase2_uat.
 * No live VeSIM purchase — injected offer verifier + provider mock.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  OperationalControlKey,
  OrderFundingSource,
  PartnerEsimPurchaseStatus,
  PrismaClient,
  Role,
} from "@prisma/client";
import { hashPassword } from "../app/lib/auth/password";
import {
  revealIccidForCustomer,
  revealIccidForPartner,
} from "../app/lib/orders/iccidReveal";
import {
  getPartnerOwnedOrderDetail,
  listPartnerOrdersPage,
} from "../app/lib/partner/partnerOrders";
import {
  assertNoPartnerOrderForbiddenKeys,
  partnerAttentionMessage,
  partnerAttentionTitle,
} from "../app/lib/partner/partnerOrdersDisplay";
import { buyPartnerEsimPurchase } from "../app/lib/partner/partnerPurchaseBuy";
import type { PartnerOfferVerifier } from "../app/lib/partner/partnerEsimPurchase";
import type { PartnerProviderCheckoutExecutor } from "../app/lib/partner/partnerEsimPurchaseProvider";
import type { CreditCheckoutResult } from "../app/lib/vesim/creditCheckout";
import type { VerifiedCheckoutOffer } from "../app/lib/vesim/server";

const SAMPLE_ICCID = "8900000000000000123";

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
  return `pep_ord_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 128);
}

function makeOffer(
  overrides?: Partial<VerifiedCheckoutOffer>
): VerifiedCheckoutOffer {
  return {
    offerId: "ESIM-PK-QA-ORD-1",
    name: "QA Pakistan 1GB Orders",
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
    payload: { orderId: providerOrderId, iccid: SAMPLE_ICCID },
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  assertLocalPhase2Db(url);

  // Local-only test key — never production.
  process.env.ICCID_ENCRYPTION_KEY = randomBytes(32).toString("hex");

  const prisma = new PrismaClient();
  const stamp = Date.now();
  const pw = await hashPassword(`Uat${randomBytes(18).toString("base64url")}!9`);
  const root = path.join(__dirname, "..");

  const offerState = makeOffer();
  const verifyOffer: PartnerOfferVerifier = async ({ offerId }) => {
    if (offerId !== offerState.offerId) return null;
    return { ...offerState };
  };

  let nextCheckout: CreditCheckoutResult = successCheckout(`PO-ORD-${stamp}-A`);
  const providerCheckout: PartnerProviderCheckoutExecutor = async () =>
    nextCheckout;

  try {
    for (const key of [
      OperationalControlKey.PARTNER_WALLET_PURCHASES,
      OperationalControlKey.PROVIDER_ORDER_CREATION,
      OperationalControlKey.TRANSACTION_MAINTENANCE,
    ]) {
      await prisma.operationalControl.upsert({
        where: { key },
        create: {
          id: `opsctl_${key.toLowerCase()}`,
          key,
          paused: false,
          version: 0,
        },
        update: { paused: false },
      });
    }

    const partnerA = await prisma.user.create({
      data: {
        name: "P2 Orders Partner A",
        email: `p2.ord.a.${stamp}@example.com`,
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
      select: {
        id: true,
        partnerProfile: { select: { id: true } },
      },
    });
    const partnerAUserId = partnerA.id;
    const partnerAId = partnerA.partnerProfile!.id;

    const partnerB = await prisma.user.create({
      data: {
        name: "P2 Orders Partner B",
        email: `p2.ord.b.${stamp}@example.com`,
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
    const partnerBUserId = partnerB.id;

    const disabledPartner = await prisma.user.create({
      data: {
        name: "P2 Orders Disabled",
        email: `p2.ord.dis.${stamp}@example.com`,
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

    const customer = await prisma.user.create({
      data: {
        name: "P2 Ord Customer",
        email: `p2.ord.cust.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
        walletAccount: { create: { balanceCents: 77_777, version: 0 } },
      },
      select: { id: true },
    });
    const customerWalletBefore = (
      await prisma.walletAccount.findUniqueOrThrow({
        where: { userId: customer.id },
      })
    ).balanceCents;

    // A. Partner A completed Order visible
    nextCheckout = successCheckout(`PO-ORD-${stamp}-A`);
    const buyA = await buyPartnerEsimPurchase({
      partnerUserId: partnerAUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("a"),
      countryHint: "PK",
      verifyOffer,
      providerCheckout,
    });
    assert.equal(buyA.ok, true);
    if (!buyA.ok || buyA.kind === "idle") throw new Error("expected success");
    const purchaseA = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: buyA.purchaseId },
    });
    assert.equal(purchaseA.status, PartnerEsimPurchaseStatus.COMPLETED);
    assert.ok(purchaseA.orderId);
    const orderAId = purchaseA.orderId!;

    const listA = await listPartnerOrdersPage(partnerAUserId);
    assert.ok(listA);
    assertNoPartnerOrderForbiddenKeys(listA);
    const rowA = listA!.orders.find((r) => r.orderId === orderAId);
    assert.ok(rowA, "Partner A must see own completed order");
    assert.equal(rowA!.statusBadge, "Completed");
    assert.equal(rowA!.retailPriceLabel, "$10.00 USD");
    assert.equal(rowA!.partnerDebitLabel, "$9.00 USD"); // 10% off
    assert.equal(rowA!.iccidRevealable, true);
    assert.equal(typeof rowA!.hasActiveShareToken, "boolean");
    assert.equal(rowA!.iccidMasked.includes(SAMPLE_ICCID), false);
    assert.match(rowA!.iccidMasked, /•|Pending|Not provided/);
    console.log("PASS A_partner_sees_own_completed_order");

    // B. Partner A cannot see Partner B order (create B order first)
    nextCheckout = successCheckout(`PO-ORD-${stamp}-B`);
    const buyB = await buyPartnerEsimPurchase({
      partnerUserId: partnerBUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("b"),
      countryHint: "PK",
      verifyOffer,
      providerCheckout,
    });
    assert.equal(buyB.ok, true);
    if (!buyB.ok || buyB.kind === "idle") throw new Error("expected success");
    const purchaseB = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: buyB.purchaseId },
    });
    assert.ok(purchaseB.orderId);
    const orderBId = purchaseB.orderId!;

    const listA2 = await listPartnerOrdersPage(partnerAUserId);
    assert.ok(listA2);
    assert.equal(
      listA2!.orders.some((r) => r.orderId === orderBId),
      false
    );
    const detailASeesB = await getPartnerOwnedOrderDetail(
      partnerAUserId,
      orderBId
    );
    assert.equal(detailASeesB, null);
    console.log("PASS B_partner_a_cannot_see_partner_b_order");

    // C. guessed Order URL denied safely
    const guessed = await getPartnerOwnedOrderDetail(
      partnerAUserId,
      "ord_guessed_does_not_exist_zz"
    );
    assert.equal(guessed, null);
    console.log("PASS C_guessed_order_denied");

    // D + E. full ICCID revealed only for authorized Partner + copy value
    const revealA = await revealIccidForPartner(partnerAUserId, orderAId);
    assert.equal(revealA.ok, true);
    if (!revealA.ok) throw new Error("expected reveal");
    assert.equal(revealA.iccid, SAMPLE_ICCID);

    const revealWrong = await revealIccidForPartner(partnerAUserId, orderBId);
    assert.equal(revealWrong.ok, false);
    if (revealWrong.ok) throw new Error("expected deny");
    assert.equal(revealWrong.code, "NOT_FOUND");

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: "order.iccid_revealed_partner",
        targetId: orderAId,
      },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(audit);
    const meta = JSON.stringify(audit!.metadata ?? {});
    assert.equal(meta.includes(SAMPLE_ICCID), false);
    assert.equal(meta.toLowerCase().includes("iccid"), false);
    console.log("PASS D_E_authorized_reveal_and_copy_value");

    // F. full ICCID not in list URL / static metadata surfaces
    const listPageSrc = readFileSync(
      path.join(root, "app/partner/(portal)/orders/page.tsx"),
      "utf8"
    );
    const detailPageSrc = readFileSync(
      path.join(root, "app/partner/(portal)/orders/[orderId]/page.tsx"),
      "utf8"
    );
    const ordersLibSrc = readFileSync(
      path.join(root, "app/lib/partner/partnerOrders.ts"),
      "utf8"
    );
    assert.doesNotMatch(listPageSrc, /IccidRevealPanel|Show full ICCID/);
    assert.match(listPageSrc, /\/partner\/orders\/\$\{encodeURIComponent/);
    assert.doesNotMatch(ordersLibSrc, /decryptIccid/);
    assert.match(detailPageSrc, /IccidRevealPanel/);
    assert.match(
      detailPageSrc,
      /\/api\/partner\/orders\/\$\{encodeURIComponent\(detail\.orderId\)\}\/iccid/
    );
    for (const blob of [
      JSON.stringify(listA2),
      JSON.stringify(
        await getPartnerOwnedOrderDetail(partnerAUserId, orderAId)
      ),
    ]) {
      assert.equal(blob.includes(SAMPLE_ICCID), false);
      assert.equal(blob.includes("providerCostCents"), false);
    }
    console.log("PASS F_no_full_iccid_in_list_or_static_dto");

    // G + H. provider cost hidden; immutable retail + Partner debit
    const detailA = await getPartnerOwnedOrderDetail(partnerAUserId, orderAId);
    assert.ok(detailA);
    assertNoPartnerOrderForbiddenKeys(detailA);
    assert.equal(detailA!.retailPriceLabel, "$10.00 USD");
    assert.equal(detailA!.partnerDebitLabel, "$9.00 USD");
    assert.equal(detailA!.iccidRevealable, true);
    assert.equal(
      Object.prototype.hasOwnProperty.call(detailA, "providerCostCents"),
      false
    );
    console.log("PASS G_H_no_provider_cost_immutable_prices");

    // I. reconciliation-required represented as under review
    const recon = await prisma.partnerEsimPurchase.create({
      data: {
        partnerId: partnerAId,
        offerId: offerState.offerId,
        destinationCode: "PK",
        destinationName: "Pakistan",
        planName: "QA Recon Plan",
        dataAllowance: "1 GB",
        validity: "7 Days",
        retailPriceCents: 1000,
        discountBps: 1000,
        discountVersion: 1,
        partnerChargeCents: 900,
        providerCostCents: 800,
        status: PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
        idempotencyKey: idem("recon"),
        fundingSource: OrderFundingSource.PARTNER_BALANCE,
        reconciliationState: "open",
      },
    });
    const listRecon = await listPartnerOrdersPage(partnerAUserId);
    assert.ok(listRecon);
    const attentionRecon = listRecon!.attention.find(
      (r) => r.purchaseId === recon.id
    );
    assert.ok(attentionRecon);
    assert.equal(attentionRecon!.statusBadge, "Under review");
    assert.equal(attentionRecon!.kind, "reconciliation_required");
    assert.equal(
      attentionRecon!.title,
      partnerAttentionTitle("reconciliation_required")
    );
    assert.equal(
      attentionRecon!.message,
      partnerAttentionMessage("reconciliation_required")
    );
    assert.match(attentionRecon!.message, /Do not retry|Do not .*again/i);
    console.log("PASS I_reconciliation_under_review");

    // J. failed-refunded represented accurately
    const failed = await prisma.partnerEsimPurchase.create({
      data: {
        partnerId: partnerAId,
        offerId: offerState.offerId,
        destinationCode: "PK",
        destinationName: "Pakistan",
        planName: "QA Failed Plan",
        dataAllowance: "1 GB",
        validity: "7 Days",
        retailPriceCents: 1000,
        discountBps: 1000,
        discountVersion: 1,
        partnerChargeCents: 900,
        providerCostCents: 800,
        status: PartnerEsimPurchaseStatus.FAILED_REFUNDED,
        idempotencyKey: idem("fail"),
        fundingSource: OrderFundingSource.PARTNER_BALANCE,
      },
    });
    const listFail = await listPartnerOrdersPage(partnerAUserId);
    const attentionFail = listFail!.attention.find(
      (r) => r.purchaseId === failed.id
    );
    assert.ok(attentionFail);
    assert.equal(attentionFail!.statusBadge, "Failed — balance returned");
    assert.equal(attentionFail!.kind, "failed_refunded");
    assert.match(attentionFail!.message, /returned to your Partner balance/i);
    console.log("PASS J_failed_refunded_accurate");

    // K. customer reveal pattern unaffected (non-owner → NOT_FOUND)
    const customerReveal = await revealIccidForCustomer(customer.id, orderAId);
    assert.equal(customerReveal.ok, false);
    if (customerReveal.ok) throw new Error("expected deny");
    assert.equal(customerReveal.code, "NOT_FOUND");
    const customerApi = readFileSync(
      path.join(root, "app/api/account/orders/[orderId]/iccid/route.ts"),
      "utf8"
    );
    const adminApi = readFileSync(
      path.join(root, "app/api/admin/orders/[orderId]/iccid/route.ts"),
      "utf8"
    );
    assert.match(customerApi, /revealIccidForCustomer/);
    assert.match(adminApi, /revealIccidForAdmin/);
    assert.doesNotMatch(customerApi, /revealIccidForPartner/);
    assert.doesNotMatch(adminApi, /revealIccidForPartner/);
    console.log("PASS K_customer_admin_patterns_unaffected");

    // L. disabled Partner cannot access Partner Orders
    const disabledList = await listPartnerOrdersPage(disabledPartner.id);
    assert.equal(disabledList, null);
    const disabledDetail = await getPartnerOwnedOrderDetail(
      disabledPartner.id,
      orderAId
    );
    assert.equal(disabledDetail, null);
    const disabledReveal = await revealIccidForPartner(
      disabledPartner.id,
      orderAId
    );
    assert.equal(disabledReveal.ok, false);
    console.log("PASS L_disabled_partner_denied");

    // M. no customer wallet data exposed
    const customerWalletAfter = (
      await prisma.walletAccount.findUniqueOrThrow({
        where: { userId: customer.id },
      })
    ).balanceCents;
    assert.equal(customerWalletAfter, customerWalletBefore);
    const partnerDto = JSON.stringify({
      list: await listPartnerOrdersPage(partnerAUserId),
      detail: await getPartnerOwnedOrderDetail(partnerAUserId, orderAId),
    });
    assert.equal(partnerDto.includes(String(customerWalletBefore)), false);
    assert.equal(partnerDto.includes("77_777"), false);
    assert.equal(partnerDto.includes(customer.id), false);
    console.log("PASS M_no_customer_wallet_exposed");

    // Source: nav enabled, no share page
    const layoutSrc = readFileSync(
      path.join(root, "app/partner/(portal)/layout.tsx"),
      "utf8"
    );
    assert.match(layoutSrc, /href:\s*"\/partner\/orders"/);
    assert.doesNotMatch(layoutSrc, /label:\s*"Orders",\s*disabled:\s*true/);
    assert.equal(
      readFileSync(
        path.join(root, "app/partner/(portal)/orders/page.tsx"),
        "utf8"
      ).includes("share"),
      false
    );
    console.log("PASS nav_orders_enabled_no_share");

    console.log("ALL_QA_PASSED=partner-orders");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
