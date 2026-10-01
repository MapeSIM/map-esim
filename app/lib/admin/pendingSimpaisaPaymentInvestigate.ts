import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  PartnerEsimPurchaseStatus,
  PaymentGatewayProvider,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import {
  buildSimpaisaPendingInvestigateEvidenceView,
  canOfferSimpaisaReservationRelease,
  decideSimpaisaPendingInvestigate,
  messageForSimpaisaInvestigateDecision,
  parsePendingPaymentVerifyReason,
  SIMPAISA_PARTNER_SUCCESS_APPLIED_MESSAGE,
  SIMPAISA_PENDING_INVESTIGATE_AUDIT,
  SIMPAISA_PENDING_INVESTIGATE_BLOCKED_AUDIT,
  SIMPAISA_PENDING_RELEASE_AUDIT,
  SIMPAISA_PENDING_RELEASE_BLOCKED_AUDIT,
  type SimpaisaPendingInvestigateEvidenceView,
  type SimpaisaPendingInvestigateOwnerKind,
} from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateShared";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { prisma } from "@/app/lib/db";
import { maybeReleasePendingGatewayReservation } from "@/app/lib/esim/esimPurchasePaymentApply";
import {
  applyVerifiedPartnerEsimPurchasePaymentEvent,
  maybeReleasePendingPartnerGatewayReservation,
} from "@/app/lib/partner/partnerEsimPurchasePaymentApply";
import { partnerEsimPurchaseMerchantUserKey } from "@/app/lib/partner/partnerEsimPurchasePaymentConstants";
import { resolveSimpaisaInquiryConfig } from "@/app/lib/payments/simpaisaConfig";
import {
  SimpaisaHttpClient,
  SimpaisaHttpError,
  type SimpaisaInquiryResult,
} from "@/app/lib/payments/simpaisaHttp";
import { validateSimpaisaAuthoritativeInquiry } from "@/app/lib/payments/simpaisaInquiryValidate";
import type { NormalizedPaymentEvent } from "@/app/lib/payments/types";

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

type LoadedAttempt = {
  ownerKind: SimpaisaPendingInvestigateOwnerKind;
  id: string;
  status: string;
  gatewayProvider: PaymentGatewayProvider | null;
  gatewayPaymentRef: string | null;
  gatewayAmountCents: number;
  currency: string;
  chargeAmountMinor: number | null;
  chargeCurrency: string | null;
  webhookEventId: string | null;
  purchaseId: string;
  purchaseStatus: string;
  walletAppliedCents: number;
  /** Customer user id or partner user id (for release helpers). */
  ownerUserId: string;
  inquireUserKey: string;
};

const CUSTOMER_OPEN_ATTEMPT: EsimPurchasePaymentAttemptStatus[] = [
  EsimPurchasePaymentAttemptStatus.DRAFT,
  EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
  EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
  EsimPurchasePaymentAttemptStatus.RECONCILIATION_REQUIRED,
];

const PARTNER_OPEN_ATTEMPT: EsimPurchasePaymentAttemptStatus[] = [
  EsimPurchasePaymentAttemptStatus.DRAFT,
  EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
  EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
];

async function loadSimpaisaAttempt(
  attemptId: string
): Promise<LoadedAttempt | null> {
  const customer = await prisma.esimPurchasePaymentAttempt.findUnique({
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
        },
      },
    },
  });

  if (customer?.purchase) {
    return {
      ownerKind: "customer",
      id: customer.id,
      status: customer.status,
      gatewayProvider: customer.gatewayProvider,
      gatewayPaymentRef: customer.gatewayPaymentRef,
      gatewayAmountCents: customer.gatewayAmountCents,
      currency: customer.currency,
      chargeAmountMinor: customer.chargeAmountMinor,
      chargeCurrency: customer.chargeCurrency,
      webhookEventId: customer.webhookEventId,
      purchaseId: customer.purchaseId,
      purchaseStatus: customer.purchase.status,
      walletAppliedCents: customer.purchase.walletAppliedCents,
      ownerUserId: customer.purchase.customerUserId,
      // Customer checkout merchant userKey = attempt id.
      inquireUserKey: customer.id,
    };
  }

  const partner = await prisma.partnerEsimPurchasePaymentAttempt.findUnique({
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
          walletAppliedCents: true,
          partner: {
            select: {
              userId: true,
            },
          },
        },
      },
    },
  });

  if (!partner?.purchase?.partner) return null;

  return {
    ownerKind: "partner",
    id: partner.id,
    status: partner.status,
    gatewayProvider: partner.gatewayProvider,
    gatewayPaymentRef: partner.gatewayPaymentRef,
    gatewayAmountCents: partner.gatewayAmountCents,
    currency: partner.currency,
    chargeAmountMinor: partner.chargeAmountMinor,
    chargeCurrency: partner.chargeCurrency,
    webhookEventId: partner.webhookEventId,
    purchaseId: partner.purchaseId,
    purchaseStatus: partner.purchase.status,
    walletAppliedCents: partner.purchase.walletAppliedCents,
    ownerUserId: partner.purchase.partner.userId,
    // Partner checkout merchant userKey = pesim_<attemptId>.
    inquireUserKey: partnerEsimPurchaseMerchantUserKey(partner.id),
  };
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
  inquireUserKey: string;
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
        localUserKey: input.inquireUserKey,
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
        userKey: input.inquireUserKey,
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
      localUserKey: input.inquireUserKey,
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

function auditTargetType(ownerKind: SimpaisaPendingInvestigateOwnerKind): string {
  return ownerKind === "partner"
    ? "PartnerEsimPurchasePaymentAttempt"
    : "EsimPurchasePaymentAttempt";
}

function isPartnerApplyEligible(attempt: LoadedAttempt): boolean {
  if (attempt.ownerKind !== "partner") return false;
  if (attempt.webhookEventId) return false;
  if (
    !(PARTNER_OPEN_ATTEMPT as readonly string[]).includes(attempt.status)
  ) {
    return false;
  }
  return (
    attempt.purchaseStatus ===
    PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT
  );
}

/**
 * Partner-only: after authoritative Inquire confirms payment, reuse the same
 * apply path as verified webhooks. Never invents a second funding algorithm.
 * Inquire HTTP stays outside Prisma transactions (apply owns its own txs).
 */
async function applyPartnerConfirmedFromInquiry(input: {
  attempt: LoadedAttempt;
  inquiry: SimpaisaInquiryResult;
  expectedAmount: number;
  expectedCurrency: string;
}): Promise<{ fundingApplied: boolean; duplicate: boolean; outcome: string }> {
  const tracker = (input.attempt.gatewayPaymentRef ?? "").trim();
  const responseCode = (input.inquiry.responseCode ?? "0000").trim() || "0000";
  // Match webhook eventId shape so duplicate webhook/admin apply share CAS key.
  const eventId = `${tracker}:${responseCode}`.slice(0, 190);

  const event: NormalizedPaymentEvent = {
    signatureVerified: true,
    provider: "SIMPAISA",
    purpose: "PARTNER_ESIM_PURCHASE",
    eventId,
    providerPaymentRef: tracker,
    localTopupId: null,
    paymentAttemptId: input.attempt.inquireUserKey,
    purchaseId: input.attempt.purchaseId,
    paymentStatus: "confirmed",
    chargeCurrency: input.expectedCurrency,
    chargeAmountMinor: input.expectedAmount,
    confirmedAt: new Date(),
    failureCategory: null,
    walletOperatorId: input.inquiry.operatorId,
  };

  const result = await applyVerifiedPartnerEsimPurchasePaymentEvent(event);
  const funded =
    result.outcome === "funded" ||
    result.outcome === "duplicate" ||
    result.purchaseStatus === PartnerEsimPurchaseStatus.FUNDED ||
    result.purchaseStatus === PartnerEsimPurchaseStatus.PROVIDER_PENDING ||
    result.purchaseStatus === PartnerEsimPurchaseStatus.COMPLETED ||
    result.purchaseStatus ===
      PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED;

  return {
    fundingApplied: Boolean(funded && result.outcome !== "ignored"),
    duplicate: result.duplicate,
    outcome: result.outcome,
  };
}

/**
 * Step 1: Admin Simpaisa Inquire status check.
 * Customer: never funds / never marks paid / never releases wallet reservation.
 * Partner: on validated Inquire confirmed, applies via existing partner payment
 * apply path (idempotent). Still never invents mark-paid outside that path.
 */
export async function checkSimpaisaPendingPaymentStatus(options: {
  adminUserId: string;
  paymentAttemptId: string;
  reason: string;
  inquireFn?: InquireFn;
  /** Injectable partner apply for offline QA. */
  applyPartnerFn?: typeof applyPartnerConfirmedFromInquiry;
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
      targetType: "PaymentAttempt",
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
      targetType: "PaymentAttempt",
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
      targetType: "PaymentAttempt",
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
      localUserKey: attempt.inquireUserKey,
      inquiryUserKey: null,
      localTransactionId: attempt.gatewayPaymentRef,
      inquiryTransactionId: null,
      localExpectedAmountMinor: attempt.gatewayAmountCents,
      inquiryAmountMinor: null,
      localExpectedCurrency: (attempt.currency ?? "PKR").toUpperCase(),
      inquiryCurrency: null,
      walletAppliedCents: attempt.walletAppliedCents,
    });
    const view = buildSimpaisaPendingInvestigateEvidenceView({
      attemptId: attempt.id,
      purchaseId: attempt.purchaseId,
      ownerKind: attempt.ownerKind,
      localAttemptStatus: attempt.status,
      localPurchaseStatus: attempt.purchaseStatus,
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
      fundingApplied: false,
    });
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_INVESTIGATE_AUDIT,
      targetType: auditTargetType(attempt.ownerKind),
      targetId: attempt.id,
      metadata: {
        method: "pending_simpaisa_investigate",
        ownerKind: attempt.ownerKind,
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
      userKey: attempt.inquireUserKey,
      transactionId: attempt.gatewayPaymentRef.trim(),
    });
  } catch {
    providerUnavailable = true;
    inquiry = null;
  }

  const { decided, validationReason } = classifyInquiry({
    inquireUserKey: attempt.inquireUserKey,
    gatewayPaymentRef: attempt.gatewayPaymentRef.trim(),
    expectedAmount,
    expectedCurrency,
    walletAppliedCents: attempt.walletAppliedCents,
    inquiry,
    providerUnavailable,
    merchantId: resolvedMerchantId,
  });

  let decision = decided.decision;
  let message = decided.message;
  let fundingApplied = false;
  let applyOutcome: string | null = null;
  let applyDuplicate = false;

  // Partner only: validated Inquire confirmed → existing apply path (not customer).
  if (
    attempt.ownerKind === "partner" &&
    decided.decision === "CONFIRMED_SUCCESS_WEBHOOK_REQUIRED" &&
    decided.validatedConfirmed &&
    inquiry &&
    isPartnerApplyEligible(attempt)
  ) {
    const applyFn = options.applyPartnerFn ?? applyPartnerConfirmedFromInquiry;
    try {
      const applied = await applyFn({
        attempt,
        inquiry,
        expectedAmount,
        expectedCurrency,
      });
      fundingApplied = applied.fundingApplied;
      applyDuplicate = applied.duplicate;
      applyOutcome = applied.outcome;
      if (fundingApplied) {
        decision = "CONFIRMED_SUCCESS_APPLIED";
        message = SIMPAISA_PARTNER_SUCCESS_APPLIED_MESSAGE;
      } else if (applied.outcome === "ignored") {
        message = messageForSimpaisaInvestigateDecision(
          "CONFIRMED_SUCCESS_WEBHOOK_REQUIRED"
        );
      }
    } catch {
      fundingApplied = false;
      message =
        "Simpaisa Inquire confirmed payment, but applying partner funding failed. No mark-paid shortcut was used. Retry after checking reconciliation.";
    }
  }

  // Customer (and partner when not applied): never funds from investigate alone.
  if (attempt.ownerKind === "customer") {
    fundingApplied = false;
  }

  const releaseEligible = canOfferSimpaisaReservationRelease({
    decision,
    walletAppliedCents: attempt.walletAppliedCents,
  });

  const view = buildSimpaisaPendingInvestigateEvidenceView({
    attemptId: attempt.id,
    purchaseId: attempt.purchaseId,
    ownerKind: attempt.ownerKind,
    localAttemptStatus: attempt.status,
    localPurchaseStatus: attempt.purchaseStatus,
    localExpectedAmountMinor: expectedAmount,
    localExpectedCurrency: expectedCurrency,
    localGatewayPaymentRef: attempt.gatewayPaymentRef,
    inquiryStatus: inquiry?.status ?? null,
    inquiryAmountMinor: inquiry?.chargeAmountMinor ?? null,
    inquiryCurrency: inquiry?.chargeCurrency ?? null,
    decision,
    message,
    releaseEligible,
    userKeyMatch: decided.userKeyMatch,
    transactionMatch: decided.transactionMatch,
    validatedConfirmed: decided.validatedConfirmed,
    validationReason,
    reservationReleased: false,
    fundingApplied,
  });

  await writeAuditLog({
    actorUserId: admin.id,
    action: SIMPAISA_PENDING_INVESTIGATE_AUDIT,
    targetType: auditTargetType(attempt.ownerKind),
    targetId: attempt.id,
    metadata: {
      method: "pending_simpaisa_investigate",
      ownerKind: attempt.ownerKind,
      decision: view.decision,
      purchaseId: attempt.purchaseId,
      reason: reasonParsed.reason.slice(0, 80),
      inquiryStatus: view.inquiryStatus,
      validatedConfirmed: view.validatedConfirmed,
      validationReason: view.validationReason,
      releaseEligible: view.releaseEligible,
      reservationReleased: false,
      fundingApplied,
      applyOutcome,
      applyDuplicate,
      localAmountMinor: view.localExpectedAmountMinor,
      observedAmountMinor: view.observedAmountMinor,
      transactionRefMasked: view.transactionRefMasked,
    },
  });

  return { ok: true, evidence: view };
}

/**
 * Step 2: Release wallet reservation only after fresh Inquire confirms failed/terminal unpaid.
 * Never funds / never marks paid. Customer uses maybeReleasePendingGatewayReservation;
 * partner uses maybeReleasePendingPartnerGatewayReservation.
 */
export async function releaseSimpaisaPendingReservation(options: {
  adminUserId: string;
  paymentAttemptId: string;
  reason: string;
  inquireFn?: InquireFn;
  releaseFn?: typeof maybeReleasePendingGatewayReservation;
  partnerReleaseFn?: typeof maybeReleasePendingPartnerGatewayReservation;
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
      targetType: "PaymentAttempt",
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
      targetType: "PaymentAttempt",
      targetId: attemptId,
      metadata: {
        method: "pending_simpaisa_release",
        failureCode: "attempt_not_eligible",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: publicError };
  }

  // Do not release when payment already applied / purchase already past gateway wait.
  if (attempt.ownerKind === "customer") {
    if (
      attempt.status === EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED ||
      attempt.purchaseStatus === WalletEsimPurchaseStatus.FUNDED ||
      attempt.purchaseStatus === WalletEsimPurchaseStatus.COMPLETED ||
      attempt.purchaseStatus === WalletEsimPurchaseStatus.PROVIDER_PENDING ||
      !(CUSTOMER_OPEN_ATTEMPT as readonly string[]).includes(attempt.status)
    ) {
      await writeAuditLog({
        actorUserId: admin.id,
        action: SIMPAISA_PENDING_RELEASE_BLOCKED_AUDIT,
        targetType: auditTargetType(attempt.ownerKind),
        targetId: attempt.id,
        metadata: {
          method: "pending_simpaisa_release",
          ownerKind: attempt.ownerKind,
          failureCode: "not_open_pending",
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return { ok: false, error: publicError };
    }
  } else if (
    attempt.status === EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED ||
    attempt.webhookEventId ||
    attempt.purchaseStatus === PartnerEsimPurchaseStatus.FUNDED ||
    attempt.purchaseStatus === PartnerEsimPurchaseStatus.COMPLETED ||
    attempt.purchaseStatus === PartnerEsimPurchaseStatus.PROVIDER_PENDING ||
    attempt.purchaseStatus ===
      PartnerEsimPurchaseStatus.RECONCILIATION_REQUIRED ||
    !(PARTNER_OPEN_ATTEMPT as readonly string[]).includes(attempt.status)
  ) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_RELEASE_BLOCKED_AUDIT,
      targetType: auditTargetType(attempt.ownerKind),
      targetId: attempt.id,
      metadata: {
        method: "pending_simpaisa_release",
        ownerKind: attempt.ownerKind,
        failureCode: "not_open_pending",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: publicError };
  }

  if (attempt.walletAppliedCents <= 0) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_RELEASE_BLOCKED_AUDIT,
      targetType: auditTargetType(attempt.ownerKind),
      targetId: attempt.id,
      metadata: {
        method: "pending_simpaisa_release",
        ownerKind: attempt.ownerKind,
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
      userKey: attempt.inquireUserKey,
      transactionId: attempt.gatewayPaymentRef.trim(),
    });
  } catch {
    providerUnavailable = true;
    inquiry = null;
  }

  // Network/API failure must never be treated as payment failure / release.
  if (providerUnavailable || !inquiry) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_RELEASE_BLOCKED_AUDIT,
      targetType: auditTargetType(attempt.ownerKind),
      targetId: attempt.id,
      metadata: {
        method: "pending_simpaisa_release",
        ownerKind: attempt.ownerKind,
        failureCode: "provider_unavailable",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error:
        "Simpaisa Inquire is unavailable. Reservation was not released.",
    };
  }

  const { decided, validationReason } = classifyInquiry({
    inquireUserKey: attempt.inquireUserKey,
    gatewayPaymentRef: attempt.gatewayPaymentRef.trim(),
    expectedAmount,
    expectedCurrency,
    walletAppliedCents: attempt.walletAppliedCents,
    inquiry,
    providerUnavailable: false,
    merchantId: resolvedMerchantId,
  });

  const releaseEligible = canOfferSimpaisaReservationRelease({
    decision: decided.decision,
    walletAppliedCents: attempt.walletAppliedCents,
  });

  if (!releaseEligible) {
    const view = buildSimpaisaPendingInvestigateEvidenceView({
      attemptId: attempt.id,
      purchaseId: attempt.purchaseId,
      ownerKind: attempt.ownerKind,
      localAttemptStatus: attempt.status,
      localPurchaseStatus: attempt.purchaseStatus,
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
      fundingApplied: false,
    });
    await writeAuditLog({
      actorUserId: admin.id,
      action: SIMPAISA_PENDING_RELEASE_BLOCKED_AUDIT,
      targetType: auditTargetType(attempt.ownerKind),
      targetId: attempt.id,
      metadata: {
        method: "pending_simpaisa_release",
        ownerKind: attempt.ownerKind,
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

  let reservationReleased = false;
  try {
    if (attempt.ownerKind === "partner") {
      const partnerRelease =
        options.partnerReleaseFn ?? maybeReleasePendingPartnerGatewayReservation;
      const release = await partnerRelease({
        partnerUserId: attempt.ownerUserId,
        purchaseId: attempt.purchaseId,
        attemptId: attempt.id,
        attemptTerminalStatus: "CANCELLED",
      });
      reservationReleased = Boolean(release.released);
    } else {
      const releaseFn =
        options.releaseFn ?? maybeReleasePendingGatewayReservation;
      const release = await releaseFn({
        customerUserId: attempt.ownerUserId,
        purchaseId: attempt.purchaseId,
        attemptId: attempt.id,
      });
      reservationReleased = Boolean(release.released);
    }
  } catch {
    reservationReleased = false;
  }

  const view = buildSimpaisaPendingInvestigateEvidenceView({
    attemptId: attempt.id,
    purchaseId: attempt.purchaseId,
    ownerKind: attempt.ownerKind,
    localAttemptStatus: attempt.status,
    localPurchaseStatus: attempt.purchaseStatus,
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
    fundingApplied: false,
  });

  await writeAuditLog({
    actorUserId: admin.id,
    action: SIMPAISA_PENDING_RELEASE_AUDIT,
    targetType: auditTargetType(attempt.ownerKind),
    targetId: attempt.id,
    metadata: {
      method: "pending_simpaisa_release",
      ownerKind: attempt.ownerKind,
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
