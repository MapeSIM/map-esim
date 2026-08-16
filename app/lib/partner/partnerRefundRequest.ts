/**
 * Partner refund REQUEST create/list. Slice 1 never credits a wallet,
 * never sets refundTransactionId, and never calls the provider.
 */
import "server-only";

import {
  OrderFundingSource,
  PartnerEsimPurchaseStatus,
  PartnerRefundRequestReason,
  Prisma,
  RefundRequestStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import {
  PARTNER_REFUND_AUDIT,
  PARTNER_REFUND_NOTE_MAX,
  isOpenPartnerRefundStatus,
  parsePartnerRefundRequestReason,
  partnerRefundReasonLabel,
  partnerRefundStatusLabel,
  sanitizePartnerRefundNote,
} from "@/app/lib/partner/partnerRefundRequestConstants";
import { formatPartnerOrderDate } from "@/app/lib/partner/partnerOrdersDisplay";
import { formatUsdCents } from "@/app/lib/wallet/display";

export class PartnerRefundRequestError extends Error {
  readonly code:
    | "PARTNER_UNAVAILABLE"
    | "PURCHASE_UNAVAILABLE"
    | "NOT_ELIGIBLE"
    | "INVALID_REASON"
    | "INVALID_NOTE"
    | "UNAVAILABLE";

  constructor(code: PartnerRefundRequestError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "PartnerRefundRequestError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export type CreatePartnerRefundRequestInput = {
  partnerUserId: string;
  purchaseId: string;
  reason: unknown;
  partnerNote?: unknown;
};

export type CreatePartnerRefundRequestResult = {
  requestId: string;
  status: RefundRequestStatus;
  partnerChargeCents: number;
  reason: PartnerRefundRequestReason;
  createdAt: Date;
  duplicate: boolean;
};

export type PartnerRefundRequestSummary = {
  requestId: string;
  purchaseId: string;
  status: RefundRequestStatus;
  statusLabel: string;
  reasonLabel: string;
  createdAtLabel: string;
  partnerDebitLabel: string;
  adminDecisionNote: string | null;
};

async function loadOwnedOpenRequest(
  partnerId: string,
  purchaseId: string
): Promise<CreatePartnerRefundRequestResult | null> {
  const existing = await prisma.partnerRefundRequest.findFirst({
    where: {
      partnerId,
      partnerEsimPurchaseId: purchaseId,
      status: {
        in: [
          RefundRequestStatus.REQUESTED,
          RefundRequestStatus.UNDER_REVIEW,
          RefundRequestStatus.APPROVED_PENDING_EXECUTION,
        ],
      },
    },
    select: {
      id: true,
      status: true,
      partnerChargeCents: true,
      reason: true,
      createdAt: true,
    },
  });
  if (!existing) return null;
  return {
    requestId: existing.id,
    status: existing.status,
    partnerChargeCents: existing.partnerChargeCents,
    reason: existing.reason,
    createdAt: existing.createdAt,
    duplicate: true,
  };
}

/**
 * Create a Partner refund request for an owned purchase.
 * Never accepts a browser refund amount. Never moves money. Never calls VeSIM.
 */
export async function createPartnerRefundRequest(
  input: CreatePartnerRefundRequestInput
): Promise<CreatePartnerRefundRequestResult> {
  const purchaseId = (input.purchaseId ?? "").trim();
  const reason = parsePartnerRefundRequestReason(input.reason);
  const note = sanitizePartnerRefundNote(input.partnerNote);

  if (
    !purchaseId ||
    purchaseId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(purchaseId)
  ) {
    throw new PartnerRefundRequestError(
      "PURCHASE_UNAVAILABLE",
      "This purchase is unavailable for a refund request."
    );
  }
  if (!reason) {
    throw new PartnerRefundRequestError(
      "INVALID_REASON",
      "Select a valid refund reason."
    );
  }
  if (note.length > PARTNER_REFUND_NOTE_MAX) {
    throw new PartnerRefundRequestError(
      "INVALID_NOTE",
      `Keep your explanation under ${PARTNER_REFUND_NOTE_MAX} characters.`
    );
  }

  const actor = await requireActivePartnerActor(input.partnerUserId);
  if (!actor) {
    throw new PartnerRefundRequestError(
      "PARTNER_UNAVAILABLE",
      "Your Partner account is unavailable for refund requests."
    );
  }

  let purchase;
  try {
    purchase = await prisma.partnerEsimPurchase.findFirst({
      where: { id: purchaseId, partnerId: actor.partnerId },
      select: {
        id: true,
        partnerId: true,
        orderId: true,
        status: true,
        fundingSource: true,
        partnerChargeCents: true,
        retailPriceCents: true,
        currency: true,
        debitTransactionId: true,
        refundTransactionId: true,
        debitTransaction: { select: { amountCents: true } },
      },
    });
  } catch {
    throw new PartnerRefundRequestError(
      "UNAVAILABLE",
      "Refund requests are temporarily unavailable. Please try again shortly."
    );
  }

  if (!purchase) {
    throw new PartnerRefundRequestError(
      "PURCHASE_UNAVAILABLE",
      "This purchase is unavailable for a refund request."
    );
  }

  if (purchase.fundingSource !== OrderFundingSource.PARTNER_BALANCE) {
    throw new PartnerRefundRequestError(
      "NOT_ELIGIBLE",
      "This purchase is unavailable for a refund request."
    );
  }
  if (
    !Number.isInteger(purchase.partnerChargeCents) ||
    purchase.partnerChargeCents <= 0
  ) {
    throw new PartnerRefundRequestError(
      "NOT_ELIGIBLE",
      "A refundable Partner debit is not available for this purchase."
    );
  }
  if (!(purchase.debitTransactionId ?? "").trim()) {
    throw new PartnerRefundRequestError(
      "NOT_ELIGIBLE",
      "A refundable Partner debit is not available for this purchase."
    );
  }
  if (
    purchase.debitTransaction &&
    purchase.debitTransaction.amountCents !== purchase.partnerChargeCents
  ) {
    throw new PartnerRefundRequestError(
      "NOT_ELIGIBLE",
      "A refundable Partner debit is not available for this purchase."
    );
  }
  if (
    purchase.status === PartnerEsimPurchaseStatus.FAILED_REFUNDED ||
    (purchase.refundTransactionId ?? "").trim()
  ) {
    throw new PartnerRefundRequestError(
      "NOT_ELIGIBLE",
      "This purchase already has a completed refund."
    );
  }

  const existingOpen = await loadOwnedOpenRequest(actor.partnerId, purchase.id);
  if (existingOpen) return existingOpen;

  const currency = (purchase.currency || "USD").trim().toUpperCase() || "USD";

  try {
    const created = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const row = await tx.partnerRefundRequest.create({
        data: {
          partnerId: actor.partnerId,
          partnerEsimPurchaseId: purchase.id,
          orderId: purchase.orderId,
          reason: reason as PartnerRefundRequestReason,
          partnerNote: note || null,
          status: RefundRequestStatus.REQUESTED,
          partnerChargeCents: purchase.partnerChargeCents,
          retailPriceCents: purchase.retailPriceCents,
          currency,
          openPurchaseKey: purchase.id,
          createdAt: now,
          updatedAt: now,
        },
        select: {
          id: true,
          status: true,
          partnerChargeCents: true,
          reason: true,
          createdAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: PARTNER_REFUND_AUDIT.CREATED,
          targetType: "PartnerRefundRequest",
          targetId: row.id,
          metadata: {
            partnerId: actor.partnerId,
            purchaseId: purchase.id,
            orderId: purchase.orderId,
            reason,
            partnerChargeCents: purchase.partnerChargeCents,
            currency,
          },
        },
      });

      return row;
    });

    return {
      requestId: created.id,
      status: created.status,
      partnerChargeCents: created.partnerChargeCents,
      reason: created.reason,
      createdAt: created.createdAt,
      duplicate: false,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await loadOwnedOpenRequest(actor.partnerId, purchase.id);
      if (raced) return raced;
      throw new PartnerRefundRequestError(
        "UNAVAILABLE",
        "A refund request is already open for this purchase."
      );
    }
    throw new PartnerRefundRequestError(
      "UNAVAILABLE",
      "Refund requests are temporarily unavailable. Please try again shortly."
    );
  }
}

export async function listPartnerRefundRequestSummaries(options: {
  partnerUserId: string;
  purchaseIds: string[];
}): Promise<PartnerRefundRequestSummary[]> {
  const actor = await requireActivePartnerActor(options.partnerUserId);
  if (!actor) return [];

  const purchaseIds = options.purchaseIds
    .map((id) => id.trim())
    .filter((id) => id && id.length <= 64 && /^[A-Za-z0-9_-]+$/.test(id))
    .slice(0, 100);
  if (purchaseIds.length === 0) return [];

  const rows = await prisma.partnerRefundRequest.findMany({
    where: {
      partnerId: actor.partnerId,
      partnerEsimPurchaseId: { in: purchaseIds },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: {
      id: true,
      partnerEsimPurchaseId: true,
      status: true,
      reason: true,
      partnerChargeCents: true,
      adminDecisionNote: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    requestId: row.id,
    purchaseId: row.partnerEsimPurchaseId,
    status: row.status,
    statusLabel: partnerRefundStatusLabel(row.status),
    reasonLabel: partnerRefundReasonLabel(row.reason),
    createdAtLabel: formatPartnerOrderDate(row.createdAt),
    partnerDebitLabel: `${formatUsdCents(row.partnerChargeCents)} USD`,
    adminDecisionNote:
      row.status === RefundRequestStatus.REJECTED
        ? row.adminDecisionNote
        : null,
  }));
}

export function latestPartnerRefundSummary(
  rows: PartnerRefundRequestSummary[]
): PartnerRefundRequestSummary | null {
  return rows[0] ?? null;
}

export function latestOpenPartnerRefundSummary(
  rows: PartnerRefundRequestSummary[]
): PartnerRefundRequestSummary | null {
  return rows.find((row) => isOpenPartnerRefundStatus(row.status)) ?? null;
}

export function toPartnerRefundCardState(row: PartnerRefundRequestSummary): {
  statusLabel: string;
  reasonLabel: string;
  createdAtLabel: string;
  isOpen: boolean;
  isCompleted: boolean;
  decisionNote: string | null;
  refundedAmountLabel: string | null;
} {
  const isCompleted = row.status === RefundRequestStatus.COMPLETED;
  return {
    statusLabel: row.statusLabel,
    reasonLabel: row.reasonLabel,
    createdAtLabel: row.createdAtLabel,
    isOpen: isOpenPartnerRefundStatus(row.status),
    isCompleted,
    decisionNote: row.adminDecisionNote,
    refundedAmountLabel: isCompleted ? row.partnerDebitLabel : null,
  };
}
