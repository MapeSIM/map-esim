/**
 * Partner eSIM purchase wallet primitives (server-only).
 * Runs inside a caller-owned Prisma transaction — no provider/Order/UI.
 * Uses ESIM_PURCHASE_DEBIT / ESIM_PURCHASE_REFUND only (never ADMIN_*).
 */
import "server-only";

import {
  PartnerEsimPurchaseStatus,
  PartnerWalletTransactionType,
  Prisma,
  Role,
} from "@prisma/client";

/** Bounded CAS retries within a caller-owned transaction (same bound as admin wallet). */
const PARTNER_PURCHASE_WALLET_CAS_MAX_ATTEMPTS = 12;

export const PARTNER_ESIM_PURCHASE_DEBIT_REF = "PARTNER_ESIM_PURCHASE_DEBIT";
export const PARTNER_ESIM_PURCHASE_REFUND_REF = "PARTNER_ESIM_PURCHASE_REFUND";

/** Deterministic debit key — charset matches Phase 1 Partner wallet keys. */
export function partnerEsimPurchaseDebitIdempotencyKey(
  partnerEsimPurchaseId: string
): string {
  const id = partnerEsimPurchaseId.trim();
  return `partner_esim_debit_${id}`.slice(0, 128);
}

/** Deterministic refund key for the exact original purchase debit. */
export function partnerEsimPurchaseRefundIdempotencyKey(
  partnerEsimPurchaseId: string
): string {
  const id = partnerEsimPurchaseId.trim();
  return `partner_esim_refund_${id}`.slice(0, 128);
}

/**
 * Gateway reservation release key — scoped to the active debit so
 * cancel → READY → reserve → cancel cycles can credit again.
 */
export function partnerEsimPurchaseGatewayReleaseIdempotencyKey(
  partnerEsimPurchaseId: string,
  debitTransactionId: string
): string {
  const purchaseId = partnerEsimPurchaseId.trim();
  const debitId = debitTransactionId.trim();
  return `partner_esim_release_gw_${purchaseId}_${debitId}`.slice(0, 128);
}

/**
 * Next debit idempotency key for a purchase. Reuses the base key while the
 * purchase still holds that debit; otherwise allocates `…:N` after a release.
 */
export async function allocatePartnerEsimPurchaseDebitIdempotencyKey(
  tx: Prisma.TransactionClient,
  partnerEsimPurchaseId: string
): Promise<string> {
  const purchaseId = assertPurchaseId(partnerEsimPurchaseId);
  const base = partnerEsimPurchaseDebitIdempotencyKey(purchaseId);
  const existing = await tx.partnerWalletTransaction.findUnique({
    where: { idempotencyKey: base },
    select: { id: true },
  });
  if (!existing) return base;

  const purchase = await tx.partnerEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: { debitTransactionId: true, status: true },
  });
  if (
    purchase?.debitTransactionId === existing.id &&
    (purchase.status === "AWAITING_GATEWAY_PAYMENT" ||
      purchase.status === "FUNDS_RESERVED" ||
      purchase.status === "PROVIDER_PENDING" ||
      purchase.status === "FUNDED")
  ) {
    return base;
  }

  const priorCount = await tx.partnerWalletTransaction.count({
    where: {
      referenceType: PARTNER_ESIM_PURCHASE_DEBIT_REF,
      referenceId: purchaseId,
      type: PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT,
    },
  });
  return `partner_esim_debit_${purchaseId}:${priorCount + 1}`.slice(0, 128);
}

export type PartnerPurchaseWalletTxResult = {
  outcome: "created" | "already_applied";
  transactionId: string;
  amountCents: number;
  balanceBeforeCents: number;
  balanceAfterCents: number;
  versionAfter: number;
};

export class PartnerPurchaseWalletError extends Error {
  readonly code:
    | "INVALID_AMOUNT"
    | "INVALID_PURCHASE"
    | "PARTNER_UNAVAILABLE"
    | "WALLET_UNAVAILABLE"
    | "INSUFFICIENT_FUNDS"
    | "IDEMPOTENCY_CONFLICT"
    | "UNAVAILABLE";

  constructor(code: PartnerPurchaseWalletError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "PartnerPurchaseWalletError";
  }
}

class PartnerPurchaseWalletCasConflictError extends Error {
  constructor() {
    super("PARTNER_PURCHASE_WALLET_CAS_CONFLICT");
    this.name = "PartnerPurchaseWalletCasConflictError";
  }
}

function isCasConflict(error: unknown): boolean {
  return (
    error instanceof PartnerPurchaseWalletCasConflictError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name ===
        "PartnerPurchaseWalletCasConflictError")
  );
}

function assertPositiveSafeCents(amountCents: number): void {
  if (
    !Number.isInteger(amountCents) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0
  ) {
    throw new PartnerPurchaseWalletError(
      "INVALID_AMOUNT",
      "Purchase wallet amount is invalid."
    );
  }
}

function assertPurchaseId(partnerEsimPurchaseId: string): string {
  const id = partnerEsimPurchaseId.trim();
  if (!id || id.length > 64) {
    throw new PartnerPurchaseWalletError(
      "INVALID_PURCHASE",
      "Purchase reference is invalid."
    );
  }
  return id;
}

/**
 * Debit Partner wallet for an eSIM purchase reserve (caller-owned tx).
 * Exact-once via partner_esim_debit_<purchaseId>.
 */
export async function reservePartnerPurchaseFundsInTx(
  tx: Prisma.TransactionClient,
  options: {
    partnerId: string;
    partnerEsimPurchaseId: string;
    /** Server-authoritative partnerChargeCents snapshot — never trust client. */
    amountCents: number;
    /** Optional override; defaults to allocated debit key for this purchase. */
    idempotencyKey?: string;
  }
): Promise<PartnerPurchaseWalletTxResult> {
  const partnerId = options.partnerId.trim();
  const purchaseId = assertPurchaseId(options.partnerEsimPurchaseId);
  const amountCents = options.amountCents;
  assertPositiveSafeCents(amountCents);

  if (!partnerId || partnerId.length > 64) {
    throw new PartnerPurchaseWalletError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }

  const idempotencyKey = (
    options.idempotencyKey?.trim() ||
    (await allocatePartnerEsimPurchaseDebitIdempotencyKey(tx, purchaseId))
  ).slice(0, 128);

  for (let attempt = 0; attempt < PARTNER_PURCHASE_WALLET_CAS_MAX_ATTEMPTS; attempt++) {
    try {
      return await reserveDebitAttempt(tx, {
        partnerId,
        purchaseId,
        amountCents,
        idempotencyKey,
      });
    } catch (error) {
      if (
        isCasConflict(error) &&
        attempt < PARTNER_PURCHASE_WALLET_CAS_MAX_ATTEMPTS - 1
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new PartnerPurchaseWalletError(
    "UNAVAILABLE",
    "Partner wallet is temporarily unavailable. Please try again shortly."
  );
}

async function reserveDebitAttempt(
  tx: Prisma.TransactionClient,
  options: {
    partnerId: string;
    purchaseId: string;
    amountCents: number;
    idempotencyKey: string;
  }
): Promise<PartnerPurchaseWalletTxResult> {
  const existing = await tx.partnerWalletTransaction.findUnique({
    where: { idempotencyKey: options.idempotencyKey },
    select: {
      id: true,
      amountCents: true,
      balanceBeforeCents: true,
      balanceAfterCents: true,
      type: true,
      wallet: {
        select: {
          partnerId: true,
          version: true,
          balanceCents: true,
        },
      },
    },
  });

  if (existing) {
    if (
      existing.wallet.partnerId !== options.partnerId ||
      existing.type !== PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT ||
      existing.amountCents !== options.amountCents
    ) {
      throw new PartnerPurchaseWalletError(
        "IDEMPOTENCY_CONFLICT",
        "This purchase wallet request conflicts with an existing ledger entry."
      );
    }
    return {
      outcome: "already_applied",
      transactionId: existing.id,
      amountCents: existing.amountCents,
      balanceBeforeCents: existing.balanceBeforeCents,
      balanceAfterCents: existing.balanceAfterCents,
      versionAfter: existing.wallet.version,
    };
  }

  const profile = await tx.partnerProfile.findUnique({
    where: { id: options.partnerId },
    select: {
      id: true,
      disabledAt: true,
      user: { select: { role: true, deletedAt: true } },
      walletAccount: {
        select: { id: true, balanceCents: true, version: true },
      },
    },
  });

  if (
    !profile ||
    profile.disabledAt ||
    !profile.user ||
    profile.user.deletedAt ||
    profile.user.role !== Role.PARTNER
  ) {
    throw new PartnerPurchaseWalletError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }

  const wallet = profile.walletAccount;
  if (!wallet) {
    throw new PartnerPurchaseWalletError(
      "WALLET_UNAVAILABLE",
      "Partner wallet is unavailable."
    );
  }

  if (wallet.balanceCents < options.amountCents) {
    throw new PartnerPurchaseWalletError(
      "INSUFFICIENT_FUNDS",
      "Partner wallet balance is not enough for this package."
    );
  }

  const balanceBeforeCents = wallet.balanceCents;
  const balanceAfterCents = balanceBeforeCents - options.amountCents;
  if (!Number.isSafeInteger(balanceAfterCents) || balanceAfterCents < 0) {
    throw new PartnerPurchaseWalletError(
      "INSUFFICIENT_FUNDS",
      "Partner wallet balance is not enough for this package."
    );
  }

  const cas = await tx.partnerWalletAccount.updateMany({
    where: {
      id: wallet.id,
      version: wallet.version,
      balanceCents: { gte: options.amountCents },
    },
    data: {
      balanceCents: balanceAfterCents,
      version: { increment: 1 },
    },
  });

  if (cas.count !== 1) {
    const fresh = await tx.partnerWalletAccount.findUnique({
      where: { id: wallet.id },
      select: { balanceCents: true, version: true },
    });
    if (!fresh || fresh.balanceCents < options.amountCents) {
      throw new PartnerPurchaseWalletError(
        "INSUFFICIENT_FUNDS",
        "Partner wallet balance is not enough for this package."
      );
    }
    throw new PartnerPurchaseWalletCasConflictError();
  }

  try {
    const debitTx = await tx.partnerWalletTransaction.create({
      data: {
        partnerWalletAccountId: wallet.id,
        type: PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT,
        amountCents: options.amountCents,
        balanceBeforeCents,
        balanceAfterCents,
        reason: "Partner eSIM purchase debit",
        referenceType: PARTNER_ESIM_PURCHASE_DEBIT_REF,
        referenceId: options.purchaseId,
        idempotencyKey: options.idempotencyKey,
        createdByAdminId: null,
      },
      select: { id: true },
    });

    return {
      outcome: "created",
      transactionId: debitTx.id,
      amountCents: options.amountCents,
      balanceBeforeCents,
      balanceAfterCents,
      versionAfter: wallet.version + 1,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Concurrent writer won the ledger unique key. Abort this tx so the
      // caller retries cleanly — never continue after a successful CAS without ledger.
      throw new PartnerPurchaseWalletError(
        "UNAVAILABLE",
        "Partner wallet is temporarily unavailable. Please try again shortly."
      );
    }
    throw error;
  }
}

/**
 * Credit Partner wallet for exact original purchase debit (caller-owned tx).
 * Exact-once via partner_esim_refund_<purchaseId>. Amount must be the immutable snapshot.
 */
export async function refundPartnerPurchaseFundsInTx(
  tx: Prisma.TransactionClient,
  options: {
    partnerId: string;
    partnerEsimPurchaseId: string;
    /** Exact original partnerChargeCents / walletAppliedCents — never recalculate. */
    amountCents: number;
    /** Optional override (gateway release uses debit-scoped keys). */
    idempotencyKey?: string;
    reason?: string;
  }
): Promise<PartnerPurchaseWalletTxResult> {
  const partnerId = options.partnerId.trim();
  const purchaseId = assertPurchaseId(options.partnerEsimPurchaseId);
  const amountCents = options.amountCents;
  assertPositiveSafeCents(amountCents);

  if (!partnerId || partnerId.length > 64) {
    throw new PartnerPurchaseWalletError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }

  const idempotencyKey = (
    options.idempotencyKey?.trim() ||
    partnerEsimPurchaseRefundIdempotencyKey(purchaseId)
  ).slice(0, 128);

  for (let attempt = 0; attempt < PARTNER_PURCHASE_WALLET_CAS_MAX_ATTEMPTS; attempt++) {
    try {
      return await refundCreditAttempt(tx, {
        partnerId,
        purchaseId,
        amountCents,
        idempotencyKey,
        reason: options.reason ?? "Partner eSIM purchase refund",
      });
    } catch (error) {
      if (
        isCasConflict(error) &&
        attempt < PARTNER_PURCHASE_WALLET_CAS_MAX_ATTEMPTS - 1
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new PartnerPurchaseWalletError(
    "UNAVAILABLE",
    "Partner wallet is temporarily unavailable. Please try again shortly."
  );
}

async function refundCreditAttempt(
  tx: Prisma.TransactionClient,
  options: {
    partnerId: string;
    purchaseId: string;
    amountCents: number;
    idempotencyKey: string;
    reason: string;
  }
): Promise<PartnerPurchaseWalletTxResult> {
  const existing = await tx.partnerWalletTransaction.findUnique({
    where: { idempotencyKey: options.idempotencyKey },
    select: {
      id: true,
      amountCents: true,
      balanceBeforeCents: true,
      balanceAfterCents: true,
      type: true,
      wallet: {
        select: {
          partnerId: true,
          version: true,
          balanceCents: true,
        },
      },
    },
  });

  if (existing) {
    if (
      existing.wallet.partnerId !== options.partnerId ||
      existing.type !== PartnerWalletTransactionType.ESIM_PURCHASE_REFUND ||
      existing.amountCents !== options.amountCents
    ) {
      throw new PartnerPurchaseWalletError(
        "IDEMPOTENCY_CONFLICT",
        "This purchase wallet request conflicts with an existing ledger entry."
      );
    }
    return {
      outcome: "already_applied",
      transactionId: existing.id,
      amountCents: existing.amountCents,
      balanceBeforeCents: existing.balanceBeforeCents,
      balanceAfterCents: existing.balanceAfterCents,
      versionAfter: existing.wallet.version,
    };
  }

  const profile = await tx.partnerProfile.findUnique({
    where: { id: options.partnerId },
    select: {
      id: true,
      disabledAt: true,
      user: { select: { role: true, deletedAt: true } },
      walletAccount: {
        select: { id: true, balanceCents: true, version: true },
      },
    },
  });

  if (
    !profile ||
    !profile.user ||
    profile.user.deletedAt ||
    profile.user.role !== Role.PARTNER
  ) {
    throw new PartnerPurchaseWalletError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }
  // Disabled Partners may still receive ESIM_PURCHASE_REFUND for a debit
  // already taken. New purchases remain blocked on the reserve path.

  const wallet = profile.walletAccount;
  if (!wallet) {
    throw new PartnerPurchaseWalletError(
      "WALLET_UNAVAILABLE",
      "Partner wallet is unavailable."
    );
  }

  const balanceBeforeCents = wallet.balanceCents;
  const balanceAfterCents = balanceBeforeCents + options.amountCents;
  if (!Number.isSafeInteger(balanceAfterCents) || balanceAfterCents < 0) {
    throw new PartnerPurchaseWalletError(
      "UNAVAILABLE",
      "Partner wallet is temporarily unavailable. Please try again shortly."
    );
  }

  const cas = await tx.partnerWalletAccount.updateMany({
    where: {
      id: wallet.id,
      version: wallet.version,
    },
    data: {
      balanceCents: balanceAfterCents,
      version: { increment: 1 },
    },
  });

  if (cas.count !== 1) {
    throw new PartnerPurchaseWalletCasConflictError();
  }

  try {
    const refundTx = await tx.partnerWalletTransaction.create({
      data: {
        partnerWalletAccountId: wallet.id,
        type: PartnerWalletTransactionType.ESIM_PURCHASE_REFUND,
        amountCents: options.amountCents,
        balanceBeforeCents,
        balanceAfterCents,
        reason: options.reason,
        referenceType: PARTNER_ESIM_PURCHASE_REFUND_REF,
        referenceId: options.purchaseId,
        idempotencyKey: options.idempotencyKey,
        createdByAdminId: null,
      },
      select: { id: true },
    });

    return {
      outcome: "created",
      transactionId: refundTx.id,
      amountCents: options.amountCents,
      balanceBeforeCents,
      balanceAfterCents,
      versionAfter: wallet.version + 1,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new PartnerPurchaseWalletError(
        "UNAVAILABLE",
        "Partner wallet is temporarily unavailable. Please try again shortly."
      );
    }
    throw error;
  }
}

/**
 * Release a still-pending Partner split gateway reservation and restore READY.
 * Debit-scoped release keys allow cancel → READY → reserve → cancel cycles.
 * Never marks FUNDED / PROVIDER_PENDING / COMPLETED / RECONCILIATION purchases.
 */
export async function releasePartnerGatewayReservationInTx(
  tx: Prisma.TransactionClient,
  options: {
    partnerId: string;
    partnerEsimPurchaseId: string;
    /** Exact walletAppliedCents reserved before gateway — never recalculate. */
    amountCents: number;
  }
): Promise<{
  outcome: "created" | "already_released" | "linked_existing";
  refundTransactionId: string | null;
}> {
  const partnerId = options.partnerId.trim();
  const purchaseId = assertPurchaseId(options.partnerEsimPurchaseId);
  const amountCents = options.amountCents;

  if (!partnerId || partnerId.length > 64) {
    throw new PartnerPurchaseWalletError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }
  if (
    !Number.isInteger(amountCents) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 0
  ) {
    throw new PartnerPurchaseWalletError(
      "INVALID_AMOUNT",
      "Purchase wallet amount is invalid."
    );
  }

  const purchase = await tx.partnerEsimPurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      partnerId: true,
      status: true,
      walletAppliedCents: true,
      debitTransactionId: true,
      refundTransactionId: true,
    },
  });

  if (!purchase || purchase.partnerId !== partnerId) {
    throw new PartnerPurchaseWalletError(
      "INVALID_PURCHASE",
      "Purchase reference is invalid."
    );
  }

  if (
    purchase.status === PartnerEsimPurchaseStatus.READY &&
    !purchase.debitTransactionId
  ) {
    return { outcome: "already_released", refundTransactionId: null };
  }

  const releasable =
    purchase.status === PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT ||
    purchase.status === PartnerEsimPurchaseStatus.FUNDS_RESERVED;
  if (!releasable) {
    return { outcome: "already_released", refundTransactionId: null };
  }

  if (purchase.walletAppliedCents !== amountCents) {
    throw new PartnerPurchaseWalletError(
      "INVALID_AMOUNT",
      "Purchase wallet amount is invalid."
    );
  }

  // Gateway-only: no wallet debit — just restore READY.
  if (amountCents <= 0) {
    const cleared = await tx.partnerEsimPurchase.updateMany({
      where: {
        id: purchaseId,
        partnerId,
        status: {
          in: [
            PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
            PartnerEsimPurchaseStatus.FUNDS_RESERVED,
          ],
        },
      },
      data: {
        status: PartnerEsimPurchaseStatus.READY,
        debitTransactionId: null,
        refundTransactionId: null,
        failureCategory: null,
        failureCode: null,
      },
    });
    if (cleared.count !== 1) {
      return { outcome: "already_released", refundTransactionId: null };
    }
    return { outcome: "created", refundTransactionId: null };
  }

  if (!purchase.debitTransactionId) {
    throw new PartnerPurchaseWalletError(
      "INVALID_PURCHASE",
      "Purchase reference is invalid."
    );
  }

  const releaseKey = partnerEsimPurchaseGatewayReleaseIdempotencyKey(
    purchaseId,
    purchase.debitTransactionId
  );

  const existingRelease = await tx.partnerWalletTransaction.findUnique({
    where: { idempotencyKey: releaseKey },
    select: { id: true, amountCents: true, type: true },
  });

  if (existingRelease) {
    if (
      existingRelease.amountCents !== amountCents ||
      existingRelease.type !== PartnerWalletTransactionType.ESIM_PURCHASE_REFUND
    ) {
      throw new PartnerPurchaseWalletError(
        "IDEMPOTENCY_CONFLICT",
        "This purchase wallet request conflicts with an existing ledger entry."
      );
    }
    const relinked = await tx.partnerEsimPurchase.updateMany({
      where: {
        id: purchaseId,
        partnerId,
        status: {
          in: [
            PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
            PartnerEsimPurchaseStatus.FUNDS_RESERVED,
          ],
        },
      },
      data: {
        status: PartnerEsimPurchaseStatus.READY,
        debitTransactionId: null,
        refundTransactionId: null,
        failureCategory: null,
        failureCode: null,
      },
    });
    if (relinked.count !== 1) {
      return {
        outcome: "already_released",
        refundTransactionId: existingRelease.id,
      };
    }
    return {
      outcome: "linked_existing",
      refundTransactionId: existingRelease.id,
    };
  }

  // CAS claim before credit so a concurrent FUND cannot lose to a late release.
  const claimed = await tx.partnerEsimPurchase.updateMany({
    where: {
      id: purchaseId,
      partnerId,
      status: {
        in: [
          PartnerEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
          PartnerEsimPurchaseStatus.FUNDS_RESERVED,
        ],
      },
      debitTransactionId: purchase.debitTransactionId,
    },
    data: {
      status: PartnerEsimPurchaseStatus.READY,
      debitTransactionId: null,
      refundTransactionId: null,
      failureCategory: null,
      failureCode: null,
    },
  });
  if (claimed.count !== 1) {
    return { outcome: "already_released", refundTransactionId: null };
  }

  const credited = await refundPartnerPurchaseFundsInTx(tx, {
    partnerId,
    partnerEsimPurchaseId: purchaseId,
    amountCents,
    idempotencyKey: releaseKey,
    reason: "Partner eSIM gateway reservation release",
  });

  return {
    outcome:
      credited.outcome === "created" ? "created" : "linked_existing",
    refundTransactionId: credited.transactionId,
  };
}
