import "server-only";

import { PaymentGatewayProvider, Role } from "@prisma/client";
import {
  buildSimpaisaPendingInvestigateEvidenceView,
  canOfferSimpaisaReservationRelease,
  decideSimpaisaPendingInvestigate,
  parsePendingPaymentVerifyReason,
  SIMPAISA_PENDING_INVESTIGATE_AUDIT,
  SIMPAISA_PENDING_INVESTIGATE_BLOCKED_AUDIT,
  SIMPAISA_PENDING_RELEASE_AUDIT,
  SIMPAISA_PENDING_RELEASE_BLOCKED_AUDIT,
  type SimpaisaPendingInvestigateEvidenceView,
} from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateShared";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { prisma } from "@/app/lib/db";
import { maybeReleasePendingGatewayReservation } from "@/app/lib/esim/esimPurchasePaymentApply";
import { resolveSimpaisaInquiryConfig } from "@/app/lib/payments/simpaisaConfig";
import {
  SimpaisaHttpClient,
  SimpaisaHttpError,
  type SimpaisaInquiryResult,
} from "@/app/lib/payments/simpaisaHttp";
import { validateSimpaisaAuthoritativeInquiry } from "@/app/lib/payments/simpaisaInquiryValidate";

export type SimpaisaPendingInvestigateActionResult =
  | {
      ok: true;
      evidence: SimpaisaPendingInvestigateEvidenceView;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: { reason?: string };
    };

export type SimpaisaPendingReleaseActionResult =
  | {
      ok: true;
      evidence: SimpaisaPendingInvestigateEvidenceView;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: { reason?: string };
    };

async function assertActiveAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true, adminDisabledAt: true },
  });
  if (
    !admin ||
    admin.deletedAt ||
    admin.role !== Role.ADMIN ||
    admin.adminDisabledAt
  ) {
    return null;
  }
  return admin;
}

type InquireFn = (input: {
  userKey: string;
  transactionId: string;
}) => Promise<SimpaisaInquiryResult>;

async function defaultInquire(input: {
  userKey: string;
  transactionId: string;
}): Promise<SimpaisaInquiryResult> {
  const resolved = resolveSimpaisaInquiryConfig();
  if (!resolved.ok) {
    throw new SimpaisaHttpError("UNAVAILABLE", "Payment provider unavailable.");
  }
  const client = new SimpaisaHttpClient(resolved.config);
  // operatorId intentionally omitted: not stored on eSIM payment attempts.
  // Webhook passes operator from postback; Admin Inquire uses userKey + txn id.
  return client.inquireTransaction({
    userKey: input.userKey,
    transactionId: input.transactionId,
  });
}

function publicUnavailableError() {
  return "Simpaisa status check is unavailable. Please try again shortly.";
}

async function loadSimpaisaAttempt(attemptId: string) {
  return prisma.esimPurchasePaymentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      status: true,
      gatewayProvider: true,
      gatewayPaymentRef: true,
      gatewayAmountCents: true,
      currency: true,
      chargeAmountMinor: true,
      chargeCurrency: true,
      webhookEventId: true,
      purchaseId: true,
      purchase: {
        select: {
          id: true,
          status: true,
          customerUserId: true,
          walletAppliedCents: true,
          orderId: true,
        },
      },
    },
  });
}

function expectedCharge(attempt: {
  chargeAmountMinor: number | null;
  gatewayAmountCents: number;
  chargeCurrency: string | null;
  currency: string;
}) {
  const expectedAmount =
    attempt.chargeAmountMinor ?? attempt.gatewayAmountCents;
  const expectedCurrency = (
    attempt.chargeCurrency ??
    attempt.currency ??
    "PKR"
  )
    .trim()
    .toUpperCase();
  return { expectedAmount, expectedCurrency };
}

function classifyInquiry(input: {
  attemptId: string;
  gatewayPaymentRef: string;
  expectedAmount: number;
  expectedCurrency: string;
  walletAppliedCents: number;
  inquiry: SimpaisaInquiryResult | null;
  providerUnavailable: boolean;
  merchantId: string | null;
}): {
  decided: ReturnType<typeof decideSimpaisaPendingInvestigate>;
  validationReason: string | null;
} {
  if (input.providerUnavailable || !input.inquiry) {
    return {
      decided: decideSimpaisaPendingInvestigate({
        providerUnavailable: true,
        inquiryStatus: null,
        localUserKey: input.attemptId,
        inquiryUserKey: null,
        localTransactionId: input.gatewayPaymentRef,
        inquiryTransactionId: null,
        localExpectedAmountMinor: input.expectedAmount,
        inquiryAmountMinor: null,
        localExpectedCurrency: input.expectedCurrency,
        inquiryCurrency: null,
        walletAppliedCents: input.walletAppliedCents,
      }),
      validationReason: null,
    };
  }

  const inquiry = input.inquiry;
  let validationOk = false;
  let validationReason: string | null = null;

  if (inquiry.status === "confirmed") {
    // operatorId is not on the attempt; use Inquire-returned operator so
    // validateSimpaisaAuthoritativeInquiry still enforces presence + wallet ops.
    const validation = validateSimpaisaAuthoritativeInquiry({
      inquiry: {
        status: inquiry.status,
        merchantId: inquiry.merchantId,
        operatorId: inquiry.operatorId,
        userKey: inquiry.userKey,
        providerTransactionId: inquiry.providerTransactionId,
        chargeAmountMinor: inquiry.chargeAmountMinor,
        chargeCurrency: inquiry.chargeCurrency,
        transactionType: inquiry.transactionType,
      },
      expected: {
        merchantId: (input.merchantId ?? inquiry.merchantId ?? "").trim(),
        operatorId: (inquiry.operatorId ?? "").trim(),
        userKey: input.attemptId,
        transactionId: input.gatewayPaymentRef,
        chargeAmountMinor: input.expectedAmount,
        chargeCurrency: input.expectedCurrency,
      },
    });
    validationOk = validation.ok;
    validationReason = validation.ok ? null : validation.reason;
  }

  return {
    decided: decideSimpaisaPendingInvestigate({
      inquiryStatus: inquiry.status,
      validationOk,
      validationReason,
      localUserKey: input.attemptId,
      inquiryUserKey: inquiry.userKey,
      localTransactionId: input.gatewayPaymentRef,
      inquiryTransactionId: inquiry.providerTransactionId,
      localExpectedAmountMinor: input.expectedAmount,
      inquiryAmountMinor: inquiry.chargeAmountMinor,
      localExpectedCurrency: input.expectedCurrency,
      inquiryCurrency: inquiry.chargeCurrency,
      walletAppliedCents: input.walletAppliedCents,
    }),
    validationReason,
  };
}

/**
 * Step 1: Admin Simpaisa Inquire status check.
 * Never funds, never marks paid, never releases wallet reservation.
 */
export async function checkSimpaisaPendingPaymentStatus(options: {
  adminUserId: string;
  paymentAttemptId: string;
  reason: string;
  inquireFn?: InquireFn;
}): Promise<SimpaisaPendingInvestigateActionResult> {
  const publicError = publicUnavailableError();

  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: publicError };
  }

  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) {
    return { ok: false, error: "Not authorized." };
  }

  const attemptId = (options.paymentAttemptId ?? "").trim();
  if (
    !attemptId ||
    attemptId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(attemptId)
  ) {
    return { ok: false, error: publicError };
  }

  const reasonParsed = parsePendingPaymentVerifyReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }

  const adminRate = consumeRateLimit({
    key: `pending-simpaisa-investigate:admin:${admin.id}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_INVESTIGATE_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attemptId,
      metadata: {
        method: "pending_simpaisa_investigate",
        failureCode: "rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many Simpaisa status checks. Please wait and try again.",
    };
  }

  const attemptRate = consumeRateLimit({
    key: `pending-simpaisa-investigate:attempt:${attemptId}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!attemptRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_INVESTIGATE_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attemptId,
      metadata: {
        method: "pending_simpaisa_investigate",
        failureCode: "rate_limited_attempt",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error:
        "This payment was checked recently. Please wait and try again.",
    };
  }

  const attempt = await loadSimpaisaAttempt(attemptId);
  if (!attempt || !attempt.gatewayPaymentRef) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_INVESTIGATE_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attemptId,
      metadata: {
        method: "pending_simpaisa_investigate",
        failureCode: "attempt_not_found",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: publicError };
  }

  if (attempt.gatewayProvider !== PaymentGatewayProvider.SIMPAISA) {
    const decided = decideSimpaisaPendingInvestigate({
      notSimpaisa: true,
      inquiryStatus: null,
      localUserKey: attempt.id,
      inquiryUserKey: null,
      localTransactionId: attempt.gatewayPaymentRef,
      inquiryTransactionId: null,
      localExpectedAmountMinor: attempt.gatewayAmountCents,
      inquiryAmountMinor: null,
      localExpectedCurrency: (attempt.currency ?? "PKR").toUpperCase(),
      inquiryCurrency: null,
      walletAppliedCents: attempt.purchase.walletAppliedCents,
    });
    const view = buildSimpaisaPendingInvestigateEvidenceView({
      attemptId: attempt.id,
      purchaseId: attempt.purchaseId,
      localAttemptStatus: attempt.status,
      localPurchaseStatus: attempt.purchase.status,
      localExpectedAmountMinor: attempt.gatewayAmountCents,
      localExpectedCurrency: (attempt.currency ?? "PKR").toUpperCase(),
      localGatewayPaymentRef: attempt.gatewayPaymentRef,
      inquiryStatus: null,
      inquiryAmountMinor: null,
      inquiryCurrency: null,
      decision: decided.decision,
      message: decided.message,
      releaseEligible: false,
      userKeyMatch: null,
      transactionMatch: null,
      validatedConfirmed: false,
      validationReason: null,
      reservationReleased: false,
    });
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_INVESTIGATE_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attempt.id,
      metadata: {
        method: "pending_simpaisa_investigate",
        decision: view.decision,
        purchaseId: attempt.purchaseId,
        reason: reasonParsed.reason.slice(0, 80),
        fundingApplied: false,
        reservationReleased: false,
      },
    });
    return { ok: true, evidence: view };
  }

  const { expectedAmount, expectedCurrency } = expectedCharge(attempt);
  const inquiryConfig = resolveSimpaisaInquiryConfig();
  const resolvedMerchantId = inquiryConfig.ok
    ? inquiryConfig.config.merchantId
    : null;

  const inquire = options.inquireFn ?? defaultInquire;
  let inquiry: SimpaisaInquiryResult | null = null;
  let providerUnavailable = false;
  try {
    inquiry = await inquire({
      userKey: attempt.id,
      transactionId: attempt.gatewayPaymentRef.trim(),
    });
  } catch {
    providerUnavailable = true;
    inquiry = null;
  }

  const { decided, validationReason } = classifyInquiry({
    attemptId: attempt.id,
    gatewayPaymentRef: attempt.gatewayPaymentRef.trim(),
    expectedAmount,
    expectedCurrency,
    walletAppliedCents: attempt.purchase.walletAppliedCents,
    inquiry,
    providerUnavailable,
    merchantId: resolvedMerchantId,
  });

  const releaseEligible = canOfferSimpaisaReservationRelease({
    decision: decided.decision,
    walletAppliedCents: attempt.purchase.walletAppliedCents,
  });

  const view = buildSimpaisaPendingInvestigateEvidenceView({
    attemptId: attempt.id,
    purchaseId: attempt.purchaseId,
    localAttemptStatus: attempt.status,
    localPurchaseStatus: attempt.purchase.status,
    localExpectedAmountMinor: expectedAmount,
    localExpectedCurrency: expectedCurrency,
    localGatewayPaymentRef: attempt.gatewayPaymentRef,
    inquiryStatus: inquiry?.status ?? null,
    inquiryAmountMinor: inquiry?.chargeAmountMinor ?? null,
    inquiryCurrency: inquiry?.chargeCurrency ?? null,
    decision: decided.decision,
    message: decided.message,
    releaseEligible,
    userKeyMatch: decided.userKeyMatch,
    transactionMatch: decided.transactionMatch,
    validatedConfirmed: decided.validatedConfirmed,
    validationReason,
    reservationReleased: false,
  });

  await writeAuditLog({
    actorUserId: admin.id,
    action: SIMPAISA_PENDING_INVESTIGATE_AUDIT,
    targetType: "EsimPurchasePaymentAttempt",
    targetId: attempt.id,
    metadata: {
      method: "pending_simpaisa_investigate",
      decision: view.decision,
      purchaseId: attempt.purchaseId,
      reason: reasonParsed.reason.slice(0, 80),
      inquiryStatus: view.inquiryStatus,
      validatedConfirmed: view.validatedConfirmed,
      validationReason: view.validationReason,
      releaseEligible: view.releaseEligible,
      reservationReleased: false,
      fundingApplied: false,
      localAmountMinor: view.localExpectedAmountMinor,
      observedAmountMinor: view.observedAmountMinor,
      transactionRefMasked: view.transactionRefMasked,
    },
  });

  return { ok: true, evidence: view };
}

/**
 * Step 2: Release wallet reservation only after fresh Inquire confirms failed/terminal unpaid.
 * Never funds / never marks paid. Reuses maybeReleasePendingGatewayReservation.
 */
export async function releaseSimpaisaPendingReservation(options: {
  adminUserId: string;
  paymentAttemptId: string;
  reason: string;
  inquireFn?: InquireFn;
  releaseFn?: typeof maybeReleasePendingGatewayReservation;
}): Promise<SimpaisaPendingReleaseActionResult> {
  const publicError = publicUnavailableError();

  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: publicError };
  }

  const admin = await assertActiveAdmin(options.adminUserId);
  if (!admin) {
    return { ok: false, error: "Not authorized." };
  }

  const attemptId = (options.paymentAttemptId ?? "").trim();
  if (
    !attemptId ||
    attemptId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(attemptId)
  ) {
    return { ok: false, error: publicError };
  }

  const reasonParsed = parsePendingPaymentVerifyReason(options.reason);
  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }

  const adminRate = consumeRateLimit({
    key: `pending-simpaisa-release:admin:${admin.id}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_RELEASE_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attemptId,
      metadata: {
        method: "pending_simpaisa_release",
        failureCode: "rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many reservation releases. Please wait and try again.",
    };
  }

  const attempt = await loadSimpaisaAttempt(attemptId);
  if (
    !attempt ||
    !attempt.gatewayPaymentRef ||
    attempt.gatewayProvider !== PaymentGatewayProvider.SIMPAISA
  ) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_RELEASE_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attemptId,
      metadata: {
        method: "pending_simpaisa_release",
        failureCode: "attempt_not_eligible",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: publicError };
  }

  if (attempt.purchase.walletAppliedCents <= 0) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_RELEASE_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attempt.id,
      metadata: {
        method: "pending_simpaisa_release",
        failureCode: "no_wallet_reservation",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "No wallet reservation is held on this purchase.",
    };
  }

  const { expectedAmount, expectedCurrency } = expectedCharge(attempt);
  const inquiryConfig = resolveSimpaisaInquiryConfig();
  const resolvedMerchantId = inquiryConfig.ok
    ? inquiryConfig.config.merchantId
    : null;

  const inquire = options.inquireFn ?? defaultInquire;
  let inquiry: SimpaisaInquiryResult | null = null;
  let providerUnavailable = false;
  try {
    inquiry = await inquire({
      userKey: attempt.id,
      transactionId: attempt.gatewayPaymentRef.trim(),
    });
  } catch {
    providerUnavailable = true;
    inquiry = null;
  }

  const { decided, validationReason } = classifyInquiry({
    attemptId: attempt.id,
    gatewayPaymentRef: attempt.gatewayPaymentRef.trim(),
    expectedAmount,
    expectedCurrency,
    walletAppliedCents: attempt.purchase.walletAppliedCents,
    inquiry,
    providerUnavailable,
    merchantId: resolvedMerchantId,
  });

  const releaseEligible = canOfferSimpaisaReservationRelease({
    decision: decided.decision,
    walletAppliedCents: attempt.purchase.walletAppliedCents,
  });

  if (!releaseEligible) {
    const view = buildSimpaisaPendingInvestigateEvidenceView({
      attemptId: attempt.id,
      purchaseId: attempt.purchaseId,
      localAttemptStatus: attempt.status,
      localPurchaseStatus: attempt.purchase.status,
      localExpectedAmountMinor: expectedAmount,
      localExpectedCurrency: expectedCurrency,
      localGatewayPaymentRef: attempt.gatewayPaymentRef,
      inquiryStatus: inquiry?.status ?? null,
      inquiryAmountMinor: inquiry?.chargeAmountMinor ?? null,
      inquiryCurrency: inquiry?.chargeCurrency ?? null,
      decision: decided.decision,
      message:
        decided.decision === "VERIFIED_FAILED"
          ? decided.message
          : "Reservation release is only allowed after Simpaisa Inquire confirms a failed or terminal unpaid payment.",
      releaseEligible: false,
      userKeyMatch: decided.userKeyMatch,
      transactionMatch: decided.transactionMatch,
      validatedConfirmed: decided.validatedConfirmed,
      validationReason,
      reservationReleased: false,
    });
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_RELEASE_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attempt.id,
      metadata: {
        method: "pending_simpaisa_release",
        failureCode: "not_failed_terminal",
        decision: view.decision,
        reason: reasonParsed.reason.slice(0, 80),
        fundingApplied: false,
      },
    });
    return {
      ok: false,
      error:
        "Reservation can only be released after Inquire confirms failed/terminal unpaid status.",
    };
  }

  const releaseFn =
    options.releaseFn ?? maybeReleasePendingGatewayReservation;
  let reservationReleased = false;
  try {
    const release = await releaseFn({
      customerUserId: attempt.purchase.customerUserId,
      purchaseId: attempt.purchaseId,
      attemptId: attempt.id,
    });
    reservationReleased = Boolean(release.released);
  } catch {
    reservationReleased = false;
  }

  const view = buildSimpaisaPendingInvestigateEvidenceView({
    attemptId: attempt.id,
    purchaseId: attempt.purchaseId,
    localAttemptStatus: attempt.status,
    localPurchaseStatus: attempt.purchase.status,
    localExpectedAmountMinor: expectedAmount,
    localExpectedCurrency: expectedCurrency,
    localGatewayPaymentRef: attempt.gatewayPaymentRef,
    inquiryStatus: inquiry?.status ?? null,
    inquiryAmountMinor: inquiry?.chargeAmountMinor ?? null,
    inquiryCurrency: inquiry?.chargeCurrency ?? null,
    decision: decided.decision,
    message: reservationReleased
      ? "Wallet reservation released after confirmed Simpaisa failed/terminal unpaid status."
      : "Inquire confirmed failed/terminal unpaid, but no reservation was released (already released or not held).",
    releaseEligible: true,
    userKeyMatch: decided.userKeyMatch,
    transactionMatch: decided.transactionMatch,
    validatedConfirmed: false,
    validationReason,
    reservationReleased,
  });

  await writeAuditLog({
    actorUserId: admin.id,
    action: SIMPAISA_PENDING_RELEASE_AUDIT,
    targetType: "EsimPurchasePaymentAttempt",
    targetId: attempt.id,
    metadata: {
      method: "pending_simpaisa_release",
      decision: view.decision,
      released: reservationReleased,
      reason: reasonParsed.reason.slice(0, 80),
      purchaseId: attempt.purchaseId,
      fundingApplied: false,
      transactionRefMasked: view.transactionRefMasked,
    },
  });

  return { ok: true, evidence: view };
}
