import "server-only";

import {
  PaymentGatewayProvider,
  Prisma,
  Role,
  WalletDirection,
  WalletTopupStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import type {
  NormalizedPaymentEvent,
  PaymentGatewayProviderName,
} from "@/app/lib/payments/adapter";
import { getActivePaymentAdapter } from "@/app/lib/payments/disabledAdapter";
import { resumeSafepayHostedCheckout } from "@/app/lib/payments/safepayAdapter";
import { resumeSimpaisaWalletCheckout } from "@/app/lib/payments/simpaisaAdapter";
import { maskSimpaisaMsisdn } from "@/app/lib/payments/simpaisaPolicy";
import {
  parseSimpaisaWalletCheckoutFields,
  quoteSimpaisaPkrChargeFromUsdCents,
  simpaisaChargeMatchesQuote,
} from "@/app/lib/payments/simpaisaPkrQuote";
import {
  WALLET_TOPUP_MAX_CENTS,
  WALLET_TOPUP_MIN_CENTS,
} from "@/app/lib/wallet/amount";
import { formatUsdCents } from "@/app/lib/wallet/display";
import { scheduleWalletTransactionNotification } from "@/app/lib/wallet/transactionNotification";
import {
  TOPUP_CHECKOUT_CREATED,
  TOPUP_CREDIT_REFERENCE_TYPE,
  TOPUP_CREDITED,
  TOPUP_DRAFT_CREATED,
  TOPUP_FAILED,
  TOPUP_PAYMENT_CONFIRMED,
  TOPUP_PAYMENT_PENDING,
  TOPUP_RECONCILIATION,
  TOPUP_WEBHOOK_DUPLICATE,
} from "@/app/lib/wallet/topupConstants";
import {
  assertCustomerFinancialActivityAllowed,
  CustomerAccountRestrictedError,
} from "@/app/lib/auth/customerAccountStatus";

export {
  TOPUP_CREDIT_REFERENCE_TYPE,
  TOPUP_CHECKOUT_CREATED,
  TOPUP_CREDITED,
  TOPUP_DRAFT_CREATED,
  TOPUP_FAILED,
  TOPUP_PAYMENT_CONFIRMED,
  TOPUP_PAYMENT_PENDING,
  TOPUP_RECONCILIATION,
  TOPUP_WEBHOOK_DUPLICATE,
  browserReturnMustNotCreditWallet,
} from "@/app/lib/wallet/topupConstants";

export type StartWalletTopupCheckoutResult = {
  topupId: string;
  checkoutUrl: string;
  reusedTracker: boolean;
  chargeCurrency: string;
  chargeAmountMinor: number;
};

export type CreateWalletTopupDraftInput = {
  customerUserId: string;
  creditAmountCents: number;
  checkoutIdempotencyKey: string;
};

export type CreateWalletTopupDraftResult = {
  duplicate: boolean;
  topupId: string;
  creditAmountCents: number;
  creditAmountLabel: string;
  status: WalletTopupStatus;
};

export type ApplyVerifiedTopupPaymentResult = {
  duplicate: boolean;
  topupId: string;
  status: WalletTopupStatus;
  walletTransactionId: string | null;
  creditAmountCents: number | null;
};

export class WalletTopupError extends Error {
  readonly code:
    | "CUSTOMER_UNAVAILABLE"
    | "WALLET_UNAVAILABLE"
    | "INVALID_AMOUNT"
    | "INVALID_IDEMPOTENCY"
    | "GATEWAY_UNAVAILABLE"
    | "TOPUP_UNAVAILABLE"
    | "UNAVAILABLE";

  constructor(code: WalletTopupError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "WalletTopupError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function providerFromName(
  name: PaymentGatewayProviderName | NormalizedPaymentEvent["provider"]
): PaymentGatewayProvider | null {
  switch (name) {
    case "SIMPAISA":
      return PaymentGatewayProvider.SIMPAISA;
    case "PAYFAST":
      return PaymentGatewayProvider.PAYFAST;
    case "SAFEPAY":
      return PaymentGatewayProvider.SAFEPAY;
    case "JAZZCASH":
      return PaymentGatewayProvider.JAZZCASH;
    case "EASYPAISA":
      return PaymentGatewayProvider.EASYPAISA;
    case "MANUAL_TEST":
      return PaymentGatewayProvider.MANUAL_TEST;
    default:
      return null;
  }
}

function topupReturnPath(topupId: string): string {
  return `/account/wallet/top-up/${topupId}`;
}

function isCancelFailureCategory(category: string | null | undefined): boolean {
  const value = (category ?? "").toLowerCase();
  return value.includes("cancel");
}

async function assertActiveCustomer(customerUserId: string) {
  const customer = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!customer || customer.deletedAt || customer.role !== Role.CUSTOMER) {
    throw new WalletTopupError(
      "CUSTOMER_UNAVAILABLE",
      "Your account is unavailable for wallet top-ups."
    );
  }
  return customer;
}

async function assertCustomerMayStartTopup(customerUserId: string) {
  try {
    await assertCustomerFinancialActivityAllowed(customerUserId);
  } catch (error) {
    if (error instanceof CustomerAccountRestrictedError) {
      throw new WalletTopupError("CUSTOMER_UNAVAILABLE", error.message);
    }
    throw error;
  }
}

/**
 * Create a DRAFT top-up for an active CUSTOMER with an existing wallet.
 * Does not invent PKR amounts, call gateways, or credit the wallet.
 */
export async function createWalletTopupDraft(
  input: CreateWalletTopupDraftInput
): Promise<CreateWalletTopupDraftResult> {
  const customerUserId = input.customerUserId.trim();
  const idempotencyKey = input.checkoutIdempotencyKey.trim();
  const creditAmountCents = input.creditAmountCents;

  if (!customerUserId || customerUserId.length > 64) {
    throw new WalletTopupError(
      "CUSTOMER_UNAVAILABLE",
      "Your account is unavailable for wallet top-ups."
    );
  }
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
  ) {
    throw new WalletTopupError(
      "INVALID_IDEMPOTENCY",
      "This top-up request could not be processed. Please reload and try again."
    );
  }
  if (
    !Number.isInteger(creditAmountCents) ||
    !Number.isSafeInteger(creditAmountCents) ||
    creditAmountCents < WALLET_TOPUP_MIN_CENTS ||
    creditAmountCents > WALLET_TOPUP_MAX_CENTS
  ) {
    throw new WalletTopupError(
      "INVALID_AMOUNT",
      "Enter a top-up amount between $0.10 and $500.00."
    );
  }

  const existing = await prisma.walletTopup.findUnique({
    where: { checkoutIdempotencyKey: idempotencyKey },
    select: {
      id: true,
      customerUserId: true,
      creditAmountCents: true,
      status: true,
    },
  });
  if (existing) {
    if (existing.customerUserId !== customerUserId) {
      throw new WalletTopupError(
        "INVALID_IDEMPOTENCY",
        "This top-up request could not be processed. Please reload and try again."
      );
    }
    return {
      duplicate: true,
      topupId: existing.id,
      creditAmountCents: existing.creditAmountCents,
      creditAmountLabel: formatUsdCents(existing.creditAmountCents),
      status: existing.status,
    };
  }

  await assertActiveCustomer(customerUserId);
  await assertCustomerMayStartTopup(customerUserId);

  const wallet = await prisma.walletAccount.findUnique({
    where: { userId: customerUserId },
    select: { id: true },
  });
  if (!wallet) {
    throw new WalletTopupError(
      "WALLET_UNAVAILABLE",
      "A wallet is required before you can add funds."
    );
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const topup = await tx.walletTopup.create({
        data: {
          customerUserId,
          creditAmountCents,
          chargeCurrency: null,
          chargeAmountMinor: null,
          fxRateSnapshot: null,
          gatewayProvider: null,
          status: WalletTopupStatus.DRAFT,
          checkoutIdempotencyKey: idempotencyKey,
        },
        select: {
          id: true,
          creditAmountCents: true,
          status: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: customerUserId,
          action: TOPUP_DRAFT_CREATED,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "customer_wallet_topup",
            amountCents: topup.creditAmountCents,
            currency: "USD",
            failureCategory: null,
          },
        },
      });

      return topup;
    });

    return {
      duplicate: false,
      topupId: created.id,
      creditAmountCents: created.creditAmountCents,
      creditAmountLabel: formatUsdCents(created.creditAmountCents),
      status: created.status,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const again = await prisma.walletTopup.findUnique({
        where: { checkoutIdempotencyKey: idempotencyKey },
        select: {
          id: true,
          customerUserId: true,
          creditAmountCents: true,
          status: true,
        },
      });
      if (again && again.customerUserId === customerUserId) {
        return {
          duplicate: true,
          topupId: again.id,
          creditAmountCents: again.creditAmountCents,
          creditAmountLabel: formatUsdCents(again.creditAmountCents),
          status: again.status,
        };
      }
    }
    throw new WalletTopupError(
      "UNAVAILABLE",
      "Wallet top-up is temporarily unavailable. Please try again shortly."
    );
  }
}

/**
 * Mark an awaiting/draft top-up EXPIRED. Never credits the wallet.
 */
export async function expireWalletTopupCheckout(options: {
  topupId: string;
}): Promise<{ topupId: string; status: WalletTopupStatus }> {
  const topupId = options.topupId.trim();
  if (!topupId || topupId.length > 64) {
    throw new WalletTopupError("TOPUP_UNAVAILABLE", "This top-up is unavailable.");
  }

  const updated = await prisma.walletTopup.updateMany({
    where: {
      id: topupId,
      status: {
        in: [
          WalletTopupStatus.DRAFT,
          WalletTopupStatus.AWAITING_PAYMENT,
          WalletTopupStatus.PAYMENT_PENDING,
        ],
      },
      walletTransactionId: null,
    },
    data: {
      status: WalletTopupStatus.EXPIRED,
      failureCategory: "checkout_expired",
    },
  });

  if (updated.count !== 1) {
    const current = await prisma.walletTopup.findUnique({
      where: { id: topupId },
      select: { id: true, status: true },
    });
    if (!current) {
      throw new WalletTopupError("TOPUP_UNAVAILABLE", "This top-up is unavailable.");
    }
    return { topupId: current.id, status: current.status };
  }

  return { topupId, status: WalletTopupStatus.EXPIRED };
}

/**
 * Start gateway Hosted Checkout for a DRAFT/AWAITING top-up.
 * Persists server-authoritative charge snapshot, then returns redirect URL.
 * Never credits the wallet; browser return is never authoritative.
 */
export async function startWalletTopupCheckout(options: {
  customerUserId: string;
  topupId: string;
  walletOperatorId?: string;
  customerMsisdn?: string;
}): Promise<StartWalletTopupCheckoutResult> {
  const customerUserId = options.customerUserId.trim();
  const topupId = options.topupId.trim();
  await assertActiveCustomer(customerUserId);
  await assertCustomerMayStartTopup(customerUserId);

  const topup = await prisma.walletTopup.findUnique({
    where: { id: topupId },
    select: {
      id: true,
      customerUserId: true,
      creditAmountCents: true,
      checkoutIdempotencyKey: true,
      status: true,
      gatewayProvider: true,
      gatewayPaymentRef: true,
      chargeCurrency: true,
      chargeAmountMinor: true,
      expiresAt: true,
    },
  });
  if (!topup || topup.customerUserId !== customerUserId) {
    throw new WalletTopupError("TOPUP_UNAVAILABLE", "This top-up is unavailable.");
  }
  if (
    topup.status !== WalletTopupStatus.DRAFT &&
    topup.status !== WalletTopupStatus.AWAITING_PAYMENT
  ) {
    throw new WalletTopupError(
      "TOPUP_UNAVAILABLE",
      "This top-up cannot start checkout in its current state."
    );
  }
  if (topup.expiresAt && topup.expiresAt.getTime() <= Date.now()) {
    await expireWalletTopupCheckout({ topupId: topup.id }).catch(() => undefined);
    throw new WalletTopupError(
      "TOPUP_UNAVAILABLE",
      "This top-up checkout expired. Please start a new top-up."
    );
  }

  const returnPath = topupReturnPath(topup.id);
  const cancelPath = returnPath;
  const existingRef = (topup.gatewayPaymentRef ?? "").trim();
  const canResume =
    Boolean(existingRef) &&
    topup.status === WalletTopupStatus.AWAITING_PAYMENT &&
    topup.gatewayProvider === PaymentGatewayProvider.SAFEPAY &&
    typeof topup.chargeAmountMinor === "number" &&
    Boolean(topup.chargeCurrency);

  if (canResume && existingRef) {
    const resumed = await resumeSafepayHostedCheckout({
      trackerToken: existingRef,
      returnPath,
      cancelPath,
    });
    if (!resumed.ok) {
      throw new WalletTopupError(
        resumed.code === "MISCONFIGURED" ||
          resumed.code === "GATEWAY_UNAVAILABLE"
          ? "GATEWAY_UNAVAILABLE"
          : "UNAVAILABLE",
        resumed.message
      );
    }
    return {
      topupId: topup.id,
      checkoutUrl: resumed.checkoutUrl,
      reusedTracker: true,
      chargeCurrency: (topup.chargeCurrency || "USD").toUpperCase(),
      chargeAmountMinor: topup.chargeAmountMinor!,
    };
  }

  const adapter = getActivePaymentAdapter();
  if (!adapter.enabled) {
    throw new WalletTopupError(
      "GATEWAY_UNAVAILABLE",
      "Payment gateway is not available yet. Please try again after payment provider setup is complete."
    );
  }

  if (
    Boolean(existingRef) &&
    topup.status === WalletTopupStatus.AWAITING_PAYMENT &&
    topup.gatewayProvider === PaymentGatewayProvider.SIMPAISA &&
    adapter.provider === "SIMPAISA"
  ) {
    const resumed = resumeSimpaisaWalletCheckout({ returnPath });
    if (!resumed.ok) {
      throw new WalletTopupError(
        resumed.code === "MISCONFIGURED" ||
          resumed.code === "GATEWAY_UNAVAILABLE"
          ? "GATEWAY_UNAVAILABLE"
          : "UNAVAILABLE",
        resumed.message
      );
    }
    return {
      topupId: topup.id,
      checkoutUrl: resumed.checkoutUrl,
      reusedTracker: true,
      chargeCurrency: (topup.chargeCurrency || "PKR").toUpperCase(),
      chargeAmountMinor: topup.chargeAmountMinor ?? topup.creditAmountCents,
    };
  }

  const provider = providerFromName(adapter.provider);
  if (!provider || provider === PaymentGatewayProvider.MANUAL_TEST) {
    throw new WalletTopupError(
      "GATEWAY_UNAVAILABLE",
      "Payment gateway is not available yet. Please try again after payment provider setup is complete."
    );
  }

  const result =
    adapter.provider === "SIMPAISA"
      ? await (async () => {
          const quote = quoteSimpaisaPkrChargeFromUsdCents(
            topup.creditAmountCents
          );
          if (!quote) {
            throw new WalletTopupError(
              "GATEWAY_UNAVAILABLE",
              "Payment checkout quote is unavailable. Please try again."
            );
          }
          const walletFields = parseSimpaisaWalletCheckoutFields({
            walletOperatorId: options.walletOperatorId,
            customerMsisdn: options.customerMsisdn,
          });
          if (!walletFields.ok) {
            throw new WalletTopupError("UNAVAILABLE", walletFields.error);
          }
          return adapter.createCheckoutSession({
            purpose: "WALLET_TOPUP",
            localTopupId: topup.id,
            customerUserId,
            chargeAmountMinor: quote.chargeAmountMinor,
            chargeCurrency: quote.chargeCurrency,
            checkoutIdempotencyKey: topup.checkoutIdempotencyKey,
            returnPath,
            cancelPath,
            walletOperatorId: walletFields.walletOperatorId,
            customerMsisdn: walletFields.customerMsisdn,
          });
        })()
      : await adapter.createCheckoutSession({
          purpose: "WALLET_TOPUP",
          localTopupId: topup.id,
          customerUserId,
          // Authoritative wallet credit amount — never taken from browser.
          chargeAmountMinor: topup.creditAmountCents,
          chargeCurrency: "USD",
          checkoutIdempotencyKey: topup.checkoutIdempotencyKey,
          returnPath,
          cancelPath,
        });

  if (!result.ok) {
    throw new WalletTopupError("GATEWAY_UNAVAILABLE", result.message);
  }

  const providerRef = (result.providerPaymentRef ?? "").trim();
  const chargeCurrency = result.chargeCurrency.trim().toUpperCase();
  const chargeAmountMinor = result.chargeAmountMinor;
  if (adapter.provider === "SIMPAISA") {
    if (
      !providerRef ||
      !Number.isInteger(chargeAmountMinor) ||
      !simpaisaChargeMatchesQuote({
        usdCents: topup.creditAmountCents,
        chargeCurrency,
        chargeAmountMinor,
      })
    ) {
      throw new WalletTopupError(
        "GATEWAY_UNAVAILABLE",
        "Payment checkout quote did not match the PKR charge. Please try again."
      );
    }
  } else if (
    !providerRef ||
    chargeCurrency !== "USD" ||
    !Number.isInteger(chargeAmountMinor) ||
    chargeAmountMinor !== topup.creditAmountCents
  ) {
    throw new WalletTopupError(
      "GATEWAY_UNAVAILABLE",
      "Payment checkout quote did not match the top-up amount. Please try again."
    );
  }

  const simpaisaDisplay =
    adapter.provider === "SIMPAISA"
      ? (() => {
          const walletFields = parseSimpaisaWalletCheckoutFields({
            walletOperatorId: options.walletOperatorId,
            customerMsisdn: options.customerMsisdn,
          });
          if (!walletFields.ok) return null;
          return {
            walletOperatorId: walletFields.walletOperatorId,
            customerMsisdnMasked: maskSimpaisaMsisdn(
              walletFields.customerMsisdn
            ),
          };
        })()
      : null;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.walletTopup.updateMany({
      where: {
        id: topup.id,
        customerUserId,
        status: {
          in: [WalletTopupStatus.DRAFT, WalletTopupStatus.AWAITING_PAYMENT],
        },
        walletTransactionId: null,
      },
      data: {
        status: WalletTopupStatus.AWAITING_PAYMENT,
        gatewayProvider: provider,
        gatewayPaymentRef: providerRef,
        chargeCurrency,
        chargeAmountMinor,
        fxRateSnapshot: result.fxRateSnapshot,
        expiresAt: result.expiresAt,
        failureCategory: null,
        failureCode: null,
        ...(simpaisaDisplay
          ? {
              walletOperatorId: simpaisaDisplay.walletOperatorId,
              customerMsisdnMasked: simpaisaDisplay.customerMsisdnMasked,
            }
          : {}),
      },
    });
    if (updated.count !== 1) {
      throw new WalletTopupError(
        "TOPUP_UNAVAILABLE",
        "This top-up cannot start checkout in its current state."
      );
    }

    await tx.auditLog.create({
      data: {
        actorUserId: customerUserId,
        action: TOPUP_CHECKOUT_CREATED,
        targetType: "WalletTopup",
        targetId: topup.id,
        metadata: {
          method: "customer_wallet_topup",
          amountCents: topup.creditAmountCents,
          currency: "USD",
          chargeCurrency,
          chargeAmountMinor,
          gatewayProvider: provider,
        },
      },
    });
  });

  return {
    topupId: topup.id,
    checkoutUrl: result.checkoutUrl,
    reusedTracker: false,
    chargeCurrency,
    chargeAmountMinor,
  };
}

/**
 * Credit a wallet only from a normalized, signature-verified payment event.
 * Browser return URLs, query params, and client status must never call this.
 * MANUAL_TEST must never credit real customer wallets.
 */
export async function applyVerifiedTopupPaymentEvent(
  event: NormalizedPaymentEvent
): Promise<ApplyVerifiedTopupPaymentResult> {
  if (!event.signatureVerified) {
    throw new WalletTopupError(
      "UNAVAILABLE",
      "Payment event could not be verified."
    );
  }

  const provider = providerFromName(event.provider);
  if (!provider || provider === PaymentGatewayProvider.MANUAL_TEST) {
    throw new WalletTopupError(
      "UNAVAILABLE",
      "Payment provider is not approved for wallet credit."
    );
  }

  const eventId = event.eventId.trim();
  const localTopupId = (event.localTopupId ?? "").trim();
  if (
    event.purpose !== "WALLET_TOPUP" ||
    !eventId ||
    eventId.length > 190 ||
    !localTopupId ||
    localTopupId.length > 64
  ) {
    throw new WalletTopupError("TOPUP_UNAVAILABLE", "Payment event is invalid.");
  }

  if (
    !Number.isInteger(event.chargeAmountMinor) ||
    event.chargeAmountMinor < 0 ||
    !event.chargeCurrency.trim()
  ) {
    throw new WalletTopupError("TOPUP_UNAVAILABLE", "Payment event is invalid.");
  }

  const byEvent = await prisma.walletTopup.findUnique({
    where: { webhookEventId: eventId },
    select: {
      id: true,
      status: true,
      walletTransactionId: true,
      creditAmountCents: true,
    },
  });
  if (byEvent) {
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: TOPUP_WEBHOOK_DUPLICATE,
          targetType: "WalletTopup",
          targetId: byEvent.id,
          metadata: {
            method: "verified_webhook",
            amountCents: byEvent.creditAmountCents,
            currency: "USD",
            walletTransactionId: byEvent.walletTransactionId,
            failureCategory: "duplicate_event",
          },
        },
      })
      .catch(() => undefined);

    return {
      duplicate: true,
      topupId: byEvent.id,
      status: byEvent.status,
      walletTransactionId: byEvent.walletTransactionId,
      creditAmountCents: byEvent.creditAmountCents,
    };
  }

  const topup = await prisma.walletTopup.findUnique({
    where: { id: localTopupId },
    select: {
      id: true,
      customerUserId: true,
      creditAmountCents: true,
      chargeCurrency: true,
      chargeAmountMinor: true,
      gatewayProvider: true,
      gatewayPaymentRef: true,
      status: true,
      walletTransactionId: true,
      webhookEventId: true,
    },
  });
  if (!topup) {
    throw new WalletTopupError("TOPUP_UNAVAILABLE", "Top-up was not found.");
  }

  // Credited / confirmed funding always wins over later failure/cancel.
  if (
    topup.status === WalletTopupStatus.CREDITED ||
    topup.walletTransactionId
  ) {
    return {
      duplicate: true,
      topupId: topup.id,
      status: topup.status,
      walletTransactionId: topup.walletTransactionId,
      creditAmountCents: topup.creditAmountCents,
    };
  }

  const customer = await prisma.user.findUnique({
    where: { id: topup.customerUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!customer || customer.deletedAt || customer.role !== Role.CUSTOMER) {
    throw new WalletTopupError(
      "CUSTOMER_UNAVAILABLE",
      "Customer is unavailable for wallet top-up credit."
    );
  }

  const openForPending =
    topup.status === WalletTopupStatus.DRAFT ||
    topup.status === WalletTopupStatus.AWAITING_PAYMENT ||
    topup.status === WalletTopupStatus.PAYMENT_PENDING;

  // Late confirmed success may still credit after failed/cancelled (no wallet hold).
  const openForConfirmedCredit =
    topup.status === WalletTopupStatus.AWAITING_PAYMENT ||
    topup.status === WalletTopupStatus.PAYMENT_PENDING ||
    topup.status === WalletTopupStatus.PAYMENT_CONFIRMED ||
    topup.status === WalletTopupStatus.FAILED ||
    topup.status === WalletTopupStatus.CANCELLED;

  if (event.paymentStatus === "pending") {
    if (openForPending) {
      await prisma.walletTopup.updateMany({
        where: {
          id: topup.id,
          status: {
            in: [
              WalletTopupStatus.DRAFT,
              WalletTopupStatus.AWAITING_PAYMENT,
              WalletTopupStatus.PAYMENT_PENDING,
            ],
          },
          walletTransactionId: null,
        },
        data: {
          status: WalletTopupStatus.PAYMENT_PENDING,
          gatewayProvider: provider,
          gatewayPaymentRef: event.providerPaymentRef,
          failureCategory: null,
        },
      });
      await prisma.auditLog
        .create({
          data: {
            actorUserId: null,
            action: TOPUP_PAYMENT_PENDING,
            targetType: "WalletTopup",
            targetId: topup.id,
            metadata: {
              method: "verified_webhook",
              amountCents: topup.creditAmountCents,
              currency: "USD",
              failureCategory: "payment_pending",
            },
          },
        })
        .catch(() => undefined);
    }
    return {
      duplicate: false,
      topupId: topup.id,
      status: WalletTopupStatus.PAYMENT_PENDING,
      walletTransactionId: null,
      creditAmountCents: null,
    };
  }

  if (event.paymentStatus === "failed") {
    const failedStatus = isCancelFailureCategory(event.failureCategory)
      ? WalletTopupStatus.CANCELLED
      : WalletTopupStatus.FAILED;
    // Never overwrite credited/confirmed rows; leave webhookEventId free for late success.
    const failedUpdate = await prisma.walletTopup.updateMany({
      where: {
        id: topup.id,
        status: {
          in: [
            WalletTopupStatus.DRAFT,
            WalletTopupStatus.AWAITING_PAYMENT,
            WalletTopupStatus.PAYMENT_PENDING,
            WalletTopupStatus.FAILED,
            WalletTopupStatus.CANCELLED,
          ],
        },
        walletTransactionId: null,
      },
      data: {
        status: failedStatus,
        gatewayProvider: provider,
        gatewayPaymentRef: event.providerPaymentRef,
        failureCategory: event.failureCategory || "payment_failed",
      },
    });
    if (failedUpdate.count === 1) {
      await prisma.auditLog
        .create({
          data: {
            actorUserId: null,
            action: TOPUP_FAILED,
            targetType: "WalletTopup",
            targetId: topup.id,
            metadata: {
              method: "verified_webhook",
              amountCents: topup.creditAmountCents,
              currency: "USD",
              failureCategory: event.failureCategory || "payment_failed",
            },
          },
        })
        .catch(() => undefined);
    }
    const current = await prisma.walletTopup.findUnique({
      where: { id: topup.id },
      select: {
        id: true,
        status: true,
        walletTransactionId: true,
        creditAmountCents: true,
      },
    });
    return {
      duplicate: current?.status === WalletTopupStatus.CREDITED,
      topupId: topup.id,
      status: current?.status ?? failedStatus,
      walletTransactionId: current?.walletTransactionId ?? null,
      creditAmountCents:
        current?.status === WalletTopupStatus.CREDITED
          ? current.creditAmountCents
          : null,
    };
  }

  if (event.paymentStatus === "uncertain") {
    await prisma.walletTopup.updateMany({
      where: {
        id: topup.id,
        status: {
          notIn: [
            WalletTopupStatus.CREDITED,
            WalletTopupStatus.PAYMENT_CONFIRMED,
          ],
        },
        walletTransactionId: null,
      },
      data: {
        status: WalletTopupStatus.RECONCILIATION_REQUIRED,
        gatewayProvider: provider,
        gatewayPaymentRef: event.providerPaymentRef,
        failureCategory: event.failureCategory || "uncertain_payment",
      },
    });
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: TOPUP_RECONCILIATION,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.creditAmountCents,
            currency: "USD",
            failureCategory: event.failureCategory || "uncertain_payment",
          },
        },
      })
      .catch(() => undefined);
    return {
      duplicate: false,
      topupId: topup.id,
      status: WalletTopupStatus.RECONCILIATION_REQUIRED,
      walletTransactionId: null,
      creditAmountCents: null,
    };
  }

  // Confirmed payment path — exact charge snapshot match required.
  // Credit amount is always the persisted top-up creditAmountCents (not webhook alone).
  const safepaySnapshotMissing =
    topup.gatewayProvider === PaymentGatewayProvider.SAFEPAY &&
    (topup.chargeAmountMinor !== topup.creditAmountCents ||
      (topup.chargeCurrency ?? "").toUpperCase() !== "USD");
  const simpaisaSnapshotMissing =
    topup.gatewayProvider === PaymentGatewayProvider.SIMPAISA &&
    (topup.chargeCurrency == null ||
      topup.chargeAmountMinor == null ||
      !simpaisaChargeMatchesQuote({
        usdCents: topup.creditAmountCents,
        chargeCurrency: topup.chargeCurrency,
        chargeAmountMinor: topup.chargeAmountMinor,
      }));
  if (
    !openForConfirmedCredit ||
    topup.chargeCurrency == null ||
    topup.chargeAmountMinor == null ||
    topup.gatewayProvider == null ||
    safepaySnapshotMissing ||
    simpaisaSnapshotMissing
  ) {
    await prisma.walletTopup.updateMany({
      where: {
        id: topup.id,
        walletTransactionId: null,
        status: { not: WalletTopupStatus.CREDITED },
      },
      data: {
        status: WalletTopupStatus.RECONCILIATION_REQUIRED,
        gatewayProvider: provider,
        gatewayPaymentRef: event.providerPaymentRef,
        failureCategory: "missing_checkout_snapshot",
      },
    });
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: TOPUP_RECONCILIATION,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.creditAmountCents,
            currency: "USD",
            failureCategory: "missing_checkout_snapshot",
          },
        },
      })
      .catch(() => undefined);
    return {
      duplicate: false,
      topupId: topup.id,
      status: WalletTopupStatus.RECONCILIATION_REQUIRED,
      walletTransactionId: null,
      creditAmountCents: null,
    };
  }

  if (
    topup.gatewayProvider !== provider ||
    topup.chargeCurrency !== event.chargeCurrency.trim().toUpperCase() ||
    topup.chargeAmountMinor !== event.chargeAmountMinor
  ) {
    await prisma.walletTopup.updateMany({
      where: {
        id: topup.id,
        walletTransactionId: null,
        status: { not: WalletTopupStatus.CREDITED },
      },
      data: {
        status: WalletTopupStatus.RECONCILIATION_REQUIRED,
        gatewayProvider: provider,
        gatewayPaymentRef: event.providerPaymentRef,
        failureCategory: "charge_mismatch",
      },
    });
    await prisma.auditLog
      .create({
        data: {
          actorUserId: null,
          action: TOPUP_RECONCILIATION,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.creditAmountCents,
            currency: "USD",
            failureCategory: "charge_mismatch",
          },
        },
      })
      .catch(() => undefined);
    return {
      duplicate: false,
      topupId: topup.id,
      status: WalletTopupStatus.RECONCILIATION_REQUIRED,
      walletTransactionId: null,
      creditAmountCents: null,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.walletTopup.updateMany({
        where: {
          id: topup.id,
          status: {
            in: [
              WalletTopupStatus.AWAITING_PAYMENT,
              WalletTopupStatus.PAYMENT_PENDING,
              WalletTopupStatus.PAYMENT_CONFIRMED,
              WalletTopupStatus.FAILED,
              WalletTopupStatus.CANCELLED,
            ],
          },
          walletTransactionId: null,
        },
        data: {
          status: WalletTopupStatus.PAYMENT_CONFIRMED,
          webhookEventId: eventId,
          gatewayPaymentRef: event.providerPaymentRef,
          paymentConfirmedAt: event.confirmedAt || new Date(),
          failureCategory: null,
          failureCode: null,
        },
      });

      if (claimed.count !== 1) {
        const current = await tx.walletTopup.findUnique({
          where: { id: topup.id },
          select: {
            id: true,
            status: true,
            walletTransactionId: true,
            creditAmountCents: true,
          },
        });
        if (current?.status === WalletTopupStatus.CREDITED) {
          return {
            duplicate: true,
            topupId: current.id,
            status: current.status,
            walletTransactionId: current.walletTransactionId,
            creditAmountCents: current.creditAmountCents,
          };
        }
        throw new WalletTopupError(
          "TOPUP_UNAVAILABLE",
          "Top-up is not eligible for wallet credit."
        );
      }

      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: TOPUP_PAYMENT_CONFIRMED,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.creditAmountCents,
            currency: "USD",
          },
        },
      });

      const wallet = await tx.walletAccount.findUnique({
        where: { userId: topup.customerUserId },
        select: { id: true, balanceCents: true },
      });
      if (!wallet) {
        throw new WalletTopupError(
          "WALLET_UNAVAILABLE",
          "A wallet is required before funds can be credited."
        );
      }

      const updated = await tx.walletAccount.update({
        where: { id: wallet.id },
        data: {
          balanceCents: { increment: topup.creditAmountCents },
          version: { increment: 1 },
        },
        select: { balanceCents: true },
      });

      if (
        !Number.isInteger(updated.balanceCents) ||
        updated.balanceCents < topup.creditAmountCents
      ) {
        throw new WalletTopupError(
          "UNAVAILABLE",
          "Wallet credit could not be completed."
        );
      }

      const ledger = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTransactionType.TOPUP_CREDIT,
          direction: WalletDirection.CREDIT,
          status: WalletTransactionStatus.COMPLETED,
          amountCents: topup.creditAmountCents,
          balanceBeforeCents: wallet.balanceCents,
          balanceAfterCents: updated.balanceCents,
          idempotencyKey: `topup_${topup.id}`,
          referenceType: TOPUP_CREDIT_REFERENCE_TYPE,
          referenceId: topup.id,
        },
        select: { id: true },
      });

      await tx.walletTopup.update({
        where: { id: topup.id },
        data: {
          status: WalletTopupStatus.CREDITED,
          walletTransactionId: ledger.id,
          walletCreditedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: TOPUP_CREDITED,
          targetType: "WalletTopup",
          targetId: topup.id,
          metadata: {
            method: "verified_webhook",
            amountCents: topup.creditAmountCents,
            currency: "USD",
            walletTransactionId: ledger.id,
          },
        },
      });

      return {
        duplicate: false,
        topupId: topup.id,
        status: WalletTopupStatus.CREDITED,
        walletTransactionId: ledger.id,
        creditAmountCents: topup.creditAmountCents,
      };
    });

    if (
      !result.duplicate &&
      result.status === WalletTopupStatus.CREDITED &&
      result.walletTransactionId
    ) {
      scheduleWalletTransactionNotification(result.walletTransactionId);
    }
    return result;
  } catch (error) {
    if (error instanceof WalletTopupError) throw error;
    if (isUniqueViolation(error)) {
      const credited = await prisma.walletTopup.findUnique({
        where: { id: topup.id },
        select: {
          id: true,
          status: true,
          walletTransactionId: true,
          creditAmountCents: true,
        },
      });
      if (credited) {
        return {
          duplicate: true,
          topupId: credited.id,
          status: credited.status,
          walletTransactionId: credited.walletTransactionId,
          creditAmountCents: credited.creditAmountCents,
        };
      }
    }
    throw new WalletTopupError(
      "UNAVAILABLE",
      "Wallet top-up credit is temporarily unavailable."
    );
  }
}
