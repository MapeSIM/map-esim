/**
 * Isolated LOCAL Partner refund-request foundation QA (Slice 1).
 * DATABASE_URL must be 127.0.0.1:55440 / map_esim_partner_phase3_uat.
 * No wallet credit, no provider call, no Production.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  OrderFundingSource,
  OrderStatus,
  PartnerEsimPurchaseStatus,
  PartnerWalletTransactionType,
  PrismaClient,
  RefundRequestStatus,
  Role,
} from "@prisma/client";
import { hashPassword } from "../app/lib/auth/password";
import {
  createPartnerRefundRequest,
  PartnerRefundRequestError,
} from "../app/lib/partner/partnerRefundRequest";
import {
  PARTNER_REFUND_AUDIT,
  PARTNER_REFUND_NOTE_MAX,
  PARTNER_REFUND_REQUEST_OPEN_STATUSES,
  PARTNER_REFUND_REQUEST_REASONS,
  isOpenPartnerRefundStatus,
  parsePartnerRefundRequestReason,
  partnerRefundReasonLabel,
  sanitizePartnerRefundNote,
} from "../app/lib/partner/partnerRefundRequestConstants";

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
  return `pep_prefund_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 128);
}

async function expectCode(
  fn: () => Promise<unknown>,
  code: PartnerRefundRequestError["code"]
): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code}`);
  } catch (err) {
    assert.ok(err instanceof PartnerRefundRequestError);
    assert.equal(err.code, code);
  }
}

async function seedPurchase(
  prisma: PrismaClient,
  options: {
    partnerId: string;
    email: string;
    tag: string;
    status?: PartnerEsimPurchaseStatus;
    partnerChargeCents?: number;
    retailPriceCents?: number;
    withDebit?: boolean;
    refunded?: boolean;
  }
): Promise<{ purchaseId: string; orderId: string; walletId: string }> {
  const partnerChargeCents = options.partnerChargeCents ?? 66;
  const retailPriceCents = options.retailPriceCents ?? 68;
  const withDebit = options.withDebit !== false;
  const order = await prisma.order.create({
    data: {
      providerOrderId: `PO-PREFUND-${options.tag}-${randomBytes(4).toString("hex")}`,
      customerEmail: options.email,
      offerId: `ESIM-PREFUND-${options.tag}`,
      destination: "Pakistan",
      planName: "QA Refund 100MB",
      dataAllowance: "102 MB",
      validity: "7 Days",
      fundingSource: OrderFundingSource.PARTNER_BALANCE,
      status: OrderStatus.COMPLETED,
      partnerEsimPurchase: {
        create: {
          partnerId: options.partnerId,
          offerId: `ESIM-PREFUND-${options.tag}`,
          destinationCode: "PK",
          destinationName: "Pakistan",
          planName: "QA Refund 100MB",
          dataAllowance: "102 MB",
          validity: "7 Days",
          retailPriceCents,
          discountBps: 300,
          discountVersion: 1,
          partnerChargeCents,
          providerCostCents: 50,
          fundingSource: OrderFundingSource.PARTNER_BALANCE,
          status: options.status ?? PartnerEsimPurchaseStatus.COMPLETED,
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
  const purchaseId = order.partnerEsimPurchase!.id;
  const wallet = await prisma.partnerWalletAccount.findUniqueOrThrow({
    where: { partnerId: options.partnerId },
    select: { id: true, balanceCents: true, version: true },
  });

  let debitId: string | null = null;
  if (withDebit) {
    const debit = await prisma.partnerWalletTransaction.create({
      data: {
        partnerWalletAccountId: wallet.id,
        type: PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT,
        amountCents: partnerChargeCents,
        balanceBeforeCents: wallet.balanceCents,
        balanceAfterCents: wallet.balanceCents,
        reason: "QA partner debit snapshot",
        referenceType: "PartnerEsimPurchase",
        referenceId: purchaseId,
        idempotencyKey: `qa_debit_${purchaseId}`.slice(0, 128),
      },
      select: { id: true },
    });
    debitId = debit.id;
  }

  let refundId: string | null = null;
  if (options.refunded) {
    const refund = await prisma.partnerWalletTransaction.create({
      data: {
        partnerWalletAccountId: wallet.id,
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
        amountCents: partnerChargeCents,
        balanceBeforeCents: wallet.balanceCents,
        balanceAfterCents: wallet.balanceCents,
        reason: "QA already-refunded fixture",
        referenceType: "PartnerEsimPurchase",
        referenceId: purchaseId,
        idempotencyKey: `qa_refund_fix_${purchaseId}`.slice(0, 128),
      },
      select: { id: true },
    });
    refundId = refund.id;
  }

  await prisma.partnerEsimPurchase.update({
    where: { id: purchaseId },
    data: {
      debitTransactionId: debitId,
      refundTransactionId: refundId,
      status: options.refunded
        ? PartnerEsimPurchaseStatus.FAILED_REFUNDED
        : (options.status ?? PartnerEsimPurchaseStatus.COMPLETED),
    },
  });

  return { purchaseId, orderId: order.id, walletId: wallet.id };
}

function runOfflineChecks(): void {
  const schema = read("prisma/schema.prisma");
  const migrationPath =
    "prisma/migrations/20260817020000_add_partner_refund_request_foundation/migration.sql";
  assert.ok(existsSync(path.join(__dirname, "..", migrationPath)));
  const migration = read(migrationPath);
  const service = read("app/lib/partner/partnerRefundRequest.ts");
  const actions = read("app/lib/partner/partnerRefundRequestActions.ts");
  const constants = read("app/lib/partner/partnerRefundRequestConstants.ts");
  const form = read("app/components/partner/PartnerRefundRequestControls.tsx");
  const ordersPage = read("app/partner/(portal)/orders/page.tsx");
  const sharePage = read("app/share/[token]/page.tsx");
  const customerService = read("app/lib/refunds/refundRequest.ts");
  const customerActions = read("app/lib/refunds/refundRequestActions.ts");
  const pkg = read("package.json");

  assert.match(schema, /enum PartnerRefundRequestReason/);
  assert.match(schema, /INSTALL_DETAILS_UNAVAILABLE/);
  assert.match(schema, /model PartnerRefundRequest/);
  assert.match(schema, /openPurchaseKey/);
  assert.match(schema, /partnerChargeCents/);
  assert.match(migration, /CREATE TABLE "PartnerRefundRequest"/);
  assert.match(migration, /PartnerRefundRequest_openPurchaseKey_key/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  assert.match(pkg, /qa:partner-refund-request/);

  for (const reason of PARTNER_REFUND_REQUEST_REASONS) {
    assert.equal(parsePartnerRefundRequestReason(reason), reason);
  }
  assert.equal(parsePartnerRefundRequestReason("WRONG_PLAN"), null);
  assert.ok(isOpenPartnerRefundStatus("REQUESTED"));
  assert.ok(!isOpenPartnerRefundStatus("REJECTED"));
  assert.deepEqual(PARTNER_REFUND_REQUEST_OPEN_STATUSES, [
    "REQUESTED",
    "UNDER_REVIEW",
    "APPROVED_PENDING_EXECUTION",
  ]);
  assert.equal(
    partnerRefundReasonLabel("INSTALL_DETAILS_UNAVAILABLE"),
    "Installation details unavailable"
  );
  assert.equal(sanitizePartnerRefundNote("  <hi>  there  "), "hi there");
  assert.equal(PARTNER_REFUND_NOTE_MAX, 500);
  console.log("PASS offline_schema_helpers");

  assert.match(service, /import ["']server-only["']/);
  assert.match(service, /createPartnerRefundRequest/);
  assert.match(service, /requireActivePartnerActor/);
  assert.match(service, /partnerChargeCents: purchase\.partnerChargeCents/);
  assert.match(service, /openPurchaseKey: purchase\.id/);
  assert.match(service, /RefundRequestStatus\.REQUESTED/);
  assert.match(service, /PARTNER_REFUND_AUDIT\.CREATED/);
  assert.match(service, /PartnerEsimPurchaseStatus\.FAILED_REFUNDED/);
  assert.doesNotMatch(service, /input\.partnerChargeCents|input\.refundAmount/);
  assert.doesNotMatch(service, /refundPartnerPurchaseFundsInTx/);
  assert.doesNotMatch(service, /refundReconciliationPartnerPurchase/);
  assert.doesNotMatch(service, /from ["']@\/app\/lib\/vesim/);
  assert.doesNotMatch(service, /status:\s*PartnerEsimPurchaseStatus\.FAILED_REFUNDED/);
  assert.match(service, /refundTransactionId/);
  assert.doesNotMatch(service, /refundTransactionId:\s*refund/);
  assert.doesNotMatch(actions, /refundPartnerPurchaseFundsInTx/);
  assert.match(actions, /void formData\.get\("amount"\)/);
  assert.match(actions, /void formData\.get\("partnerChargeCents"\)/);
  assert.match(actions, /void formData\.get\("partnerId"\)/);
  assert.match(actions, /void formData\.get\("executeRefund"\)/);
  assert.match(actions, /requireRole\("PARTNER"/);
  assert.match(actions, /formData\.get\("purchaseId"\)/);
  assert.doesNotMatch(form, /name=["']amount["']/);
  assert.match(form, /Request Refund/);
  assert.match(
    form,
    /Submitting a request does not automatically issue a refund/
  );
  assert.match(
    form,
    /If installation details can be recovered from the provider/
  );
  assert.match(ordersPage, /PartnerRefundRequestControls/);
  assert.doesNotMatch(sharePage, /Request Refund|PartnerRefundRequest/);
  assert.match(customerService, /createCustomerRefundRequest/);
  assert.match(customerActions, /requireRole\("CUSTOMER"/);
  assert.doesNotMatch(constants, /iccid|LPA|providerCost/i);
  console.log("PASS offline_no_money_no_share_customer_untouched");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  assertLocalPhase3Db(url);
  runOfflineChecks();

  const prisma = new PrismaClient();
  const stamp = Date.now();
  const pw = await hashPassword(`Uat${randomBytes(18).toString("base64url")}!9`);

  try {
    const partnerA = await prisma.user.create({
      data: {
        name: "P3 Refund Partner A",
        email: `p3.refund.a.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 300,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 50_000, version: 0 } },
          },
        },
      },
      select: { id: true, partnerProfile: { select: { id: true } } },
    });
    const partnerB = await prisma.user.create({
      data: {
        name: "P3 Refund Partner B",
        email: `p3.refund.b.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 0,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 10_000, version: 0 } },
          },
        },
      },
      select: { id: true, partnerProfile: { select: { id: true } } },
    });
    const disabled = await prisma.user.create({
      data: {
        name: "P3 Refund Disabled",
        email: `p3.refund.d.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 0,
            discountVersion: 1,
            disabledAt: new Date(),
            walletAccount: { create: { balanceCents: 1_000, version: 0 } },
          },
        },
      },
      select: { id: true, partnerProfile: { select: { id: true } } },
    });

    const eligible = await seedPurchase(prisma, {
      partnerId: partnerA.partnerProfile!.id,
      email: `p3.refund.a.${stamp}@example.invalid`,
      tag: "ok",
      partnerChargeCents: 66,
      retailPriceCents: 68,
    });
    const other = await seedPurchase(prisma, {
      partnerId: partnerB.partnerProfile!.id,
      email: `p3.refund.b.${stamp}@example.invalid`,
      tag: "other",
    });
    const refunded = await seedPurchase(prisma, {
      partnerId: partnerA.partnerProfile!.id,
      email: `p3.refund.a.${stamp}@example.invalid`,
      tag: "done",
      refunded: true,
    });
    const disabledPurchase = await seedPurchase(prisma, {
      partnerId: disabled.partnerProfile!.id,
      email: `p3.refund.d.${stamp}@example.invalid`,
      tag: "dis",
    });

    const walletBefore = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId: partnerA.partnerProfile!.id },
      select: { balanceCents: true, version: true },
    });
    const refundTxBefore = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId: partnerA.partnerProfile!.id },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
      },
    });

    const created = await createPartnerRefundRequest({
      partnerUserId: partnerA.id,
      purchaseId: eligible.purchaseId,
      reason: "ESIM_NOT_RECEIVED",
      partnerNote: "Phone never got the QR",
      partnerChargeCents: 9999,
      refundAmountCents: 1,
    } as Parameters<typeof createPartnerRefundRequest>[0] & {
      partnerChargeCents: number;
      refundAmountCents: number;
    });
    assert.equal(created.duplicate, false);
    assert.equal(created.status, RefundRequestStatus.REQUESTED);
    assert.equal(created.partnerChargeCents, 66);
    assert.notEqual(created.partnerChargeCents, 68);
    console.log("PASS A_B_C_D_create_snapshot_ignores_client_amount");

    const row = await prisma.partnerRefundRequest.findUniqueOrThrow({
      where: { id: created.requestId },
      select: {
        partnerChargeCents: true,
        retailPriceCents: true,
        status: true,
        openPurchaseKey: true,
        executedRefundTransactionId: true,
        partnerNote: true,
      },
    });
    assert.equal(row.partnerChargeCents, 66);
    assert.equal(row.retailPriceCents, 68);
    assert.equal(row.status, RefundRequestStatus.REQUESTED);
    assert.equal(row.openPurchaseKey, eligible.purchaseId);
    assert.equal(row.executedRefundTransactionId, null);
    assert.equal(row.partnerNote, "Phone never got the QR");

    await expectCode(
      () =>
        createPartnerRefundRequest({
          partnerUserId: partnerA.id,
          purchaseId: other.purchaseId,
          reason: "OTHER",
        }),
      "PURCHASE_UNAVAILABLE"
    );
    console.log("PASS E_cross_partner_rejected");

    const dup = await createPartnerRefundRequest({
      partnerUserId: partnerA.id,
      purchaseId: eligible.purchaseId,
      reason: "OTHER",
    });
    assert.equal(dup.duplicate, true);
    assert.equal(dup.requestId, created.requestId);
    const count = await prisma.partnerRefundRequest.count({
      where: { partnerEsimPurchaseId: eligible.purchaseId },
    });
    assert.equal(count, 1);
    console.log("PASS F_duplicate_returns_existing");

    await expectCode(
      () =>
        createPartnerRefundRequest({
          partnerUserId: partnerA.id,
          purchaseId: refunded.purchaseId,
          reason: "OTHER",
        }),
      "NOT_ELIGIBLE"
    );
    console.log("PASS G_already_refunded_rejected");

    await expectCode(
      () =>
        createPartnerRefundRequest({
          partnerUserId: partnerA.id,
          purchaseId: eligible.purchaseId,
          reason: "WRONG_PLAN",
        }),
      "INVALID_REASON"
    );
    const extra = await seedPurchase(prisma, {
      partnerId: partnerA.partnerProfile!.id,
      email: `p3.refund.a.${stamp}@example.invalid`,
      tag: "note",
    });
    await expectCode(
      () =>
        createPartnerRefundRequest({
          partnerUserId: partnerA.id,
          purchaseId: extra.purchaseId,
          reason: "OTHER",
          partnerNote: "x".repeat(PARTNER_REFUND_NOTE_MAX + 1),
        }),
      "INVALID_NOTE"
    );
    console.log("PASS H_I_invalid_reason_and_note");

    const completed = await createPartnerRefundRequest({
      partnerUserId: partnerA.id,
      purchaseId: extra.purchaseId,
      reason: "INSTALL_DETAILS_UNAVAILABLE",
    });
    assert.equal(completed.status, RefundRequestStatus.REQUESTED);
    const extraPurchase = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: extra.purchaseId },
      select: { refundTransactionId: true, status: true },
    });
    assert.equal(extraPurchase.refundTransactionId, null);
    assert.equal(extraPurchase.status, PartnerEsimPurchaseStatus.COMPLETED);
    console.log("PASS J_completed_may_request_no_money");

    await expectCode(
      () =>
        createPartnerRefundRequest({
          partnerUserId: disabled.id,
          purchaseId: disabledPurchase.purchaseId,
          reason: "OTHER",
        }),
      "PARTNER_UNAVAILABLE"
    );
    console.log("PASS O_disabled_partner_fail_safe");

    const walletAfter = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId: partnerA.partnerProfile!.id },
      select: { balanceCents: true, version: true },
    });
    assert.equal(walletAfter.balanceCents, walletBefore.balanceCents);
    assert.equal(walletAfter.version, walletBefore.version);
    const refundTxAfter = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId: partnerA.partnerProfile!.id },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
      },
    });
    assert.equal(refundTxAfter, refundTxBefore);
    const eligiblePurchase = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: eligible.purchaseId },
      select: { refundTransactionId: true },
    });
    assert.equal(eligiblePurchase.refundTransactionId, null);
    console.log("PASS K_L_M_no_provider_wallet_or_refund_link");

    const audits = await prisma.auditLog.findMany({
      where: {
        action: PARTNER_REFUND_AUDIT.CREATED,
        targetId: created.requestId,
      },
      select: { metadata: true },
    });
    assert.equal(audits.length, 1);
    const meta = JSON.stringify(audits[0]?.metadata ?? {});
    assert.match(meta, /"partnerChargeCents":66/);
    assert.doesNotMatch(meta, /Phone never got|iccid|LPA:|providerCost|8900/i);
    const dupAudits = await prisma.auditLog.count({
      where: {
        action: PARTNER_REFUND_AUDIT.CREATED,
        targetId: created.requestId,
      },
    });
    assert.equal(dupAudits, 1);
    console.log("PASS P_audit_safe_no_duplicate_on_retry");

    console.log("ALL_QA_PASSED=partner-refund-request");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
