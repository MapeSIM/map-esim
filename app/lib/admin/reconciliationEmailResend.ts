/**
 * Safe reconciliation email resend for order_email and wallet_email cases.
 * Reuses production send paths. Never creates orders, retries checkout,
 * mutates wallets, refunds, or captures/modifies ICCID.
 */
import "server-only";

import {
  AdminPackageAssignmentStatus,
  OrderStatus,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { isEmailConfigured } from "@/app/lib/email/config";
import {
  buildOrderEmailPayload,
  extractInstallDetails,
  hasInstallDetails,
} from "@/app/lib/email/extract";
import { sendOrderEmail } from "@/app/lib/email/sendOrderEmail";
import {
  assertSameOriginAdminRequest,
  type CaseActionResult,
} from "@/app/lib/admin/reconciliationCaseManagement";
import {
  emailResendBlockerLabel,
  evaluateEmailResendEligibility,
  normalizeCaseManagementSourceType,
  parseCaseReason,
  parseConfirmPhrase,
  RESEND_EMAIL_PHRASE,
  type CaseManagementSourceType,
  type EmailResendEligibility,
} from "@/app/lib/admin/reconciliationCaseShared";
import { createOrderAccessToken, getOrderAccessSuccessUrl } from "@/app/lib/vesim/orderAccess";
import {
  allowanceFromDataLabel,
  calculateRetailPriceUsd,
} from "@/app/lib/pricing/retailPrice";
import {
  getBrokerToken,
  getVesimBaseUrl,
  readJsonSafe,
  type VerifiedCheckoutOffer,
} from "@/app/lib/vesim/server";
import { resendFailedWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";

export const EMAIL_RESENT = "reconciliation.email_resent";
export const EMAIL_ACTION_BLOCKED = "reconciliation.case_action_blocked";

const PUBLIC_ERROR = "Unable to resend email for this case right now.";

type JsonRecord = Record<string, unknown>;

function resolveIds(
  sourceType: CaseManagementSourceType,
  attemptIdRaw: string
): {
  sourceType: CaseManagementSourceType;
  attemptId: string;
  recordId: string;
  orderEmailOnAssignment: boolean;
  targetType: string;
} | null {
  const attemptId = (attemptIdRaw ?? "").trim();
  if (!attemptId || attemptId.length > 96) return null;

  if (sourceType === "order_email" && attemptId.startsWith("assignment:")) {
    const assignmentId = attemptId.slice("assignment:".length).trim();
    if (!assignmentId || assignmentId.length > 64) return null;
    return {
      sourceType,
      attemptId,
      recordId: assignmentId,
      orderEmailOnAssignment: true,
      targetType: "AdminPackageAssignment",
    };
  }
  if (attemptId.length > 64) return null;
  return {
    sourceType,
    attemptId,
    recordId: attemptId,
    orderEmailOnAssignment: false,
    targetType:
      sourceType === "wallet_email"
        ? "WalletTransaction"
        : sourceType === "order_email"
          ? "WalletEsimPurchase"
          : "Unknown",
  };
}

async function assertActiveAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN || admin.adminDisabledAt) return null;
  return admin;
}

/** GET-only broker order lookup for install details. Never checkout. Never ICCID write. */
async function fetchBrokerOrderForEmailOnly(
  providerOrderId: string
): Promise<JsonRecord | null> {
  try {
    const token = await getBrokerToken();
    const baseUrl = getVesimBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/broker/orders/${encodeURIComponent(providerOrderId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `${token.tokenType} ${token.accessToken}`,
        },
        cache: "no-store",
      }
    );
    const data = await readJsonSafe(response);
    if (!response.ok) return null;
    return data;
  } catch {
    return null;
  }
}

function offerFromLocal(options: {
  offerId: string;
  planName?: string | null;
  destinationName?: string | null;
  destinationCode?: string | null;
  dataAllowance?: string | null;
  validity?: string | null;
  /** Customer retail USD cents when available. */
  priceCents?: number | null;
  /** VeSIM supplier cost USD cents when available. */
  providerCostCents?: number | null;
  currency?: string | null;
}): VerifiedCheckoutOffer {
  const durationMatch = (options.validity ?? "").match(/(\d+)/);
  const retailUsd =
    typeof options.priceCents === "number" &&
    Number.isInteger(options.priceCents) &&
    options.priceCents > 0
      ? options.priceCents / 100
      : 0;
  const providerUsd =
    typeof options.providerCostCents === "number" &&
    Number.isInteger(options.providerCostCents) &&
    options.providerCostCents > 0
      ? options.providerCostCents / 100
      : 0;
  // Prefer stored retail; if only provider cost exists (company-funded), derive retail.
  let priceUSD = retailUsd;
  let providerPriceUSD = providerUsd;
  if (priceUSD <= 0 && providerPriceUSD > 0) {
    const allowance = allowanceFromDataLabel(options.dataAllowance);
    const derived =
      allowance != null
        ? calculateRetailPriceUsd(providerPriceUSD, allowance)
        : null;
    priceUSD = derived ?? providerPriceUSD;
  }
  if (providerPriceUSD <= 0 && priceUSD > 0) {
    providerPriceUSD = priceUSD;
  }
  return {
    offerId: options.offerId,
    name: (options.planName ?? "").trim() || "eSIM",
    countryCode: (options.destinationCode ?? "").trim() || null,
    countryName: (options.destinationName ?? "").trim() || null,
    dataFormatted: (options.dataAllowance ?? "").trim() || "—",
    durationDays: durationMatch ? Number(durationMatch[1]) : null,
    priceUSD,
    providerPriceUSD,
    currency: (options.currency ?? "USD").trim() || "USD",
  };
}

export async function getEmailResendEligibility(options: {
  sourceType: string;
  attemptId: string;
}): Promise<
  | (EmailResendEligibility & {
      message: string;
      supported: boolean;
    })
  | null
> {
  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType) return null;
  if (sourceType !== "order_email" && sourceType !== "wallet_email") {
    return {
      allowed: false,
      blockers: ["unsupported_source"],
      channel: null,
      supported: false,
      message: emailResendBlockerLabel("unsupported_source"),
    };
  }

  const ids = resolveIds(sourceType, options.attemptId);
  if (!ids) return null;

  if (sourceType === "wallet_email") {
    const row = await prisma.walletTransaction.findUnique({
      where: { id: ids.recordId },
      select: {
        status: true,
        amountCents: true,
        balanceAfterCents: true,
        emailNotificationStatus: true,
        reconciliationResolvedAt: true,
        wallet: {
          select: {
            user: { select: { email: true, deletedAt: true } },
          },
        },
      },
    });
    if (!row) return null;
    const eligibility = evaluateEmailResendEligibility({
      sourceType: "wallet_email",
      alreadyResolved: Boolean(row.reconciliationResolvedAt),
      emailNotificationStatus: row.emailNotificationStatus,
      walletTransactionStatus: row.status,
      amountCents: row.amountCents,
      balanceAfterCents: row.balanceAfterCents,
      customerEmail: row.wallet.user?.deletedAt
        ? null
        : row.wallet.user?.email,
    });
    return {
      ...eligibility,
      supported: true,
      message: eligibility.allowed
        ? "Local ledger evidence is complete. Safe to resend the wallet notification."
        : eligibility.blockers.map(emailResendBlockerLabel).join(" "),
    };
  }

  // order_email
  if (ids.orderEmailOnAssignment) {
    const row = await prisma.adminPackageAssignment.findUnique({
      where: { id: ids.recordId },
      select: {
        status: true,
        orderId: true,
        providerOrderId: true,
        emailDeliveryStatus: true,
        reconciliationResolvedAt: true,
        customer: { select: { email: true, deletedAt: true } },
        order: { select: { status: true } },
      },
    });
    if (!row) return null;
    const eligibility = evaluateEmailResendEligibility({
      sourceType: "order_email",
      alreadyResolved: Boolean(row.reconciliationResolvedAt),
      status: row.status,
      orderId: row.orderId,
      orderStatus: row.order?.status,
      providerOrderId: row.providerOrderId,
      emailDeliveryStatus: row.emailDeliveryStatus,
      customerEmail: row.customer.deletedAt ? null : row.customer.email,
    });
    return {
      ...eligibility,
      supported: true,
      message: eligibility.allowed
        ? "Local order evidence is complete. Safe to resend the order email."
        : eligibility.blockers.map(emailResendBlockerLabel).join(" "),
    };
  }

  const row = await prisma.walletEsimPurchase.findUnique({
    where: { id: ids.recordId },
    select: {
      status: true,
      orderId: true,
      providerOrderId: true,
      emailDeliveryStatus: true,
      reconciliationResolvedAt: true,
      customer: { select: { email: true, deletedAt: true } },
      order: { select: { status: true } },
    },
  });
  if (!row) return null;
  const eligibility = evaluateEmailResendEligibility({
    sourceType: "order_email",
    alreadyResolved: Boolean(row.reconciliationResolvedAt),
    status: row.status,
    orderId: row.orderId,
    orderStatus: row.order?.status,
    providerOrderId: row.providerOrderId,
    emailDeliveryStatus: row.emailDeliveryStatus,
    customerEmail: row.customer.deletedAt ? null : row.customer.email,
  });
  return {
    ...eligibility,
    supported: true,
    message: eligibility.allowed
      ? "Local order evidence is complete. Safe to resend the order email."
      : eligibility.blockers.map(emailResendBlockerLabel).join(" "),
  };
}

export async function resendReconciliationEmail(options: {
  adminUserId: string;
  sourceType: string;
  attemptId: string;
  reason: string;
  confirmPhrase: string;
}): Promise<CaseActionResult> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) return { ok: false, error: PUBLIC_ERROR };

  const sourceType = normalizeCaseManagementSourceType(options.sourceType);
  if (!sourceType || (sourceType !== "order_email" && sourceType !== "wallet_email")) {
    return { ok: false, error: PUBLIC_ERROR };
  }
  const ids = resolveIds(sourceType, options.attemptId);
  if (!ids) return { ok: false, error: PUBLIC_ERROR };

  const reasonParsed = parseCaseReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }
  const phrase = parseConfirmPhrase(options.confirmPhrase, RESEND_EMAIL_PHRASE);
  if (!phrase.ok) {
    return {
      ok: false,
      error: phrase.error,
      fieldErrors: { confirmPhrase: phrase.error },
    };
  }

  const adminRate = consumeRateLimit({
    key: `recon-email-resend:admin:${admin.id}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: EMAIL_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "email_resend",
        failureCode: "rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many email resends. Please wait and try again.",
    };
  }
  const caseRate = consumeRateLimit({
    key: `recon-email-resend:case:${ids.sourceType}:${ids.attemptId}`,
    limit: 2,
    windowMs: 10 * 60 * 1000,
  });
  if (!caseRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: EMAIL_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "email_resend",
        failureCode: "rate_limited_case",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "This case was resent recently. Please wait and try again.",
    };
  }

  const eligibility = await getEmailResendEligibility({
    sourceType: ids.sourceType,
    attemptId: ids.attemptId,
  });
  if (!eligibility?.allowed) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: EMAIL_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "email_resend",
        failureCode: eligibility?.blockers[0] ?? "ineligible",
        blockers: (eligibility?.blockers ?? []).slice(0, 8),
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: eligibility?.message || PUBLIC_ERROR,
    };
  }

  if (ids.sourceType === "wallet_email") {
    if (!isEmailConfigured("billing")) {
      await writeAuditLog({
        actorUserId: admin.id,
        action: EMAIL_ACTION_BLOCKED,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          action: "email_resend",
          failureCode: "not_configured",
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return { ok: false, error: PUBLIC_ERROR };
    }

    const result = await resendFailedWalletTransactionNotification(ids.recordId);
    if (result.status === "sent") {
      await writeAuditLog({
        actorUserId: admin.id,
        action: EMAIL_RESENT,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          action: "email_resend",
          channel: "wallet_email",
          deliveryStatus: "sent",
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return { ok: true };
    }
    if (result.status === "skipped" && result.reason === "not_retryable_or_in_progress") {
      await writeAuditLog({
        actorUserId: admin.id,
        action: EMAIL_ACTION_BLOCKED,
        targetType: ids.targetType,
        targetId: ids.recordId,
        metadata: {
          sourceType: ids.sourceType,
          attemptId: ids.attemptId,
          action: "email_resend",
          failureCode: "duplicate_or_in_progress",
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return {
        ok: false,
        error: "Email was already resent or is in progress.",
      };
    }
    await writeAuditLog({
      actorUserId: admin.id,
      action: EMAIL_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "email_resend",
        failureCode: result.status === "failed" ? result.reason : result.status,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: PUBLIC_ERROR };
  }

  // order_email path
  if (!isEmailConfigured("orders")) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: EMAIL_ACTION_BLOCKED,
      targetType: ids.targetType,
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "email_resend",
        failureCode: "not_configured",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: PUBLIC_ERROR };
  }

  const sendResult = ids.orderEmailOnAssignment
    ? await resendAssignmentOrderEmail(ids.recordId)
    : await resendPurchaseOrderEmail(ids.recordId);

  if (sendResult.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: EMAIL_RESENT,
      targetType: ids.orderEmailOnAssignment
        ? "AdminPackageAssignment"
        : "WalletEsimPurchase",
      targetId: ids.recordId,
      metadata: {
        sourceType: ids.sourceType,
        attemptId: ids.attemptId,
        action: "email_resend",
        channel: "order_email",
        deliveryStatus: sendResult.deliveryStatus,
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: true };
  }

  await writeAuditLog({
    actorUserId: admin.id,
    action: EMAIL_ACTION_BLOCKED,
    targetType: ids.orderEmailOnAssignment
      ? "AdminPackageAssignment"
      : "WalletEsimPurchase",
    targetId: ids.recordId,
    metadata: {
      sourceType: ids.sourceType,
      attemptId: ids.attemptId,
      action: "email_resend",
      failureCode: sendResult.failureCode,
      reason: reasonParsed.reason.slice(0, 80),
    },
  });
  return { ok: false, error: PUBLIC_ERROR };
}

async function resendPurchaseOrderEmail(
  purchaseId: string
): Promise<
  | { ok: true; deliveryStatus: string }
  | { ok: false; failureCode: string }
> {
  const claimed = await prisma.walletEsimPurchase.updateMany({
    where: {
      id: purchaseId,
      status: WalletEsimPurchaseStatus.COMPLETED,
      reconciliationResolvedAt: null,
      emailDeliveryStatus: { in: ["failed", "not_configured"] },
      orderId: { not: null },
      providerOrderId: { not: null },
    },
    data: { emailDeliveryStatus: "sending" },
  });
  if (claimed.count !== 1) {
    return { ok: false, failureCode: "duplicate_or_in_progress" };
  }

  const row = await prisma.walletEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      offerId: true,
      planName: true,
      destinationName: true,
      destinationCode: true,
      dataAllowance: true,
      validity: true,
      priceCents: true,
      providerCostCents: true,
      currency: true,
      providerOrderId: true,
      adminUserId: true,
      customer: { select: { email: true } },
      order: { select: { id: true, status: true } },
    },
  });
  if (
    !row?.providerOrderId ||
    !row.order ||
    row.order.status !== OrderStatus.COMPLETED
  ) {
    await prisma.walletEsimPurchase.updateMany({
      where: { id: purchaseId, emailDeliveryStatus: "sending" },
      data: { emailDeliveryStatus: "failed" },
    });
    return { ok: false, failureCode: "underlying_incomplete" };
  }

  const customerEmail = (row.customer.email ?? "").trim();
  const broker = await fetchBrokerOrderForEmailOnly(row.providerOrderId);
  if (!broker || !hasInstallDetails(extractInstallDetails(broker))) {
    await prisma.walletEsimPurchase.updateMany({
      where: { id: purchaseId, emailDeliveryStatus: "sending" },
      data: { emailDeliveryStatus: "failed" },
    });
    return { ok: false, failureCode: "install_details_unavailable" };
  }

  const verifiedOffer = offerFromLocal(row);
  const accessToken = createOrderAccessToken(row.providerOrderId);
  const emailPayload = buildOrderEmailPayload({
    customerEmail,
    orderId: row.providerOrderId,
    verifiedOffer,
    orderPayload: broker,
    orderAccessUrl: accessToken
      ? getOrderAccessSuccessUrl(row.providerOrderId, accessToken)
      : undefined,
    assistedWalletPurchaseNotice: Boolean(row.adminUserId),
  });
  if (!emailPayload) {
    await prisma.walletEsimPurchase.updateMany({
      where: { id: purchaseId, emailDeliveryStatus: "sending" },
      data: { emailDeliveryStatus: "failed" },
    });
    return { ok: false, failureCode: "payload_build_failed" };
  }

  const result = await sendOrderEmail(emailPayload);
  await prisma.walletEsimPurchase.updateMany({
    where: { id: purchaseId, emailDeliveryStatus: "sending" },
    data: { emailDeliveryStatus: result.emailDelivery },
  });

  if (
    result.emailDelivery === "sent" ||
    result.emailDelivery === "already_sent"
  ) {
    return { ok: true, deliveryStatus: result.emailDelivery };
  }
  return { ok: false, failureCode: result.emailDelivery };
}

async function resendAssignmentOrderEmail(
  assignmentId: string
): Promise<
  | { ok: true; deliveryStatus: string }
  | { ok: false; failureCode: string }
> {
  const claimed = await prisma.adminPackageAssignment.updateMany({
    where: {
      id: assignmentId,
      status: AdminPackageAssignmentStatus.COMPLETED,
      reconciliationResolvedAt: null,
      emailDeliveryStatus: { in: ["failed", "not_configured"] },
      orderId: { not: null },
      providerOrderId: { not: null },
    },
    data: { emailDeliveryStatus: "sending" },
  });
  if (claimed.count !== 1) {
    return { ok: false, failureCode: "duplicate_or_in_progress" };
  }

  const row = await prisma.adminPackageAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      offerId: true,
      planName: true,
      destinationName: true,
      destinationCode: true,
      dataAllowance: true,
      validity: true,
      providerCostCents: true,
      providerCurrency: true,
      providerOrderId: true,
      customer: { select: { email: true } },
      order: { select: { id: true, status: true } },
    },
  });
  if (!row?.providerOrderId || !row.order || row.order.status !== OrderStatus.COMPLETED) {
    await prisma.adminPackageAssignment.updateMany({
      where: { id: assignmentId, emailDeliveryStatus: "sending" },
      data: { emailDeliveryStatus: "failed" },
    });
    return { ok: false, failureCode: "underlying_incomplete" };
  }

  const customerEmail = (row.customer.email ?? "").trim();
  const broker = await fetchBrokerOrderForEmailOnly(row.providerOrderId);
  if (!broker || !hasInstallDetails(extractInstallDetails(broker))) {
    await prisma.adminPackageAssignment.updateMany({
      where: { id: assignmentId, emailDeliveryStatus: "sending" },
      data: { emailDeliveryStatus: "failed" },
    });
    return { ok: false, failureCode: "install_details_unavailable" };
  }

  const verifiedOffer = offerFromLocal({
    offerId: row.offerId,
    planName: row.planName,
    destinationName: row.destinationName,
    destinationCode: row.destinationCode,
    dataAllowance: row.dataAllowance,
    validity: row.validity,
    providerCostCents: row.providerCostCents,
    currency: row.providerCurrency,
  });
  const accessToken = createOrderAccessToken(row.providerOrderId);
  const emailPayload = buildOrderEmailPayload({
    customerEmail,
    orderId: row.providerOrderId,
    verifiedOffer,
    orderPayload: broker,
    orderAccessUrl: accessToken
      ? getOrderAccessSuccessUrl(row.providerOrderId, accessToken)
      : undefined,
  });
  if (!emailPayload) {
    await prisma.adminPackageAssignment.updateMany({
      where: { id: assignmentId, emailDeliveryStatus: "sending" },
      data: { emailDeliveryStatus: "failed" },
    });
    return { ok: false, failureCode: "payload_build_failed" };
  }

  const result = await sendOrderEmail(emailPayload);
  await prisma.adminPackageAssignment.updateMany({
    where: { id: assignmentId, emailDeliveryStatus: "sending" },
    data: { emailDeliveryStatus: result.emailDelivery },
  });

  if (result.emailDelivery === "sent" || result.emailDelivery === "already_sent") {
    return { ok: true, deliveryStatus: result.emailDelivery };
  }
  return { ok: false, failureCode: result.emailDelivery };
}
