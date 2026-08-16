/**
 * Isolated LOCAL Partner refund Admin review QA (Slice 2).
 * DATABASE_URL must be 127.0.0.1:55440 / map_esim_partner_phase3_uat.
 * Review transitions only — no wallet credit, no provider call, no Production.
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
  RefundRequestReason,
  RefundRequestStatus,
  Role,
} from "@prisma/client";
import { hashPassword } from "../app/lib/auth/password";
import { createPartnerRefundRequest } from "../app/lib/partner/partnerRefundRequest";
import {
  applyAdminPartnerRefundRequestDecision,
  getAdminPartnerRefundRequestDetail,
  listAdminPartnerRefundRequests,
  PartnerRefundRequestAdminError,
} from "../app/lib/partner/partnerRefundRequestAdmin";
import {
  PARTNER_REFUND_AUDIT,
  partnerRefundStatusLabel,
} from "../app/lib/partner/partnerRefundRequestConstants";
import { listAdminRefundRequests } from "../app/lib/refunds/refundRequestAdmin";
import { listAdminUnifiedRefundRequests } from "../app/lib/refunds/unifiedRefundRequestAdmin";
import {
  parseUnifiedRefundSource,
  unifiedRefundSourceLabel,
} from "../app/lib/refunds/unifiedRefundRequestDisplay";

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
  return `pep_preadmin_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 128);
}

async function expectAdminCode(
  fn: () => Promise<unknown>,
  code: PartnerRefundRequestAdminError["code"]
): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code}`);
  } catch (err) {
    assert.ok(err instanceof PartnerRefundRequestAdminError);
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
    iccidLast4?: string;
  }
): Promise<{ purchaseId: string; orderId: string }> {
  const partnerChargeCents = options.partnerChargeCents ?? 66;
  const retailPriceCents = options.retailPriceCents ?? 68;
  const order = await prisma.order.create({
    data: {
      providerOrderId: `PO-PREADM-${options.tag}-${randomBytes(4).toString("hex")}`,
      customerEmail: options.email,
      offerId: `ESIM-PREADM-${options.tag}`,
      destination: "Pakistan",
      planName: "QA Refund 100MB",
      dataAllowance: "102 MB",
      validity: "7 Days",
      fundingSource: OrderFundingSource.PARTNER_BALANCE,
      status: OrderStatus.COMPLETED,
      iccidLast4: options.iccidLast4 ?? null,
      iccidCapturedAt: options.iccidLast4 ? new Date() : null,
      partnerEsimPurchase: {
        create: {
          partnerId: options.partnerId,
          offerId: `ESIM-PREADM-${options.tag}`,
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
    select: { id: true, balanceCents: true },
  });
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
      idempotencyKey: `qa_admind_${purchaseId}`.slice(0, 128),
    },
    select: { id: true },
  });
  await prisma.partnerEsimPurchase.update({
    where: { id: purchaseId },
    data: { debitTransactionId: debit.id },
  });
  return { purchaseId, orderId: order.id };
}

function runOfflineChecks(): void {
  const admin = read("app/lib/partner/partnerRefundRequestAdmin.ts");
  const actions = read("app/lib/partner/partnerRefundRequestAdminActions.ts");
  const form = read("app/components/admin/AdminPartnerRefundRequestActions.tsx");
  const listPage = read("app/admin/refund-requests/page.tsx");
  const partnerDetail = read("app/admin/refund-requests/partner/[id]/page.tsx");
  const customerDetail = read("app/admin/refund-requests/[id]/page.tsx");
  const customerService = read("app/lib/refunds/refundRequest.ts");
  const customerAdmin = read("app/lib/refunds/refundRequestAdmin.ts");
  const nav = read("app/components/admin/AdminNav.tsx");
  const partnerForm = read(
    "app/components/partner/PartnerRefundRequestControls.tsx"
  );
  const constants = read("app/lib/partner/partnerRefundRequestConstants.ts");
  const pkg = read("package.json");

  assert.match(pkg, /qa:partner-refund-admin/);
  assert.match(listPage, /requireRole\("ADMIN"\)/);
  assert.match(listPage, /listAdminUnifiedRefundRequests/);
  assert.match(listPage, /source=/);
  assert.match(listPage, /Partner debit/);
  assert.match(partnerDetail, /requireRole\("ADMIN"\)/);
  assert.match(partnerDetail, /EXACT PARTNER DEBIT/);
  assert.match(
    partnerDetail,
    /Approval does not issue the refund/
  );
  assert.match(
    partnerDetail,
    /Recover installation details before considering a refund/
  );
  assert.match(
    partnerDetail,
    /This order appears provisioned/
  );
  assert.doesNotMatch(partnerDetail, /name=["']amount["']/);
  assert.doesNotMatch(form, /name=["']amount["']/);
  assert.match(form, /Start review/);
  assert.match(form, /Approve for execution/);
  assert.match(form, /Reject request/);
  assert.doesNotMatch(form, /Issue refund|Execute refund|Credit wallet/i);
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /assertSameOriginAdminRequest/);
  assert.match(actions, /void formData\.get\("amount"\)/);
  assert.match(actions, /void formData\.get\("partnerId"\)/);
  assert.match(actions, /void formData\.get\("executeRefund"\)/);
  assert.match(actions, /void formData\.get\("targetStatus"\)/);
  assert.match(admin, /applyAdminPartnerRefundRequestDecision/);
  assert.match(admin, /void input\.amount/);
  assert.match(admin, /void input\.partnerId/);
  assert.match(admin, /void input\.executeRefund/);
  assert.doesNotMatch(admin, /refundPartnerPurchaseFundsInTx/);
  assert.doesNotMatch(admin, /refundReconciliationPartnerPurchase/);
  assert.doesNotMatch(admin, /ESIM_PURCHASE_REFUND/);
  assert.doesNotMatch(admin, /from ["']@\/app\/lib\/vesim/);
  assert.doesNotMatch(admin, /refundTransactionId:\s*/);
  assert.doesNotMatch(admin, /completedAt:\s/);
  assert.doesNotMatch(admin, /providerCostCents/);
  assert.doesNotMatch(partnerDetail, /providerCost|iccidEncrypted|full ICCID|\bLPA\b/i);
  assert.match(constants, /partner_refund\.review_started/);
  assert.match(constants, /partner_refund\.approved_pending_execution/);
  assert.match(constants, /partner_refund\.rejected/);
  assert.equal(partnerRefundStatusLabel("REQUESTED"), "Refund requested");
  assert.equal(partnerRefundStatusLabel("UNDER_REVIEW"), "Under review");
  assert.equal(
    partnerRefundStatusLabel("APPROVED_PENDING_EXECUTION"),
    "Approved — refund pending"
  );
  assert.equal(
    partnerRefundStatusLabel("REJECTED"),
    "Refund request rejected"
  );
  assert.match(partnerForm, /existingRequest\.statusLabel/);
  assert.match(partnerForm, /existingRequest\.decisionNote/);
  assert.match(partnerForm, /!existingRequest\?\.isOpen/);
  assert.equal(parseUnifiedRefundSource("partner"), "partner");
  assert.equal(parseUnifiedRefundSource("nope"), "all");
  assert.equal(unifiedRefundSourceLabel("partner"), "Partner");

  const refundHrefs = nav.match(/\/admin\/refund-requests/g) ?? [];
  assert.equal(refundHrefs.length, 1);
  assert.doesNotMatch(nav, /Partner refund/);

  assert.match(customerDetail, /Payment composition/);
  assert.match(customerDetail, /Provider result/);
  assert.match(customerDetail, /ICCID \(masked\)/);
  assert.match(customerAdmin, /listAdminRefundRequests/);
  assert.match(customerAdmin, /getAdminRefundRequestDetail/);
  assert.match(customerService, /createCustomerRefundRequest/);
  assert.match(customerService, /applyAdminRefundRequestDecision/);
  assert.doesNotMatch(customerService, /PartnerRefundRequest/);
  console.log("PASS offline_admin_review_no_money_customer_untouched");
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
    const admin = await prisma.user.create({
      data: {
        name: "QA Admin Partner Refund",
        email: `qa.admin.pref.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    const customer = await prisma.user.create({
      data: {
        name: "QA Customer Refund Queue",
        email: `qa.cust.pref.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true },
    });
    const partner = await prisma.user.create({
      data: {
        name: "P3 Admin Review Partner",
        email: `p3.admin.rev.${stamp}@example.invalid`,
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
      select: { id: true, email: true, partnerProfile: { select: { id: true } } },
    });
    const partnerId = partner.partnerProfile!.id;

    const reviewable = await seedPurchase(prisma, {
      partnerId,
      email: partner.email,
      tag: "rev",
      partnerChargeCents: 66,
      retailPriceCents: 68,
      iccidLast4: "4321",
    });
    const rejectable = await seedPurchase(prisma, {
      partnerId,
      email: partner.email,
      tag: "rej",
    });
    const recon = await seedPurchase(prisma, {
      partnerId,
      email: partner.email,
      tag: "rec",
      status: PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
    });
    const customerOrder = await prisma.order.create({
      data: {
        providerOrderId: `PO-CUST-${stamp}`,
        customerEmail: customer.email,
        offerId: "ESIM-CUST-QA",
        destination: "Turkey",
        planName: "QA Customer 1GB",
        dataAllowance: "1 GB",
        validity: "7 Days",
        fundingSource: OrderFundingSource.CUSTOMER_WALLET,
        status: OrderStatus.COMPLETED,
        userId: customer.id,
      },
      select: { id: true },
    });
    const customerRefund = await prisma.refundRequest.create({
      data: {
        orderId: customerOrder.id,
        customerUserId: customer.id,
        reason: RefundRequestReason.ESIM_NOT_RECEIVED,
        status: RefundRequestStatus.REQUESTED,
        refundAmountCents: 199,
        openOrderKey: customerOrder.id,
      },
      select: { id: true },
    });

    const created = await createPartnerRefundRequest({
      partnerUserId: partner.id,
      purchaseId: reviewable.purchaseId,
      reason: "INSTALL_DETAILS_UNAVAILABLE",
      partnerNote: "QR never arrived",
    });
    const createdReject = await createPartnerRefundRequest({
      partnerUserId: partner.id,
      purchaseId: rejectable.purchaseId,
      reason: "OTHER",
    });
    const createdRecon = await createPartnerRefundRequest({
      partnerUserId: partner.id,
      purchaseId: recon.purchaseId,
      reason: "PROVIDER_OR_ORDER_ISSUE",
    });

    const walletBefore = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId },
      select: { balanceCents: true, version: true },
    });
    const refundTxBefore = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
      },
    });

    const unifiedAll = await listAdminUnifiedRefundRequests({
      source: "all",
      limit: 100,
    });
    assert.ok(unifiedAll.some((row) => row.id === created.requestId && row.source === "partner"));
    assert.ok(
      unifiedAll.some((row) => row.id === customerRefund.id && row.source === "customer")
    );
    const partnerRow = unifiedAll.find((row) => row.id === created.requestId);
    assert.ok(partnerRow);
    assert.equal(partnerRow.debitLabel, "$0.66 USD");
    assert.equal(partnerRow.retailLabel, "$0.68 USD");
    assert.equal(partnerRow.amountLabel, "$0.66 USD");
    assert.match(partnerRow.actorLabel, /P3 Admin Review Partner/);
    console.log("PASS A_B_partner_and_customer_in_unified_queue");

    const customerOnly = await listAdminUnifiedRefundRequests({
      source: "customer",
      limit: 100,
    });
    assert.ok(customerOnly.every((row) => row.source === "customer"));
    assert.ok(customerOnly.some((row) => row.id === customerRefund.id));
    assert.ok(!customerOnly.some((row) => row.id === created.requestId));
    const partnerOnly = await listAdminUnifiedRefundRequests({
      source: "partner",
      limit: 100,
    });
    assert.ok(partnerOnly.every((row) => row.source === "partner"));
    assert.ok(partnerOnly.some((row) => row.id === created.requestId));
    assert.ok(!partnerOnly.some((row) => row.id === customerRefund.id));
    const customerList = await listAdminRefundRequests(50);
    assert.ok(customerList.some((row) => row.id === customerRefund.id));
    console.log("PASS C_source_filter_customer_partner");

    await expectAdminCode(
      () =>
        applyAdminPartnerRefundRequestDecision({
          adminUserId: admin.id,
          requestId: created.requestId,
          action: "approve",
          amount: 9999,
        }),
      "INVALID_TRANSITION"
    );
    const start = await applyAdminPartnerRefundRequestDecision({
      adminUserId: admin.id,
      requestId: created.requestId,
      action: "mark_under_review",
      amount: 9999,
      partnerId: "browser-forged",
      executeRefund: true,
      targetStatus: "COMPLETED",
    });
    assert.equal(start.status, RefundRequestStatus.UNDER_REVIEW);
    assert.equal(start.idempotent, false);
    const startAgain = await applyAdminPartnerRefundRequestDecision({
      adminUserId: admin.id,
      requestId: created.requestId,
      action: "mark_under_review",
    });
    assert.equal(startAgain.status, RefundRequestStatus.UNDER_REVIEW);
    assert.equal(startAgain.idempotent, true);
    const startAudits = await prisma.auditLog.count({
      where: {
        action: PARTNER_REFUND_AUDIT.REVIEW_STARTED,
        targetId: created.requestId,
      },
    });
    assert.equal(startAudits, 1);
    console.log("PASS D_N_start_review_idempotent");

    const detailReview = await getAdminPartnerRefundRequestDetail(
      created.requestId
    );
    assert.ok(detailReview);
    assert.equal(detailReview.partnerChargeCents, 66);
    assert.equal(detailReview.refundBasisLabel, "$0.66 USD");
    assert.equal(detailReview.retailLabel, "$0.68 USD");
    assert.equal(detailReview.canApprove, true);
    assert.equal(detailReview.canReject, true);
    assert.equal(detailReview.appearsProvisioned, true);
    assert.equal(detailReview.reason, "INSTALL_DETAILS_UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(detailReview), /8900|LPA|providerCost|iccidEncrypted/i);
    const reconDetail = await getAdminPartnerRefundRequestDetail(
      createdRecon.requestId
    );
    assert.ok(reconDetail?.hasReconciliationCase);
    assert.match(
      reconDetail!.reconciliationHref ?? "",
      /\/admin\/reconciliation\/partner_purchase\//
    );
    console.log("PASS J_P_refund_basis_and_safe_detail");

    const approved = await applyAdminPartnerRefundRequestDecision({
      adminUserId: admin.id,
      requestId: created.requestId,
      action: "approve",
      decisionNote: "Looks eligible later",
      amount: 1,
      amountCents: 1,
      executeRefund: true,
    });
    assert.equal(approved.status, RefundRequestStatus.APPROVED_PENDING_EXECUTION);
    const approvedAgain = await applyAdminPartnerRefundRequestDecision({
      adminUserId: admin.id,
      requestId: created.requestId,
      action: "approve",
    });
    assert.equal(approvedAgain.idempotent, true);
    const approveAudits = await prisma.auditLog.findMany({
      where: {
        action: PARTNER_REFUND_AUDIT.APPROVED_PENDING,
        targetId: created.requestId,
      },
      select: { metadata: true },
    });
    assert.equal(approveAudits.length, 1);
    const approveMeta = JSON.stringify(approveAudits[0]?.metadata ?? {});
    assert.match(approveMeta, /"partnerChargeCents":66/);
    assert.doesNotMatch(approveMeta, /Looks eligible|iccid|LPA|providerCost/i);
    console.log("PASS E_N_approve_pending_execution_idempotent");

    await expectAdminCode(
      () =>
        applyAdminPartnerRefundRequestDecision({
          adminUserId: admin.id,
          requestId: createdReject.requestId,
          action: "reject",
          decisionNote: "No",
        }),
      "INVALID_TRANSITION"
    );
    await applyAdminPartnerRefundRequestDecision({
      adminUserId: admin.id,
      requestId: createdReject.requestId,
      action: "mark_under_review",
    });
    await expectAdminCode(
      () =>
        applyAdminPartnerRefundRequestDecision({
          adminUserId: admin.id,
          requestId: createdReject.requestId,
          action: "reject",
        }),
      "INVALID_NOTE"
    );
    const rejected = await applyAdminPartnerRefundRequestDecision({
      adminUserId: admin.id,
      requestId: createdReject.requestId,
      action: "reject",
      decisionNote: "Provider order is healthy; recover install instead.",
    });
    assert.equal(rejected.status, RefundRequestStatus.REJECTED);
    const rejectedAgain = await applyAdminPartnerRefundRequestDecision({
      adminUserId: admin.id,
      requestId: createdReject.requestId,
      action: "reject",
    });
    assert.equal(rejectedAgain.idempotent, true);
    console.log("PASS F_G_H_reject_requires_note_invalid_closed");

    await expectAdminCode(
      () =>
        applyAdminPartnerRefundRequestDecision({
          adminUserId: customer.id,
          requestId: created.requestId,
          action: "mark_under_review",
        }),
      "UNAVAILABLE"
    );

    const after = await prisma.partnerRefundRequest.findUniqueOrThrow({
      where: { id: created.requestId },
      select: {
        partnerChargeCents: true,
        retailPriceCents: true,
        status: true,
        executedRefundTransactionId: true,
        completedAt: true,
      },
    });
    assert.equal(after.partnerChargeCents, 66);
    assert.equal(after.retailPriceCents, 68);
    assert.equal(after.status, RefundRequestStatus.APPROVED_PENDING_EXECUTION);
    assert.equal(after.executedRefundTransactionId, null);
    assert.equal(after.completedAt, null);

    const purchaseAfter = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: reviewable.purchaseId },
      select: { refundTransactionId: true, status: true },
    });
    assert.equal(purchaseAfter.refundTransactionId, null);
    assert.equal(purchaseAfter.status, PartnerEsimPurchaseStatus.COMPLETED);

    const walletAfter = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId },
      select: { balanceCents: true, version: true },
    });
    assert.equal(walletAfter.balanceCents, walletBefore.balanceCents);
    assert.equal(walletAfter.version, walletBefore.version);
    const refundTxAfter = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
      },
    });
    assert.equal(refundTxAfter, refundTxBefore);
    console.log("PASS I_K_L_M_no_amount_wallet_refund_or_provider");

    const { listPartnerRefundRequestSummaries } = await import(
      "../app/lib/partner/partnerRefundRequest"
    );
    const summaries = await listPartnerRefundRequestSummaries({
      partnerUserId: partner.id,
      purchaseIds: [reviewable.purchaseId, rejectable.purchaseId],
    });
    const approvedSummary = summaries.find(
      (row) => row.requestId === created.requestId
    );
    const rejectedSummary = summaries.find(
      (row) => row.requestId === createdReject.requestId
    );
    assert.equal(approvedSummary?.statusLabel, "Approved — refund pending");
    assert.equal(rejectedSummary?.statusLabel, "Refund request rejected");
    assert.equal(
      rejectedSummary?.adminDecisionNote,
      "Provider order is healthy; recover install instead."
    );
    assert.equal(approvedSummary?.adminDecisionNote, null);
    console.log("PASS O_partner_safe_status_and_reject_note");

    const partnerList = await listAdminPartnerRefundRequests(100);
    assert.ok(partnerList.some((row) => row.id === created.requestId));
    const customerDetail = await (
      await import("../app/lib/refunds/refundRequestAdmin")
    ).getAdminRefundRequestDetail(customerRefund.id);
    assert.ok(customerDetail);
    assert.equal(customerDetail.status, RefundRequestStatus.REQUESTED);
    assert.match(customerDetail.amountLabel, /\$1\.99/);
    console.log("PASS Q_customer_refund_admin_detail_still_works");

    console.log("ALL_QA_PASSED=partner-refund-admin");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
