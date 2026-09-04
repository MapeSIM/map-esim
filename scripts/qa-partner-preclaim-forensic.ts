/**
 * LOCAL forensic audit: Partner purchase pre-claim failure.
 * DATABASE_URL must be 127.0.0.1:55439 / map_esim_partner_phase2_uat.
 * No live VeSIM — mocked verifyOffer + providerCheckout.
 * Captures exact error name/code/message/stack for pre-claim aborts.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  OperationalControlKey,
  PartnerEsimPurchaseStatus,
  PartnerWalletTransactionType,
  PrismaClient,
  Role,
} from "@prisma/client";
import { hashPassword } from "../app/lib/auth/password";
import {
  PartnerEsimPurchaseError,
  preparePartnerEsimPurchase,
  reservePartnerEsimPurchase,
  type PartnerOfferVerifier,
} from "../app/lib/partner/partnerEsimPurchase";
import {
  executePartnerEsimProviderPurchase,
  type PartnerProviderCheckoutExecutor,
} from "../app/lib/partner/partnerEsimPurchaseProvider";
import { buyPartnerEsimPurchase } from "../app/lib/partner/partnerPurchaseBuy";
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
  return `pep_forensic_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 128);
}

function makeOffer(
  overrides?: Partial<VerifiedCheckoutOffer>
): VerifiedCheckoutOffer {
  return {
    offerId: "ESIM-AT-QA-FORENSIC-1",
    name: "QA Austria 1GB Forensic",
    countryCode: "AT",
    countryName: "Austria",
    dataFormatted: "1 GB",
    durationDays: 7,
    priceUSD: 2.2,
    providerPriceUSD: 1.5,
    currency: "USD",
    ...overrides,
  };
}

function captureError(error: unknown): {
  name: string;
  code: string | null;
  message: string;
  stack: string | null;
  digest: string | null;
} {
  const err = error instanceof Error ? error : null;
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const digest =
    error && typeof error === "object" && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : "";
  return {
    name: err?.name ?? typeof error,
    code: code || null,
    message: err?.message ?? String(error),
    stack: err?.stack ?? null,
    digest: digest || null,
  };
}

function makeNextRedirectError(url: string): Error {
  const error = new Error(`NEXT_REDIRECT;${url}`);
  error.name = "NEXT_REDIRECT";
  (error as { digest?: string }).digest = `NEXT_REDIRECT;replace;${url};303`;
  return error;
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
  const providerCheckout: PartnerProviderCheckoutExecutor = async () => {
    providerCalls += 1;
    const providerOrderId = `PO-FORENSIC-${stamp}-${providerCalls}-${randomBytes(4).toString("hex")}`;
    const result: CreditCheckoutResult = {
      kind: "success",
      providerOrderId,
      payload: {
        orderId: providerOrderId,
        iccid: `8900000000000${String(stamp).slice(-6)}${String(providerCalls).padStart(3, "0")}`,
      },
    };
    return result;
  };

  const findings: string[] = [];

  try {
    for (const key of [
      OperationalControlKey.PARTNER_WALLET_PURCHASES,
      OperationalControlKey.PROVIDER_ORDER_CREATION,
      OperationalControlKey.TRANSACTION_MAINTENANCE,
    ] as const) {
      await prisma.operationalControl.upsert({
        where: { key },
        create: {
          id: `opsctl_forensic_${key.toLowerCase()}`,
          key,
          paused: false,
          version: 0,
        },
        update: { paused: false },
      });
    }

    const partnerUser = await prisma.user.create({
      data: {
        name: "P2 Forensic Partner",
        email: `p2.forensic.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 0,
            discountVersion: 1,
            walletAccount: {
              create: { balanceCents: 10_000 },
            },
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

    const balance = async () =>
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
          select: { balanceCents: true },
        })
      ).balanceCents;

    // -------------------------------------------------------------------------
    // CASE 0: REAL partner create default discountVersion=0 must complete buy
    // (assertPositiveCommercial historically rejected version < 1 → never-started)
    // -------------------------------------------------------------------------
    providerCalls = 0;
    const zeroVerUser = await prisma.user.create({
      data: {
        name: "P2 ZeroVer Partner",
        email: `p2.zerover.${stamp}@example.com`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 500,
            discountVersion: 0, // matches partners.ts create + schema default
            walletAccount: {
              create: { balanceCents: 10_000 },
            },
          },
        },
      },
      select: { id: true },
    });
    const buy0 = await buyPartnerEsimPurchase({
      partnerUserId: zeroVerUser.id,
      offerId: offerState.offerId,
      idempotencyKey: idem("zerover"),
      countryHint: "AT",
      verifyOffer,
      providerCheckout,
    });
    console.log("CASE0_BUY_RESULT", buy0);
    assert.equal(buy0.ok, true, "discountVersion=0 partner must complete buy");
    assert.equal(providerCalls, 1);
    const purchase0Id = "purchaseId" in buy0 ? buy0.purchaseId : null;
    assert.ok(purchase0Id);
    const row0 = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchase0Id! },
      select: {
        status: true,
        discountVersion: true,
        providerRefreshClaimedAt: true,
        orderId: true,
        safeProviderStatusCode: true,
      },
    });
    assert.equal(row0.discountVersion, 0);
    assert.equal(row0.status, PartnerEsimPurchaseStatus.COMPLETED);
    assert.ok(row0.orderId);
    findings.push("CASE0_DISCOUNT_VERSION_ZERO_BUY_OK");
    console.log("PASS CASE0_discountVersion_zero_partner_buy");

    // -------------------------------------------------------------------------
    // CASE 1: Real buy orchestration happy path (VeSIM mocked)
    // -------------------------------------------------------------------------
    providerCalls = 0;
    const bal1 = await balance();
    const buy1 = await buyPartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("happy"),
      countryHint: "AT",
      verifyOffer,
      providerCheckout,
    });
    console.log("CASE1_BUY_RESULT", buy1);
    assert.equal(buy1.ok, true);
    assert.equal(providerCalls, 1);
    const purchase1Id = "purchaseId" in buy1 ? buy1.purchaseId : null;
    assert.ok(purchase1Id);
    const row1 = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchase1Id! },
    });
    assert.equal(row1.status, PartnerEsimPurchaseStatus.COMPLETED);
    assert.ok(row1.orderId);
    assert.equal(row1.providerRefreshClaimedAt, null); // cleared on complete
    assert.equal(await balance(), bal1 - row1.partnerChargeCents);
    findings.push("CASE1_HAPPY_PATH_OK");
    console.log("PASS CASE1_happy_buy_orchestration");

    // -------------------------------------------------------------------------
    // CASE 2: Abort after debit / before claim → never-started + capture stack
    // -------------------------------------------------------------------------
    providerCalls = 0;
    const bal2 = await balance();
    const prep2 = await preparePartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("abort"),
      countryHint: "AT",
      verifyOffer,
    });
    await reservePartnerEsimPurchase({
      partnerUserId,
      purchaseId: prep2.purchaseId,
      countryHint: "AT",
      verifyOffer,
    });
    let capturedAbort: ReturnType<typeof captureError> | null = null;
    try {
      await executePartnerEsimProviderPurchase({
        partnerUserId,
        purchaseId: prep2.purchaseId,
        providerCheckout,
        beforeProviderClaim: async () => {
          throw new Error("forensic_abort_before_claim");
        },
      });
      assert.fail("expected throw");
    } catch (error) {
      capturedAbort = captureError(error);
      console.log("CASE2_CAPTURED_ERROR", JSON.stringify(capturedAbort, null, 2));
    }
    assert.ok(capturedAbort);
    assert.equal(capturedAbort!.name, "PartnerEsimPurchaseError");
    assert.equal(capturedAbort!.code, "PROVIDER_FAILED");
    assert.equal(providerCalls, 0);
    const row2 = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: prep2.purchaseId },
      select: {
        status: true,
        providerRefreshClaimedAt: true,
        safeProviderStatusCode: true,
        refundTransactionId: true,
      },
    });
    assert.equal(row2.status, PartnerEsimPurchaseStatus.FAILED_REFUNDED);
    assert.equal(row2.providerRefreshClaimedAt, null);
    assert.equal(row2.safeProviderStatusCode, "provider_never_started");
    assert.ok(row2.refundTransactionId);
    assert.equal(await balance(), bal2);
    findings.push("CASE2_ABORT_BEFORE_CLAIM_MATCHES_PREVIEW_SYMPTOM");
    console.log("PASS CASE2_abort_before_claim_provider_never_started");

    // -------------------------------------------------------------------------
    // CASE 3: buyPartnerEsimPurchase catches pre-claim throw + compensates
    // -------------------------------------------------------------------------
    providerCalls = 0;
    const bal3 = await balance();
    const buy3 = await buyPartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("buy_abort"),
      countryHint: "AT",
      verifyOffer,
      providerCheckout,
      beforeProviderClaim: async () => {
        throw Object.assign(new Error("buy_orchestration_preclaim_boom"), {
          code: "FORENSIC_PRECLAIM",
        });
      },
    });
    console.log("CASE3_BUY_RESULT", buy3);
    assert.equal(buy3.ok, false);
    assert.equal(providerCalls, 0);
    const purchase3Id = "purchaseId" in buy3 ? buy3.purchaseId : null;
    assert.ok(purchase3Id);
    const row3 = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchase3Id! },
      select: {
        status: true,
        providerRefreshClaimedAt: true,
        safeProviderStatusCode: true,
        refundTransactionId: true,
      },
    });
    assert.equal(row3.status, PartnerEsimPurchaseStatus.FAILED_REFUNDED);
    assert.equal(row3.providerRefreshClaimedAt, null);
    assert.equal(row3.safeProviderStatusCode, "provider_never_started");
    assert.ok(row3.refundTransactionId);
    assert.equal(await balance(), bal3);
    findings.push("CASE3_BUY_CATCH_COMPENSATES_NEVER_STARTED");
    console.log("PASS CASE3_buy_catch_compensates");

    // -------------------------------------------------------------------------
    // CASE 4: NEXT_REDIRECT-like control-flow error after debit / before claim
    // -------------------------------------------------------------------------
    providerCalls = 0;
    const bal4 = await balance();
    const buy4 = await buyPartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("redirect"),
      countryHint: "AT",
      verifyOffer,
      providerCheckout,
      beforeProviderClaim: async () => {
        throw makeNextRedirectError("/partner");
      },
    });
    console.log("CASE4_BUY_RESULT", buy4);
    assert.equal(buy4.ok, false);
    assert.equal(providerCalls, 0);
    const purchase4Id = "purchaseId" in buy4 ? buy4.purchaseId : null;
    assert.ok(purchase4Id);
    const row4 = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: purchase4Id! },
      select: {
        status: true,
        safeProviderStatusCode: true,
        providerRefreshClaimedAt: true,
      },
    });
    assert.equal(row4.status, PartnerEsimPurchaseStatus.FAILED_REFUNDED);
    assert.equal(row4.safeProviderStatusCode, "provider_never_started");
    assert.equal(row4.providerRefreshClaimedAt, null);
    assert.equal(await balance(), bal4);
    findings.push(
      "CASE4_IF_NEXT_REDIRECT_THROWN_PRECLAIM_BUY_CATCH_SWALLOWS_AND_COMPENSATES"
    );
    console.log("PASS CASE4_next_redirect_swallowed_by_buy_catch_IF_injected");

    // Static: buy path itself has no redirect()/notFound()
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.join(__dirname, "..");
    const buySrc = fs.readFileSync(
      path.join(root, "app/lib/partner/partnerPurchaseBuy.ts"),
      "utf8"
    );
    const execSrc = fs.readFileSync(
      path.join(root, "app/lib/partner/partnerEsimPurchaseProvider.ts"),
      "utf8"
    );
    const actionSrc = fs.readFileSync(
      path.join(root, "app/lib/partner/partnerPurchaseActions.ts"),
      "utf8"
    );
    const guardsSrc = fs.readFileSync(
      path.join(root, "app/lib/partner/partnerPurchaseGuards.ts"),
      "utf8"
    );
    for (const [label, src] of [
      ["buy", buySrc],
      ["execute", execSrc],
      ["guards", guardsSrc],
    ] as const) {
      assert.equal(src.includes("redirect("), false, `${label} calls redirect`);
      assert.equal(src.includes("notFound("), false, `${label} calls notFound`);
      assert.equal(
        src.includes("revalidatePath"),
        false,
        `${label} revalidatePath`
      );
    }
    // Action calls requireRole (can redirect) BEFORE buy — before debit.
    assert.ok(actionSrc.includes("requireRole"));
    assert.equal(actionSrc.includes("redirect("), false);
    findings.push("STATIC_NO_REDIRECT_IN_BUY_EXECUTE_GUARDS");
    console.log("PASS CASE4b_static_no_redirect_in_preclaim_chain");

    // -------------------------------------------------------------------------
    // CASE 5: Stage-instrumented real execute (no abort) — prove claim reached
    // -------------------------------------------------------------------------
    providerCalls = 0;
    const stages: string[] = [];
    const prep5 = await preparePartnerEsimPurchase({
      partnerUserId,
      offerId: offerState.offerId,
      idempotencyKey: idem("stages"),
      countryHint: "AT",
      verifyOffer,
    });
    stages.push("prepared");
    await reservePartnerEsimPurchase({
      partnerUserId,
      purchaseId: prep5.purchaseId,
      countryHint: "AT",
      verifyOffer,
    });
    stages.push("reserved_debited");
    const mid = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: prep5.purchaseId },
      select: {
        status: true,
        debitTransactionId: true,
        providerRefreshClaimedAt: true,
      },
    });
    assert.equal(mid.status, PartnerEsimPurchaseStatus.PROVIDER_PENDING);
    assert.ok(mid.debitTransactionId);
    assert.equal(mid.providerRefreshClaimedAt, null);
    stages.push("pre_execute_confirmed");
    const executed5 = await executePartnerEsimProviderPurchase({
      partnerUserId,
      purchaseId: prep5.purchaseId,
      providerCheckout,
      beforeProviderClaim: async () => {
        stages.push("before_claim_hook");
      },
    });
    stages.push("execute_returned");
    assert.equal(executed5.status, PartnerEsimPurchaseStatus.COMPLETED);
    assert.equal(providerCalls, 1);
    console.log("CASE5_STAGES", stages);
    findings.push("CASE5_LOCAL_EXECUTE_REACHES_CLAIM_AND_PROVIDER_MOCK");
    console.log("PASS CASE5_instrumented_execute_reaches_claim");

    // Refund count sanity
    const refunds = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
      },
    });
    assert.ok(refunds >= 2);

    console.log("FORENSIC_FINDINGS");
    for (const f of findings) console.log(`- ${f}`);
    console.log(
      "LOCAL_ROOT_CAUSE=assertPositiveCommercial_rejected_discountVersion_0"
    );
    console.log("ALL_FORENSIC_CASES_PASSED");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("FORENSIC_FAILED", captureError(error));
  process.exitCode = 1;
});
