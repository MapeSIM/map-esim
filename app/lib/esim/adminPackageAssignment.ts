import "server-only";

import {
  AdminPackageAssignmentStatus,
  OrderFundingSource,
  OrderStatus,
  Prisma,
  Role,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { usdPriceToCents } from "@/app/lib/esim/assignmentValidation";
import { persistAssignedOrder } from "@/app/lib/orders/persistAssignedOrder";
import { deliverOrderEmailAfterCheckout } from "@/app/lib/email/deliverAfterCheckout";
import { VESIM_PROVIDER_CUSTOMER_EMAIL } from "@/app/lib/vesim/creditCheckout";
import { createOrderAccessToken } from "@/app/lib/vesim/orderAccess";
import {
  persistAssignmentProviderObservation,
  type ProviderResultKind,
} from "@/app/lib/esim/providerResultPersist";
import { formatUsdCents } from "@/app/lib/wallet/display";
import {
  extractOrderId,
  extractReturnedOfferId,
  getBrokerToken,
  getVesimBaseUrl,
  readJsonSafe,
  sanitizeCountryHint,
  verifyOfferAuthoritative,
  type VerifiedCheckoutOffer,
} from "@/app/lib/vesim/server";
import {
  assertNewRiskyTransactionAllowed,
  OperationalControlBlockedError,
  OperationalControlUnavailableError,
} from "@/app/lib/admin/operationalControlsPolicy";
import { OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE } from "@/app/lib/admin/operationalControlsShared";

export const ADMIN_ASSIGNMENT_STARTED = "esim.admin_assignment_started";
export const ADMIN_ASSIGNMENT_COMPLETED = "esim.admin_assignment_completed";
export const ADMIN_ASSIGNMENT_FAILED = "esim.admin_assignment_failed";
export const ADMIN_ASSIGNMENT_RECONCILIATION =
  "esim.admin_assignment_reconciliation_required";

export type PrepareAssignmentInput = {
  adminUserId: string;
  customerUserId: string;
  offerId: string;
  countryHint: string | null;
  reason: string;
  internalReference: string | null;
  idempotencyKey: string;
};

export type PrepareAssignmentResult = {
  assignmentId: string;
  customerUserId: string;
  duplicate: boolean;
};

export type ConfirmAssignmentInput = {
  adminUserId: string;
  customerUserId: string;
  assignmentId: string;
  idempotencyKey: string;
};

export type ConfirmAssignmentResult = {
  assignmentId: string;
  customerUserId: string;
  orderId: string | null;
  status: AdminPackageAssignmentStatus;
  duplicate: boolean;
};

export class AdminPackageAssignmentError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "CUSTOMER_UNAVAILABLE"
    | "OFFER_UNAVAILABLE"
    | "INVALID_STATE"
    | "INVALID_IDEMPOTENCY"
    | "CONFIRMATION_REQUIRED"
    | "PROVIDER_FAILED"
    | "RECONCILIATION_REQUIRED"
    | "UNAVAILABLE";

  constructor(code: AdminPackageAssignmentError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "AdminPackageAssignmentError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function verifiedOfferSnapshot(offer: VerifiedCheckoutOffer) {
  const validity =
    offer.durationDays != null ? `${offer.durationDays} Days` : null;
  return {
    offerId: offer.offerId,
    destinationCode: offer.countryCode,
    destinationName: offer.countryName || offer.countryCode,
    planName: offer.name,
    dataAllowance: offer.dataFormatted || null,
    validity,
    providerCostCents: usdPriceToCents(offer.priceUSD),
    providerCurrency: offer.currency || "USD",
  };
}

async function assertActiveAdmin(adminUserId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!admin || admin.deletedAt || admin.role !== Role.ADMIN) {
    throw new AdminPackageAssignmentError("FORBIDDEN", "Not authorized.");
  }
}

async function assertActiveCustomer(customerUserId: string) {
  const customer = await prisma.user.findUnique({
    where: { id: customerUserId },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      email: true,
      name: true,
    },
  });
  if (
    !customer ||
    customer.deletedAt ||
    customer.role !== Role.CUSTOMER
  ) {
    throw new AdminPackageAssignmentError(
      "CUSTOMER_UNAVAILABLE",
      "Customer is unavailable."
    );
  }
  return customer;
}

function throwIfOperationalControlBlocksAssignment(error: unknown): never {
  if (
    error instanceof OperationalControlBlockedError ||
    error instanceof OperationalControlUnavailableError
  ) {
    throw new AdminPackageAssignmentError(
      "UNAVAILABLE",
      OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE
    );
  }
  throw error;
}

async function assertAssignmentInitiationAllowed(options?: {
  includeProviderOrder?: boolean;
}) {
  try {
    await assertNewRiskyTransactionAllowed("company_assignment", {
      includeProviderOrder: options?.includeProviderOrder === true,
    });
  } catch (error) {
    throwIfOperationalControlBlocksAssignment(error);
  }
}

/**
 * Create or reuse a READY assignment after authoritative offer verification.
 * Never calls the provider checkout API.
 */
export async function prepareAdminPackageAssignment(
  input: PrepareAssignmentInput
): Promise<PrepareAssignmentResult> {
  const adminUserId = input.adminUserId.trim();
  const customerUserId = input.customerUserId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const reason = input.reason.trim();
  const internalReference = input.internalReference?.trim() || null;
  const offerId = input.offerId.trim();
  const countryHint = sanitizeCountryHint(input.countryHint);

  if (!adminUserId || adminUserId.length > 64) {
    throw new AdminPackageAssignmentError("FORBIDDEN", "Not authorized.");
  }
  if (!customerUserId || customerUserId.length > 64) {
    throw new AdminPackageAssignmentError(
      "CUSTOMER_UNAVAILABLE",
      "Customer is unavailable."
    );
  }
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
  ) {
    throw new AdminPackageAssignmentError(
      "INVALID_IDEMPOTENCY",
      "This assignment request could not be processed. Please reload and try again."
    );
  }
  if (!offerId || offerId.length > 120) {
    throw new AdminPackageAssignmentError(
      "OFFER_UNAVAILABLE",
      "The selected package is unavailable."
    );
  }

  await assertActiveAdmin(adminUserId);
  await assertActiveCustomer(customerUserId);

  const existing = await prisma.adminPackageAssignment.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      customerUserId: true,
      status: true,
    },
  });

  if (existing) {
    if (existing.customerUserId !== customerUserId) {
      throw new AdminPackageAssignmentError(
        "INVALID_IDEMPOTENCY",
        "This assignment request could not be processed. Please reload and try again."
      );
    }
    return {
      assignmentId: existing.id,
      customerUserId,
      duplicate: true,
    };
  }

  // Pause switches — before offer network work and before assignment create.
  await assertAssignmentInitiationAllowed({ includeProviderOrder: false });

  // Never trust browser price/name/data — reload offer server-side.
  const verifiedOffer = await verifyOfferAuthoritative({
    offerId,
    countryHint,
  });
  if (!verifiedOffer) {
    throw new AdminPackageAssignmentError(
      "OFFER_UNAVAILABLE",
      "The selected package is unavailable."
    );
  }

  const snapshot = verifiedOfferSnapshot(verifiedOffer);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const assignment = await tx.adminPackageAssignment.create({
        data: {
          customerUserId,
          adminUserId,
          offerId: snapshot.offerId,
          destinationCode: snapshot.destinationCode,
          destinationName: snapshot.destinationName,
          planName: snapshot.planName,
          dataAllowance: snapshot.dataAllowance,
          validity: snapshot.validity,
          fundingSource: OrderFundingSource.COMPANY_FUNDED,
          providerCostCents: snapshot.providerCostCents,
          providerCurrency: snapshot.providerCurrency,
          status: AdminPackageAssignmentStatus.READY,
          idempotencyKey,
          reason,
          internalReference,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: ADMIN_ASSIGNMENT_STARTED,
          targetType: "AdminPackageAssignment",
          targetId: assignment.id,
          metadata: {
            method: "admin_company_funded_assignment",
            fundingSource: OrderFundingSource.COMPANY_FUNDED,
            targetUserId: customerUserId,
            assignmentId: assignment.id,
            offerId: snapshot.offerId,
            currency: snapshot.providerCurrency,
            reason,
            ...(snapshot.providerCostCents != null
              ? { providerCostCents: snapshot.providerCostCents }
              : {}),
            ...(internalReference ? { internalReference } : {}),
          } satisfies Prisma.InputJsonValue,
        },
      });

      return assignment;
    });

    return {
      assignmentId: created.id,
      customerUserId,
      duplicate: false,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await prisma.adminPackageAssignment.findUnique({
        where: { idempotencyKey },
        select: { id: true, customerUserId: true },
      });
      if (raced && raced.customerUserId === customerUserId) {
        return {
          assignmentId: raced.id,
          customerUserId,
          duplicate: true,
        };
      }
    }
    throw new AdminPackageAssignmentError(
      "UNAVAILABLE",
      "Package assignment is temporarily unavailable. Please try again shortly."
    );
  }
}

async function markFailed(
  assignmentId: string,
  adminUserId: string,
  customerUserId: string,
  category: string,
  code: string,
  message: string
): Promise<never> {
  await prisma.$transaction(async (tx) => {
    await tx.adminPackageAssignment.update({
      where: { id: assignmentId },
      data: {
        status: AdminPackageAssignmentStatus.FAILED,
        failureCategory: category,
        failureCode: code,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action: ADMIN_ASSIGNMENT_FAILED,
        targetType: "AdminPackageAssignment",
        targetId: assignmentId,
        metadata: {
          method: "admin_company_funded_assignment",
          fundingSource: OrderFundingSource.COMPANY_FUNDED,
          targetUserId: customerUserId,
          assignmentId,
          failureCategory: category,
          failureCode: code,
        } satisfies Prisma.InputJsonValue,
      },
    });
  });

  throw new AdminPackageAssignmentError("PROVIDER_FAILED", message);
}

async function markReconciliationRequired(
  assignmentId: string,
  adminUserId: string,
  customerUserId: string,
  category: string,
  code: string,
  providerObservation?: {
    providerOrderId?: string | null;
    providerResultKind: ProviderResultKind;
    safeProviderStatusCode?: string | null;
  }
): Promise<never> {
  // Persist any observed providerOrderId before marking RECONCILIATION_REQUIRED.
  if (providerObservation) {
    await persistAssignmentProviderObservation(assignmentId, {
      providerOrderId: providerObservation.providerOrderId,
      providerResultKind: providerObservation.providerResultKind,
      safeProviderStatusCode: providerObservation.safeProviderStatusCode,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.adminPackageAssignment.update({
      where: { id: assignmentId },
      data: {
        status: AdminPackageAssignmentStatus.RECONCILIATION_REQUIRED,
        failureCategory: category,
        failureCode: code,
        reconciliationState: "awaiting_manual_review",
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action: ADMIN_ASSIGNMENT_RECONCILIATION,
        targetType: "AdminPackageAssignment",
        targetId: assignmentId,
        metadata: {
          method: "admin_company_funded_assignment",
          fundingSource: OrderFundingSource.COMPANY_FUNDED,
          targetUserId: customerUserId,
          assignmentId,
          failureCategory: category,
          failureCode: code,
        } satisfies Prisma.InputJsonValue,
      },
    });
  });

  throw new AdminPackageAssignmentError(
    "RECONCILIATION_REQUIRED",
    "The provider result is uncertain. Do not submit again. Contact support for reconciliation."
  );
}

/**
 * Final confirmation: claim PROVIDER_PENDING, call VeSIM checkout once,
 * then finalize local Order + assignment atomically on confirmed success.
 * Never mutates WalletAccount / WalletTransaction.
 */
export async function confirmAdminPackageAssignment(
  input: ConfirmAssignmentInput
): Promise<ConfirmAssignmentResult> {
  const adminUserId = input.adminUserId.trim();
  const customerUserId = input.customerUserId.trim();
  const assignmentId = input.assignmentId.trim();
  const idempotencyKey = input.idempotencyKey.trim();

  if (!adminUserId || adminUserId.length > 64) {
    throw new AdminPackageAssignmentError("FORBIDDEN", "Not authorized.");
  }
  if (!customerUserId || customerUserId.length > 64 || !assignmentId) {
    throw new AdminPackageAssignmentError(
      "CUSTOMER_UNAVAILABLE",
      "Customer is unavailable."
    );
  }

  await assertActiveAdmin(adminUserId);
  const customer = await assertActiveCustomer(customerUserId);

  const assignment = await prisma.adminPackageAssignment.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      customerUserId: true,
      adminUserId: true,
      offerId: true,
      destinationCode: true,
      status: true,
      idempotencyKey: true,
      orderId: true,
      fundingSource: true,
      reason: true,
      internalReference: true,
      providerCostCents: true,
      providerCurrency: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      destinationName: true,
    },
  });

  if (
    !assignment ||
    assignment.customerUserId !== customerUserId ||
    assignment.idempotencyKey !== idempotencyKey
  ) {
    throw new AdminPackageAssignmentError(
      "INVALID_STATE",
      "This assignment is unavailable."
    );
  }

  if (assignment.fundingSource !== OrderFundingSource.COMPANY_FUNDED) {
    throw new AdminPackageAssignmentError(
      "INVALID_STATE",
      "Only company-funded assignment is enabled."
    );
  }

  if (assignment.status === AdminPackageAssignmentStatus.COMPLETED) {
    return {
      assignmentId: assignment.id,
      customerUserId,
      orderId: assignment.orderId,
      status: AdminPackageAssignmentStatus.COMPLETED,
      duplicate: true,
    };
  }

  if (
    assignment.status === AdminPackageAssignmentStatus.PROVIDER_PENDING ||
    assignment.status === AdminPackageAssignmentStatus.RECONCILIATION_REQUIRED
  ) {
    throw new AdminPackageAssignmentError(
      "RECONCILIATION_REQUIRED",
      "The provider result is uncertain. Do not submit again. Contact support for reconciliation."
    );
  }

  if (assignment.status === AdminPackageAssignmentStatus.FAILED) {
    throw new AdminPackageAssignmentError(
      "PROVIDER_FAILED",
      "This assignment failed. Start a new assignment if needed."
    );
  }

  if (assignment.status !== AdminPackageAssignmentStatus.READY) {
    throw new AdminPackageAssignmentError(
      "INVALID_STATE",
      "This assignment is not ready for confirmation."
    );
  }

  // New durable initiation (READY → PROVIDER_PENDING + provider). Check before claim.
  await assertAssignmentInitiationAllowed({ includeProviderOrder: true });

  // Atomic claim — prevents double provider checkout on concurrent submits.
  const claimed = await prisma.adminPackageAssignment.updateMany({
    where: {
      id: assignment.id,
      status: AdminPackageAssignmentStatus.READY,
      idempotencyKey,
    },
    data: {
      status: AdminPackageAssignmentStatus.PROVIDER_PENDING,
    },
  });

  if (claimed.count !== 1) {
    const latest = await prisma.adminPackageAssignment.findUnique({
      where: { id: assignment.id },
      select: { status: true, orderId: true },
    });
    if (latest?.status === AdminPackageAssignmentStatus.COMPLETED) {
      return {
        assignmentId: assignment.id,
        customerUserId,
        orderId: latest.orderId,
        status: AdminPackageAssignmentStatus.COMPLETED,
        duplicate: true,
      };
    }
    throw new AdminPackageAssignmentError(
      "RECONCILIATION_REQUIRED",
      "The provider result is uncertain. Do not submit again. Contact support for reconciliation."
    );
  }

  // Re-validate offer immediately before the external write.
  const verifiedOffer = await verifyOfferAuthoritative({
    offerId: assignment.offerId,
    countryHint: assignment.destinationCode,
  });
  if (!verifiedOffer) {
    await markFailed(
      assignment.id,
      adminUserId,
      customerUserId,
      "offer_unavailable",
      "offer_revalidate_failed",
      "The selected package is no longer available."
    );
  }

  let checkoutResponse: Response | null = null;
  let checkoutData: Record<string, unknown> = {};
  try {
    const token = await getBrokerToken();
    const baseUrl = getVesimBaseUrl();
    checkoutResponse = await fetch(`${baseUrl}/api/checkout/credit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `${token.tokenType} ${token.accessToken}`,
      },
      body: JSON.stringify({
        offerId: verifiedOffer!.offerId,
        // VeSIM inbox only — MAP branded email still uses customer.email below.
        customerEmail: VESIM_PROVIDER_CUSTOMER_EMAIL,
        platform: "api",
      }),
      cache: "no-store",
    });
    checkoutData = await readJsonSafe(checkoutResponse);
  } catch {
    await markReconciliationRequired(
      assignment.id,
      adminUserId,
      customerUserId,
      "provider_timeout",
      "checkout_transport_error",
      {
        providerResultKind: "uncertain",
        safeProviderStatusCode: "checkout_transport_error",
      }
    );
  }

  if (!checkoutResponse) {
    await markReconciliationRequired(
      assignment.id,
      adminUserId,
      customerUserId,
      "provider_timeout",
      "checkout_missing_response",
      {
        providerResultKind: "uncertain",
        safeProviderStatusCode: "checkout_missing_response",
      }
    );
  }

  const providerOrderId = extractOrderId(checkoutData);

  // Confirmed HTTP failure without a provider order id → FAILED (safe to not retry blindly via same claim).
  if (!checkoutResponse!.ok && !providerOrderId) {
    const status = checkoutResponse!.status;
    if (status >= 500 || status === 408 || status === 429) {
      await markReconciliationRequired(
        assignment.id,
        adminUserId,
        customerUserId,
        "provider_uncertain",
        `http_${status}`,
        {
          providerResultKind: "uncertain",
          safeProviderStatusCode: `http_${status}`,
        }
      );
    }
    await markFailed(
      assignment.id,
      adminUserId,
      customerUserId,
      "provider_declined",
      `http_${status}`,
      "The provider declined or could not complete this package assignment."
    );
  }

  if (!providerOrderId) {
    // Ambiguous success shape — do not blind-retry.
    await markReconciliationRequired(
      assignment.id,
      adminUserId,
      customerUserId,
      "provider_uncertain",
      "missing_provider_order_id",
      {
        providerResultKind: "uncertain",
        safeProviderStatusCode: "missing_provider_order_id",
      }
    );
  }

  const returnedOfferId = extractReturnedOfferId(checkoutData);
  const offer = verifiedOffer!;
  if (
    returnedOfferId &&
    returnedOfferId.trim().toUpperCase() !==
      offer.offerId.trim().toUpperCase()
  ) {
    await markReconciliationRequired(
      assignment.id,
      adminUserId,
      customerUserId,
      "provider_uncertain",
      "offer_mismatch",
      {
        providerOrderId: providerOrderId!,
        providerResultKind: "uncertain",
        safeProviderStatusCode: "offer_mismatch",
      }
    );
  }

  // Confirmed provider success → local Order + assignment COMPLETED (wallet untouched).
  let orderId: string | null = null;
  try {
    const finalized = await prisma.$transaction(async (tx) => {
      const costCents = usdPriceToCents(offer.priceUSD);
      const order = await persistAssignedOrder(tx, {
        providerOrderId: providerOrderId!,
        customerUserId: customer.id,
        customerEmail: customer.email,
        verifiedOffer: offer,
        fundingSource: OrderFundingSource.COMPANY_FUNDED,
        status: OrderStatus.COMPLETED,
        checkoutPayload: checkoutData,
      });

      await tx.adminPackageAssignment.update({
        where: { id: assignment.id },
        data: {
          status: AdminPackageAssignmentStatus.COMPLETED,
          orderId: order.id,
          providerOrderId: order.providerOrderId,
          providerResultKind: "success",
          providerObservedAt: new Date(),
          offerId: offer.offerId,
          destinationCode: offer.countryCode,
          destinationName: offer.countryName || offer.countryCode,
          planName: offer.name,
          dataAllowance: offer.dataFormatted || null,
          validity:
            offer.durationDays != null ? `${offer.durationDays} Days` : null,
          providerCostCents: costCents,
          providerCurrency: offer.currency || "USD",
          completedAt: new Date(),
          failureCategory: null,
          failureCode: null,
          reconciliationState: null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: ADMIN_ASSIGNMENT_COMPLETED,
          targetType: "AdminPackageAssignment",
          targetId: assignment.id,
          metadata: {
            method: "admin_company_funded_assignment",
            fundingSource: OrderFundingSource.COMPANY_FUNDED,
            targetUserId: customer.id,
            assignmentId: assignment.id,
            orderId: order.id,
            offerId: offer.offerId,
            currency: offer.currency || "USD",
            reason: assignment.reason,
            ...(costCents != null ? { providerCostCents: costCents } : {}),
            ...(assignment.internalReference
              ? { internalReference: assignment.internalReference }
              : {}),
          } satisfies Prisma.InputJsonValue,
        },
      });

      return order;
    });
    orderId = finalized.id;
  } catch {
    await markReconciliationRequired(
      assignment.id,
      adminUserId,
      customerUserId,
      "local_finalize_failed",
      "order_persist_error",
      {
        providerOrderId: providerOrderId!,
        providerResultKind: "success",
        safeProviderStatusCode: "local_finalize_failed",
      }
    );
  }

  if (!orderId) {
    await markReconciliationRequired(
      assignment.id,
      adminUserId,
      customerUserId,
      "local_finalize_failed",
      "order_id_missing",
      {
        providerOrderId: providerOrderId!,
        providerResultKind: "success",
        safeProviderStatusCode: "order_id_missing",
      }
    );
  }

  // Email is best-effort; never reverse provider order or mutate wallet.
  try {
    const accessToken = createOrderAccessToken(providerOrderId!);
    const emailResult = await deliverOrderEmailAfterCheckout({
      orderId: providerOrderId!,
      customerEmail: customer.email,
      verifiedOffer: offer,
      checkoutPayload: checkoutData,
      accessToken: accessToken || undefined,
    });
    await prisma.adminPackageAssignment.update({
      where: { id: assignment.id },
      data: { emailDeliveryStatus: emailResult.emailDelivery },
    });
  } catch {
    try {
      await prisma.adminPackageAssignment.update({
        where: { id: assignment.id },
        data: { emailDeliveryStatus: "failed" },
      });
    } catch {
      // ignore secondary email status write failures
    }
  }

  return {
    assignmentId: assignment.id,
    customerUserId,
    orderId: orderId!,
    status: AdminPackageAssignmentStatus.COMPLETED,
    duplicate: false,
  };
}

export function formatProviderCostLabel(
  cents: number | null | undefined
): string {
  if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 0) {
    return "Not available";
  }
  return `${formatUsdCents(cents)} USD`;
}