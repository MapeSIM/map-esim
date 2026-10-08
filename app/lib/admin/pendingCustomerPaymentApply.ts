/**
 * Admin Apply Verified Payment for customer eSIM attempts when the webhook is missing.
 * Re-confirms gateway evidence, then uses the same apply path as verified webhooks.
 */
import "server-only";

import {
  EsimPurchasePaymentAttemptStatus,
  PaymentGatewayProvider,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import {
  CUSTOMER_APPLY_SUCCESS_MESSAGE,
  CUSTOMER_PENDING_APPLY_AUDIT,
  CUSTOMER_PENDING_APPLY_BLOCKED_AUDIT,
  parseCustomerApplyConfirm,
  parsePendingPaymentVerifyReason,
} from "@/app/lib/admin/pendingCustomerPaymentApplyShared";
import { decidePendingPaymentVerify } from "@/app/lib/admin/pendingPaymentVerifyShared";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { consumeRateLimit } from "@/app/lib/auth/rateLimit";
import { prisma } from "@/app/lib/db";
import { applyVerifiedEsimPurchasePaymentEvent } from "@/app/lib/esim/esimPurchasePaymentApply";
import {
  SafepayHttpClient,
  SafepayHttpError,
} from "@/app/lib/payments/safepayHttp";
import { validateSafepayAdapterConfig } from "@/app/lib/payments/safepayPolicy";
import type { SafepayReporterEvidence } from "@/app/lib/payments/safepayReporterParse";
import { resolveSimpaisaInquiryConfig } from "@/app/lib/payments/simpaisaConfig";
import {
  SimpaisaHttpClient,
  SimpaisaHttpError,
} from "@/app/lib/payments/simpaisaHttp";
import { validateSimpaisaAuthoritativeInquiry } from "@/app/lib/payments/simpaisaInquiryValidate";
import type { SimpaisaInquiryResult } from "@/app/lib/payments/simpaisaHttp";
import type { NormalizedPaymentEvent } from "@/app/lib/payments/types";

export type CustomerPendingApplyActionResult =
  | {
      ok: true;
      fundingApplied: boolean;
      duplicate: boolean;
      outcome: string;
      purchaseStatus: string;
      attemptStatus: string;
      message: string;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: { reason?: string; confirm?: string };
    };

type SafepayLookupFn = (trackerToken: string) => Promise<SafepayReporterEvidence>;
type SimpaisaInquireFn = (input: {
  userKey: string;
  transactionId: string;
}) => Promise<SimpaisaInquiryResult>;

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

function resolveSafepayClient(): SafepayHttpClient | null {
  const validated = validateSafepayAdapterConfig({
    enabledRaw: "true",
    environmentRaw: process.env.SAFEPAY_ENVIRONMENT,
    apiKeyRaw: process.env.SAFEPAY_API_KEY,
    secretKeyRaw: process.env.SAFEPAY_SECRET_KEY,
    intentRaw: process.env.SAFEPAY_INTENT,
    allowProduction: false,
  });
  if (!validated.ok) return null;
  return new SafepayHttpClient(validated.config);
}

async function defaultSafepayLookup(
  trackerToken: string
): Promise<SafepayReporterEvidence> {
  const client = resolveSafepayClient();
  if (!client) {
    throw new SafepayHttpError("UNAVAILABLE", "Payment provider unavailable.");
  }
  return client.fetchTrackerEvidence(trackerToken);
}

async function defaultSimpaisaInquire(input: {
  userKey: string;
  transactionId: string;
}): Promise<SimpaisaInquiryResult> {
  const cfg = resolveSimpaisaInquiryConfig();
  if (!cfg.ok) {
    throw new SimpaisaHttpError("UNAVAILABLE", "Inquiry unavailable.");
  }
  const client = new SimpaisaHttpClient(cfg.config);
  return client.inquireTransaction({
    userKey: input.userKey,
    transactionId: input.transactionId,
  });
}

const OPEN_ATTEMPT: EsimPurchasePaymentAttemptStatus[] = [
  EsimPurchasePaymentAttemptStatus.DRAFT,
  EsimPurchasePaymentAttemptStatus.AWAITING_PAYMENT,
  EsimPurchasePaymentAttemptStatus.PAYMENT_PENDING,
  EsimPurchasePaymentAttemptStatus.RECONCILIATION_REQUIRED,
];

function isPurchaseOpenForFund(status: string): boolean {
  return (
    status === WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT ||
    status === WalletEsimPurchaseStatus.FUNDS_RESERVED ||
    status === WalletEsimPurchaseStatus.READY
  );
}

/**
 * Re-confirm gateway success, then apply via applyVerifiedEsimPurchasePaymentEvent.
 * Never trusts browser amount/tracker. Never invents a second funding algorithm.
 */
export async function applyCustomerVerifiedPendingPayment(options: {
  adminUserId: string;
  paymentAttemptId: string;
  reason: string;
  confirm: boolean;
  safepayLookupFn?: SafepayLookupFn;
  simpaisaInquireFn?: SimpaisaInquireFn;
  applyFn?: typeof applyVerifiedEsimPurchasePaymentEvent;
}): Promise<CustomerPendingApplyActionResult> {
  const publicError =
    "Verified payment apply is unavailable. Please try again shortly.";

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

  const confirmParsed = parseCustomerApplyConfirm(
    options.confirm ? "on" : ""
  );
  if (!confirmParsed.ok) {
    return {
      ok: false,
      error: confirmParsed.error,
      fieldErrors: { confirm: confirmParsed.error },
    };
  }

  const adminRate = consumeRateLimit({
    key: `pending-customer-apply:admin:${admin.id}`,
    limit: 15,
    windowMs: 10 * 60 * 1000,
  });
  if (!adminRate.ok) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: CUSTOMER_PENDING_APPLY_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attemptId,
      metadata: {
        method: "pending_customer_apply",
        failureCode: "rate_limited",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error: "Too many apply attempts. Please wait and try again.",
    };
  }

  const attemptRate = consumeRateLimit({
    key: `pending-customer-apply:attempt:${attemptId}`,
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!attemptRate.ok) {
    return {
      ok: false,
      error: "This payment was applied recently. Please wait and try again.",
    };
  }

  const attempt = await prisma.esimPurchasePaymentAttempt.findUnique({
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

  if (!attempt?.purchase || !attempt.gatewayPaymentRef) {
    await writeAuditLog({
      actorUserId: admin.id,
      action: CUSTOMER_PENDING_APPLY_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attemptId,
      metadata: {
        method: "pending_customer_apply",
        failureCode: "attempt_not_found",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return { ok: false, error: publicError };
  }

  // Already funded — idempotent success (same as webhook replay).
  if (
    attempt.status === EsimPurchasePaymentAttemptStatus.PAYMENT_CONFIRMED ||
    attempt.purchase.status === WalletEsimPurchaseStatus.FUNDED ||
    attempt.purchase.status === WalletEsimPurchaseStatus.PROVIDER_PENDING ||
    attempt.purchase.status === WalletEsimPurchaseStatus.COMPLETED ||
    attempt.purchase.status ===
      WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED
  ) {
    return {
      ok: true,
      fundingApplied: true,
      duplicate: true,
      outcome: "duplicate",
      purchaseStatus: attempt.purchase.status,
      attemptStatus: attempt.status,
      message: CUSTOMER_APPLY_SUCCESS_MESSAGE,
    };
  }

  if (
    !OPEN_ATTEMPT.includes(attempt.status) ||
    !isPurchaseOpenForFund(attempt.purchase.status)
  ) {
    return {
      ok: false,
      error:
        "This payment attempt is not eligible for apply. Refresh and re-verify first.",
    };
  }

  const expectedAmount =
    attempt.chargeAmountMinor ?? attempt.gatewayAmountCents;
  const expectedCurrency = (
    attempt.chargeCurrency ??
    attempt.currency ??
    "USD"
  )
    .trim()
    .toUpperCase();
  const tracker = attempt.gatewayPaymentRef.trim();

  let event: NormalizedPaymentEvent | null = null;

  if (attempt.gatewayProvider === PaymentGatewayProvider.SAFEPAY) {
    const lookup = options.safepayLookupFn ?? defaultSafepayLookup;
    let evidence: SafepayReporterEvidence | null = null;
    try {
      evidence = await lookup(tracker);
    } catch {
      return {
        ok: false,
        error:
          "Safepay reporter lookup failed. Apply was not run. Retry after provider recovers.",
      };
    }
    const decided = decidePendingPaymentVerify({
      localAttemptId: attempt.id,
      localGatewayPaymentRef: tracker,
      localExpectedAmountMinor: expectedAmount,
      localExpectedCurrency: expectedCurrency,
      evidence,
    });
    if (decided.decision !== "VERIFIED_SUCCESS_BUT_WEBHOOK_REQUIRED") {
      await writeAuditLog({
        actorUserId: admin.id,
        action: CUSTOMER_PENDING_APPLY_BLOCKED_AUDIT,
        targetType: "EsimPurchasePaymentAttempt",
        targetId: attempt.id,
        metadata: {
          method: "pending_customer_apply",
          failureCode: "gateway_not_confirmed",
          decision: decided.decision,
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return {
        ok: false,
        error:
          "Gateway no longer reports a successful payment. Apply was blocked. Re-run Verify.",
      };
    }
    // Prefer tracker as event id (stable + unique); webhook replay short-circuits on confirmed.
    event = {
      signatureVerified: true,
      provider: "SAFEPAY",
      purpose: "ESIM_PURCHASE",
      eventId: tracker.slice(0, 190),
      providerPaymentRef: tracker,
      localTopupId: null,
      paymentAttemptId: attempt.id,
      purchaseId: attempt.purchaseId,
      paymentStatus: "confirmed",
      chargeCurrency: expectedCurrency,
      chargeAmountMinor: expectedAmount,
      confirmedAt: new Date(),
      failureCategory: null,
    };
  } else if (attempt.gatewayProvider === PaymentGatewayProvider.SIMPAISA) {
    const inquire = options.simpaisaInquireFn ?? defaultSimpaisaInquire;
    const inquiryConfig = resolveSimpaisaInquiryConfig();
    let inquiry: SimpaisaInquiryResult;
    try {
      inquiry = await inquire({
        userKey: attempt.id,
        transactionId: tracker,
      });
    } catch {
      return {
        ok: false,
        error:
          "Simpaisa Inquire failed. Apply was not run. Retry after provider recovers.",
      };
    }
    if (inquiry.status !== "confirmed") {
      return {
        ok: false,
        error:
          "Simpaisa Inquire does not report confirmed payment. Apply was blocked. Re-run Check status.",
      };
    }
    const merchantId = inquiryConfig.ok
      ? inquiryConfig.config.merchantId
      : (inquiry.merchantId ?? "");
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
        merchantId: (merchantId ?? "").trim(),
        operatorId: (inquiry.operatorId ?? "").trim(),
        userKey: attempt.id,
        transactionId: tracker,
        chargeAmountMinor: expectedAmount,
        chargeCurrency: expectedCurrency,
      },
    });
    if (!validation.ok) {
      await writeAuditLog({
        actorUserId: admin.id,
        action: CUSTOMER_PENDING_APPLY_BLOCKED_AUDIT,
        targetType: "EsimPurchasePaymentAttempt",
        targetId: attempt.id,
        metadata: {
          method: "pending_customer_apply",
          failureCode: "inquiry_validation_failed",
          reason: reasonParsed.reason.slice(0, 80),
        },
      });
      return {
        ok: false,
        error:
          "Simpaisa Inquire fields did not match this attempt. Apply was blocked.",
      };
    }
    const responseCode =
      (inquiry.responseCode ?? "0000").trim() || "0000";
    event = {
      signatureVerified: true,
      provider: "SIMPAISA",
      purpose: "ESIM_PURCHASE",
      eventId: `${tracker}:${responseCode}`.slice(0, 190),
      providerPaymentRef: tracker,
      localTopupId: null,
      paymentAttemptId: attempt.id,
      purchaseId: attempt.purchaseId,
      paymentStatus: "confirmed",
      chargeCurrency: expectedCurrency,
      chargeAmountMinor: expectedAmount,
      confirmedAt: new Date(),
      failureCategory: null,
      walletOperatorId: inquiry.operatorId,
    };
  } else {
    return {
      ok: false,
      error: "Only Safepay and Simpaisa customer attempts support apply.",
    };
  }

  const apply = options.applyFn ?? applyVerifiedEsimPurchasePaymentEvent;
  let result;
  try {
    result = await apply(event);
  } catch {
    await writeAuditLog({
      actorUserId: admin.id,
      action: CUSTOMER_PENDING_APPLY_BLOCKED_AUDIT,
      targetType: "EsimPurchasePaymentAttempt",
      targetId: attempt.id,
      metadata: {
        method: "pending_customer_apply",
        failureCode: "apply_threw",
        reason: reasonParsed.reason.slice(0, 80),
      },
    });
    return {
      ok: false,
      error:
        "Apply failed after gateway confirmation. No mark-paid shortcut was used. Check reconciliation.",
    };
  }

  const funded =
    result.outcome === "funded" ||
    result.outcome === "duplicate" ||
    result.purchaseStatus === WalletEsimPurchaseStatus.FUNDED ||
    result.purchaseStatus === WalletEsimPurchaseStatus.PROVIDER_PENDING ||
    result.purchaseStatus === WalletEsimPurchaseStatus.COMPLETED ||
    result.purchaseStatus ===
      WalletEsimPurchaseStatus.RECONCILIATION_REQUIRED;

  const fundingApplied = Boolean(funded && result.outcome !== "ignored");

  await writeAuditLog({
    actorUserId: admin.id,
    action: CUSTOMER_PENDING_APPLY_AUDIT,
    targetType: "EsimPurchasePaymentAttempt",
    targetId: attempt.id,
    metadata: {
      method: "pending_customer_apply",
      purchaseId: attempt.purchaseId,
      reason: reasonParsed.reason.slice(0, 80),
      provider: attempt.gatewayProvider,
      fundingApplied,
      duplicate: result.duplicate,
      outcome: result.outcome,
      purchaseStatus: result.purchaseStatus,
      attemptStatus: result.attemptStatus,
    },
  });

  if (!fundingApplied) {
    return {
      ok: false,
      error:
        "Gateway confirmed payment, but funding was not applied. Check reconciliation.",
    };
  }

  return {
    ok: true,
    fundingApplied: true,
    duplicate: result.duplicate,
    outcome: result.outcome,
    purchaseStatus: result.purchaseStatus ?? attempt.purchase.status,
    attemptStatus: result.attemptStatus ?? attempt.status,
    message: CUSTOMER_APPLY_SUCCESS_MESSAGE,
  };
}
