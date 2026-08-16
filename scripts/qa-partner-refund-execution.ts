/**
 * Isolated LOCAL Partner refund-request execution QA (Slice 3).
 * DATABASE_URL must be 127.0.0.1:55440 / map_esim_partner_phase3_uat.
 * No Production. No provider purchase. Exact Partner debit only.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
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
import { REFUND_PARTNER_FUNDS_PHRASE } from "../app/lib/admin/reconciliationCaseShared";
import { hashPassword } from "../app/lib/auth/password";
import { createPartnerRefundRequest } from "../app/lib/partner/partnerRefundRequest";
import { applyAdminPartnerRefundRequestDecision } from "../app/lib/partner/partnerRefundRequestAdmin";
import {
  executeAdminPartnerRefundRequest,
  PartnerRefundRequestExecutionError,
} from "../app/lib/partner/partnerRefundRequestExecution";
import {
  evaluatePartnerRefundRequestExecutionEligibility,
  partnerRefundExecutionBlockerLabel,
} from "../app/lib/partner/partnerRefundRequestExecutionShared";
import { PARTNER_REFUND_AUDIT } from "../app/lib/partner/partnerRefundRequestConstants";
import {
  partnerEsimPurchaseRefundIdempotencyKey,
  refundPartnerPurchaseFundsInTx,
} from "../app/lib/partner/partnerPurchaseWallet";

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
  return `pep_prex_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 128);
}

async function expectExec(
  fn: () => Promise<unknown>,
  code: PartnerRefundRequestExecutionError["code"]
): Promise<PartnerRefundRequestExecutionError> {
  try {
    await fn();
    throw new Error(`expected ${code}`);
  } catch (err) {
    assert.ok(err instanceof PartnerRefundRequestExecutionError);
    assert.equal(err.code, code);
    return err;
  }
}

async function seedEligiblePurchase(
  prisma: PrismaClient,
  options: {
    partnerId: string;
    tag: string;
    partnerChargeCents?: number;
    retailPriceCents?: number;
    status?: PartnerEsimPurchaseStatus;
    withCompletedOrder?: boolean;
    iccidLast4?: string;
    installData?: string | null;
    providerOrderId?: string;
  }
): Promise<{ purchaseId: string; orderId: string | null }> {
  const partnerChargeCents = options.partnerChargeCents ?? 66;
  const retailPriceCents = options.retailPriceCents ?? 68;
  const status =
    options.status ?? PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED;
  const providerOrderId =
    options.providerOrderId ??
    `PO-PREX-${options.tag}-${randomBytes(4).toString("hex")}`;

  let orderId: string | null = null;
  if (options.withCompletedOrder) {
    const order = await prisma.order.create({
      data: {
        providerOrderId: `${providerOrderId}-ORD`,
        customerEmail: `prex.${options.tag}@example.invalid`,
        offerId: `ESIM-PREX-${options.tag}`,
        destination: "Pakistan",
        planName: "QA Exec 100MB",
        dataAllowance: "102 MB",
        validity: "7 Days",
        fundingSource: OrderFundingSource.PARTNER_BALANCE,
        status: OrderStatus.COMPLETED,
        iccidLast4: options.iccidLast4 ?? null,
        iccidCapturedAt: options.iccidLast4 ? new Date() : null,
      },
      select: { id: true },
    });
    orderId = order.id;
  }

  const purchase = await prisma.partnerEsimPurchase.create({
    data: {
      partnerId: options.partnerId,
      offerId: `ESIM-PREX-${options.tag}`,
      destinationCode: "PK",
      destinationName: "Pakistan",
      planName: "QA Exec 100MB",
      dataAllowance: "102 MB",
      validity: "7 Days",
      retailPriceCents,
      discountBps: 300,
      discountVersion: 1,
      partnerChargeCents,
      providerCostCents: 50,
      fundingSource: OrderFundingSource.PARTNER_BALANCE,
      status,
      idempotencyKey: idem(options.tag),
      providerOrderId,
      orderId,
      providerRefreshInstallData: options.installData ?? null,
    },
    select: { id: true },
  });

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
      reason: "QA execution debit",
      referenceType: "PartnerEsimPurchase",
      referenceId: purchase.id,
      idempotencyKey: `qa_exdebit_${purchase.id}`.slice(0, 128),
    },
    select: { id: true },
  });
  await prisma.partnerEsimPurchase.update({
    where: { id: purchase.id },
    data: { debitTransactionId: debit.id },
  });
  return { purchaseId: purchase.id, orderId };
}

async function approveRequest(
  adminId: string,
  partnerUserId: string,
  purchaseId: string,
  reason = "PROVIDER_OR_ORDER_ISSUE"
): Promise<string> {
  const created = await createPartnerRefundRequest({
    partnerUserId,
    purchaseId,
    reason,
  });
  await applyAdminPartnerRefundRequestDecision({
    adminUserId: adminId,
    requestId: created.requestId,
    action: "mark_under_review",
  });
  await applyAdminPartnerRefundRequestDecision({
    adminUserId: adminId,
    requestId: created.requestId,
    action: "approve",
    decisionNote: "Approved for later execution",
  });
  return created.requestId;
}

function runOfflineChecks(): void {
  const exec = read("app/lib/partner/partnerRefundRequestExecution.ts");
  const actions = read("app/lib/partner/partnerRefundRequestExecutionActions.ts");
  const form = read(
    "app/components/admin/AdminPartnerRefundRequestExecute.tsx"
  );
  const wallet = read("app/lib/partner/partnerPurchaseWallet.ts");
  const customer = read("app/lib/refunds/refundRequest.ts");
  const pkg = read("package.json");

  assert.match(pkg, /qa:partner-refund-execution/);
  assert.match(exec, /refundPartnerPurchaseFundsInTx/);
  assert.match(exec, /void input\.amount/);
  assert.match(exec, /void input\.partnerId/);
  assert.match(exec, /confirmProviderFailure/);
  assert.doesNotMatch(exec, /method:\s*["']POST["']/);
  assert.doesNotMatch(exec, /checkoutPartner|createProvider|purchaseOffer/);
  assert.match(actions, /requireRole\("ADMIN"\)/);
  assert.match(actions, /assertSameOriginAdminRequest/);
  assert.match(actions, /void formData\.get\("amount"\)/);
  assert.match(form, /Execute Partner refund/);
  assert.match(form, /REFUND_PARTNER_FUNDS_PHRASE/);
  assert.doesNotMatch(form, /name=["']amount["']/);
  assert.match(wallet, /Disabled Partners may still receive ESIM_PURCHASE_REFUND/);
  assert.match(customer, /applyAdminRefundRequestDecision/);
  assert.doesNotMatch(customer, /executeAdminPartnerRefundRequest/);

  const blocked = evaluatePartnerRefundRequestExecutionEligibility({
    requestStatus: "APPROVED_PENDING_EXECUTION",
    requestReason: "INSTALL_DETAILS_UNAVAILABLE",
    requestPartnerId: "p1",
    requestPartnerChargeCents: 66,
    purchasePartnerId: "p1",
    purchaseStatus: "RECONCILIATION_REQUIRED",
    fundingSource: "PARTNER_BALANCE",
    purchasePartnerChargeCents: 66,
    debitTransactionId: "d1",
    debitAmountCents: 66,
    refundTransactionId: null,
    orderId: null,
    orderStatus: null,
    iccidPresent: false,
    installEvidencePresent: false,
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.blocker, "INSTALL_RECOVERY_REQUIRED");
  }
  assert.match(
    partnerRefundExecutionBlockerLabel("ICCID_PRESENT"),
    /ICCID evidence exists/
  );
  console.log("PASS offline_execution_gates_no_provider_write");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  assertLocalPhase3Db(url);
  runOfflineChecks();

  const prisma = new PrismaClient();
  const stamp = Date.now();
  const pw = await hashPassword(`Uat${randomBytes(18).toString("base64url")}!9`);
  const confirmOk = async () => ({ ok: true as const });
  const confirmUncertain = async () => ({
    ok: false as const,
    blocker: "provider_uncertain",
  });

  try {
    const admin = await prisma.user.create({
      data: {
        name: "QA Exec Admin",
        email: `qa.exec.admin.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    const customer = await prisma.user.create({
      data: {
        name: "QA Exec Customer",
        email: `qa.exec.cust.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.CUSTOMER,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    const partner = await prisma.user.create({
      data: {
        name: "QA Exec Partner",
        email: `qa.exec.p.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 300,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 10_000, version: 0 } },
          },
        },
      },
      select: { id: true, partnerProfile: { select: { id: true } } },
    });
    const partnerId = partner.partnerProfile!.id;

    const eligible = await seedEligiblePurchase(prisma, {
      partnerId,
      tag: "ok",
    });
    const requestId = await approveRequest(
      admin.id,
      partner.id,
      eligible.purchaseId
    );

    const walletBefore = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId },
      select: { balanceCents: true, version: true },
    });

    await expectExec(
      () =>
        executeAdminPartnerRefundRequest({
          adminUserId: admin.id,
          requestId,
          confirmPhrase: "WRONG PHRASE",
          confirmProviderFailureFn: confirmOk,
        }),
      "INVALID_PHRASE"
    );
    await expectExec(
      () =>
        executeAdminPartnerRefundRequest({
          adminUserId: customer.id,
          requestId,
          confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
          confirmProviderFailureFn: confirmOk,
        }),
      "UNAVAILABLE"
    );
    console.log("PASS V_W_phrase_and_non_admin");

    const requestedOnly = await seedEligiblePurchase(prisma, {
      partnerId,
      tag: "req",
    });
    const createdOnly = await createPartnerRefundRequest({
      partnerUserId: partner.id,
      purchaseId: requestedOnly.purchaseId,
      reason: "OTHER",
    });
    await expectExec(
      () =>
        executeAdminPartnerRefundRequest({
          adminUserId: admin.id,
          requestId: createdOnly.requestId,
          confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
          confirmProviderFailureFn: confirmOk,
        }),
      "NOT_APPROVED"
    );
    console.log("PASS U_unapproved_cannot_execute");

    const first = await executeAdminPartnerRefundRequest({
      adminUserId: admin.id,
      requestId,
      confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
      amount: 9999,
      amountCents: 1,
      partnerId: "forged",
      execute: true,
      confirmProviderFailureFn: confirmOk,
    });
    assert.equal(first.status, RefundRequestStatus.COMPLETED);
    assert.equal(first.amountCents, 66);
    assert.equal(first.idempotent, false);

    const walletAfter = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId },
      select: { balanceCents: true },
    });
    assert.equal(walletAfter.balanceCents, walletBefore.balanceCents + 66);

    const refundRows = await prisma.partnerWalletTransaction.findMany({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
        referenceId: eligible.purchaseId,
      },
    });
    assert.equal(refundRows.length, 1);
    assert.equal(refundRows[0]?.amountCents, 66);
    assert.notEqual(refundRows[0]?.amountCents, 68);
    assert.equal(
      refundRows[0]?.idempotencyKey,
      partnerEsimPurchaseRefundIdempotencyKey(eligible.purchaseId)
    );

    const purchaseAfter = await prisma.partnerEsimPurchase.findUniqueOrThrow({
      where: { id: eligible.purchaseId },
      select: { refundTransactionId: true, status: true },
    });
    assert.equal(purchaseAfter.refundTransactionId, refundRows[0]?.id);
    assert.equal(purchaseAfter.status, PartnerEsimPurchaseStatus.FAILED_REFUNDED);

    const reqAfter = await prisma.partnerRefundRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        status: true,
        executedRefundTransactionId: true,
        completedAt: true,
        openPurchaseKey: true,
        partnerChargeCents: true,
      },
    });
    assert.equal(reqAfter.status, RefundRequestStatus.COMPLETED);
    assert.equal(reqAfter.executedRefundTransactionId, refundRows[0]?.id);
    assert.ok(reqAfter.completedAt);
    assert.equal(reqAfter.openPurchaseKey, null);
    assert.equal(reqAfter.partnerChargeCents, 66);
    console.log("PASS A_B_C_D_E_F_G_H_K_exact_debit_completed");

    const second = await executeAdminPartnerRefundRequest({
      adminUserId: admin.id,
      requestId,
      confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
      confirmProviderFailureFn: confirmOk,
    });
    assert.equal(second.idempotent, true);
    assert.equal(second.refundTransactionId, first.refundTransactionId);
    const refundCount = await prisma.partnerWalletTransaction.count({
      where: {
        wallet: { partnerId },
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
        referenceId: eligible.purchaseId,
      },
    });
    assert.equal(refundCount, 1);
    const walletAgain = await prisma.partnerWalletAccount.findUniqueOrThrow({
      where: { partnerId },
      select: { balanceCents: true },
    });
    assert.equal(walletAgain.balanceCents, walletAfter.balanceCents);
    console.log("PASS I_J_duplicate_execution_idempotent");

    const uncertain = await seedEligiblePurchase(prisma, {
      partnerId,
      tag: "unc",
    });
    const uncertainId = await approveRequest(
      admin.id,
      partner.id,
      uncertain.purchaseId
    );
    const balBeforeUnc = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    await expectExec(
      () =>
        executeAdminPartnerRefundRequest({
          adminUserId: admin.id,
          requestId: uncertainId,
          confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
          confirmProviderFailureFn: confirmUncertain,
        }),
      "PROVIDER_UNCERTAIN"
    );
    const uncReq = await prisma.partnerRefundRequest.findUniqueOrThrow({
      where: { id: uncertainId },
      select: { status: true, executedRefundTransactionId: true },
    });
    assert.equal(uncReq.status, RefundRequestStatus.APPROVED_PENDING_EXECUTION);
    assert.equal(uncReq.executedRefundTransactionId, null);
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents,
      balBeforeUnc
    );
    console.log("PASS L_uncertain_provider_zero_money");

    const completed = await seedEligiblePurchase(prisma, {
      partnerId,
      tag: "cmp",
      status: PartnerEsimPurchaseStatus.COMPLETED,
      withCompletedOrder: true,
    });
    const completedId = await approveRequest(
      admin.id,
      partner.id,
      completed.purchaseId
    );
    await expectExec(
      () =>
        executeAdminPartnerRefundRequest({
          adminUserId: admin.id,
          requestId: completedId,
          confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
          confirmProviderFailureFn: confirmOk,
        }),
      "ORDER_ALREADY_FULFILLED"
    );
    console.log("PASS M_completed_order_blocked");

    const iccid = await seedEligiblePurchase(prisma, {
      partnerId,
      tag: "icc",
      withCompletedOrder: true,
      iccidLast4: "4321",
      status: PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED,
    });
    const iccidId = await approveRequest(admin.id, partner.id, iccid.purchaseId);
    await expectExec(
      () =>
        executeAdminPartnerRefundRequest({
          adminUserId: admin.id,
          requestId: iccidId,
          confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
          confirmProviderFailureFn: confirmOk,
        }),
      "ICCID_PRESENT"
    );
    console.log("PASS N_iccid_blocked");

    const install = await seedEligiblePurchase(prisma, {
      partnerId,
      tag: "ins",
      installData: "yes",
    });
    const installId = await approveRequest(
      admin.id,
      partner.id,
      install.purchaseId
    );
    await expectExec(
      () =>
        executeAdminPartnerRefundRequest({
          adminUserId: admin.id,
          requestId: installId,
          confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
          confirmProviderFailureFn: confirmOk,
        }),
      "INSTALL_DETAILS_PRESENT"
    );
    console.log("PASS O_install_data_blocked");

    const missing = await seedEligiblePurchase(prisma, {
      partnerId,
      tag: "mis",
    });
    const missingId = await approveRequest(
      admin.id,
      partner.id,
      missing.purchaseId,
      "INSTALL_DETAILS_UNAVAILABLE"
    );
    const balBeforeMis = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    await expectExec(
      () =>
        executeAdminPartnerRefundRequest({
          adminUserId: admin.id,
          requestId: missingId,
          confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
          confirmProviderFailureFn: confirmOk,
        }),
      "INSTALL_RECOVERY_REQUIRED"
    );
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents,
      balBeforeMis
    );
    console.log("PASS P_missing_install_recovery_required");

    const already = await seedEligiblePurchase(prisma, {
      partnerId,
      tag: "alr",
    });
    const alreadyId = await approveRequest(
      admin.id,
      partner.id,
      already.purchaseId
    );
    const prior = await prisma.$transaction((tx) =>
      refundPartnerPurchaseFundsInTx(tx, {
        partnerId,
        partnerEsimPurchaseId: already.purchaseId,
        amountCents: 66,
      })
    );
    await prisma.partnerEsimPurchase.update({
      where: { id: already.purchaseId },
      data: {
        refundTransactionId: prior.transactionId,
        status: PartnerEsimPurchaseStatus.FAILED_REFUNDED,
      },
    });
    const balBeforeAlr = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId },
      })
    ).balanceCents;
    const synced = await executeAdminPartnerRefundRequest({
      adminUserId: admin.id,
      requestId: alreadyId,
      confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
      confirmProviderFailureFn: confirmOk,
    });
    assert.equal(synced.idempotent, true);
    assert.equal(synced.refundTransactionId, prior.transactionId);
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId },
        })
      ).balanceCents,
      balBeforeAlr
    );
    const alreadyReq = await prisma.partnerRefundRequest.findUniqueOrThrow({
      where: { id: alreadyId },
      select: { status: true, executedRefundTransactionId: true },
    });
    assert.equal(alreadyReq.status, RefundRequestStatus.COMPLETED);
    assert.equal(alreadyReq.executedRefundTransactionId, prior.transactionId);
    console.log("PASS Q_R_already_refunded_and_recon_first_one_credit");

    const disabledP = await prisma.user.create({
      data: {
        name: "QA Exec Disabled",
        email: `qa.exec.dis.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 300,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 5_000, version: 0 } },
          },
        },
      },
      select: { id: true, partnerProfile: { select: { id: true } } },
    });
    const disabledPartnerId = disabledP.partnerProfile!.id;
    const disabledPurchase = await seedEligiblePurchase(prisma, {
      partnerId: disabledPartnerId,
      tag: "dis",
    });
    const disabledReq = await approveRequest(
      admin.id,
      disabledP.id,
      disabledPurchase.purchaseId
    );
    await prisma.partnerProfile.update({
      where: { id: disabledPartnerId },
      data: { disabledAt: new Date() },
    });
    const disBefore = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId: disabledPartnerId },
      })
    ).balanceCents;
    const disResult = await executeAdminPartnerRefundRequest({
      adminUserId: admin.id,
      requestId: disabledReq,
      confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
      confirmProviderFailureFn: confirmOk,
    });
    assert.equal(disResult.amountCents, 66);
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId: disabledPartnerId },
        })
      ).balanceCents,
      disBefore + 66
    );
    console.log("PASS S_disabled_partner_receives_refund");

    const gone = await prisma.user.create({
      data: {
        name: "QA Exec Deleted",
        email: `qa.exec.del.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 300,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 4_000, version: 0 } },
          },
        },
      },
      select: { id: true, partnerProfile: { select: { id: true } } },
    });
    const gonePartnerId = gone.partnerProfile!.id;
    const gonePurchase = await seedEligiblePurchase(prisma, {
      partnerId: gonePartnerId,
      tag: "del",
    });
    const goneReq = await approveRequest(
      admin.id,
      gone.id,
      gonePurchase.purchaseId
    );
    await prisma.user.update({
      where: { id: gone.id },
      data: { deletedAt: new Date() },
    });
    const goneBefore = (
      await prisma.partnerWalletAccount.findUniqueOrThrow({
        where: { partnerId: gonePartnerId },
      })
    ).balanceCents;
    await expectExec(
      () =>
        executeAdminPartnerRefundRequest({
          adminUserId: admin.id,
          requestId: goneReq,
          confirmPhrase: REFUND_PARTNER_FUNDS_PHRASE,
          confirmProviderFailureFn: confirmOk,
        }),
      "PARTNER_UNAVAILABLE"
    );
    assert.equal(
      (
        await prisma.partnerWalletAccount.findUniqueOrThrow({
          where: { partnerId: gonePartnerId },
        })
      ).balanceCents,
      goneBefore
    );
    console.log("PASS T_deleted_partner_no_credit");

    const audits = await prisma.auditLog.findMany({
      where: { targetId: requestId },
      select: { action: true, metadata: true },
    });
    const actions = audits.map((row) => row.action);
    assert.ok(actions.includes(PARTNER_REFUND_AUDIT.EXECUTION_STARTED));
    assert.ok(actions.includes(PARTNER_REFUND_AUDIT.WALLET_REFUNDED));
    assert.ok(actions.includes(PARTNER_REFUND_AUDIT.REQUEST_COMPLETED));
    const joined = JSON.stringify(audits.map((row) => row.metadata));
    assert.doesNotMatch(joined, /iccid|LPA:|activation|8900/i);
    console.log("PASS Y_audit_safe_no_provider_purchase");

    console.log("ALL_QA_PASSED=partner-refund-execution");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
