import "server-only";

import {
  PartnerWalletTransactionType,
  Prisma,
  Role,
  WalletCurrency,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  PARTNER_ADMIN_CREDIT_MAX_CENTS,
  PARTNER_ADMIN_CREDIT_MIN_CENTS,
  PARTNER_ADMIN_DEBIT_MAX_CENTS,
  PARTNER_ADMIN_DEBIT_MIN_CENTS,
} from "@/app/lib/partner/partnerWalletAmount";
import { formatUsdCents } from "@/app/lib/wallet/display";

export const PARTNER_ADMIN_CREDIT_REFERENCE_TYPE = "PARTNER_ADMIN_CREDIT";
export const PARTNER_ADMIN_DEBIT_REFERENCE_TYPE = "PARTNER_ADMIN_DEBIT";
export const PARTNER_CREDIT_ADDED_AUDIT = "partner.credit_added";
export const PARTNER_CREDIT_DEDUCTED_AUDIT = "partner.credit_deducted";

export type PartnerWalletCreditInput = {
  adminUserId: string;
  partnerId: string;
  amountCents: number;
  reason: string;
  internalReference: string | null;
  idempotencyKey: string;
};

export type PartnerWalletDebitInput = {
  adminUserId: string;
  partnerId: string;
  amountCents: number;
  reason: string;
  internalReference: string | null;
  idempotencyKey: string;
};

export type PartnerWalletMutationResult = {
  duplicate: boolean;
  partnerId: string;
  transactionId: string;
  amountCents: number;
  amountLabel: string;
  balanceCents: number;
  balanceLabel: string;
  currency: "USD";
};

/** Bounded retries when version CAS loses to a concurrent wallet mutation. */
export const PARTNER_WALLET_CAS_MAX_ATTEMPTS = 12;

export class PartnerWalletCreditError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "PARTNER_UNAVAILABLE"
    | "INVALID_AMOUNT"
    | "INVALID_IDEMPOTENCY"
    | "UNAVAILABLE";

  constructor(code: PartnerWalletCreditError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "PartnerWalletCreditError";
  }
}

export class PartnerWalletDebitError extends Error {
  readonly code:
    | "FORBIDDEN"
    | "PARTNER_UNAVAILABLE"
    | "WALLET_UNAVAILABLE"
    | "INSUFFICIENT_FUNDS"
    | "INVALID_AMOUNT"
    | "INVALID_IDEMPOTENCY"
    | "UNAVAILABLE";

  constructor(code: PartnerWalletDebitError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "PartnerWalletDebitError";
  }
}

/** Internal: version CAS lost; caller may retry within PARTNER_WALLET_CAS_MAX_ATTEMPTS. */
class PartnerWalletCasConflictError extends Error {
  constructor() {
    super("PARTNER_WALLET_CAS_CONFLICT");
    this.name = "PartnerWalletCasConflictError";
  }
}

function isPartnerWalletCasConflict(error: unknown): boolean {
  return (
    error instanceof PartnerWalletCasConflictError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "PartnerWalletCasConflictError") ||
    (typeof error === "object" &&
      error !== null &&
      "message" in error &&
      (error as { message?: string }).message === "PARTNER_WALLET_CAS_CONFLICT")
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function loadPartnerProfileForMutation(
  tx: Prisma.TransactionClient,
  partnerId: string
) {
  return tx.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      disabledAt: true,
      user: {
        select: {
          id: true,
          role: true,
          deletedAt: true,
        },
      },
      walletAccount: {
        select: {
          id: true,
          balanceCents: true,
          version: true,
        },
      },
    },
  });
}

function assertActivePartnerForMutation(
  profile: Awaited<ReturnType<typeof loadPartnerProfileForMutation>>
): void {
  if (
    !profile ||
    profile.disabledAt ||
    !profile.user ||
    profile.user.deletedAt ||
    profile.user.role !== Role.PARTNER
  ) {
    throw new PartnerWalletCreditError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }
}

async function loadExistingCreditResult(
  idempotencyKey: string,
  partnerId: string
): Promise<PartnerWalletMutationResult | null> {
  const existing = await prisma.partnerWalletTransaction.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      amountCents: true,
      balanceAfterCents: true,
      type: true,
      wallet: {
        select: {
          partnerId: true,
          balanceCents: true,
        },
      },
    },
  });

  if (
    !existing ||
    existing.wallet.partnerId !== partnerId ||
    existing.type !== PartnerWalletTransactionType.ADMIN_CREDIT
  ) {
    return null;
  }

  return {
    duplicate: true,
    partnerId,
    transactionId: existing.id,
    amountCents: existing.amountCents,
    amountLabel: formatUsdCents(existing.amountCents),
    balanceCents: existing.balanceAfterCents,
    balanceLabel: formatUsdCents(existing.balanceAfterCents),
    currency: "USD",
  };
}

async function loadExistingDebitResult(
  idempotencyKey: string,
  partnerId: string
): Promise<PartnerWalletMutationResult | null> {
  const existing = await prisma.partnerWalletTransaction.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      amountCents: true,
      balanceAfterCents: true,
      type: true,
      wallet: {
        select: {
          partnerId: true,
          balanceCents: true,
        },
      },
    },
  });

  if (
    !existing ||
    existing.wallet.partnerId !== partnerId ||
    existing.type !== PartnerWalletTransactionType.ADMIN_DEBIT
  ) {
    return null;
  }

  return {
    duplicate: true,
    partnerId,
    transactionId: existing.id,
    amountCents: existing.amountCents,
    amountLabel: formatUsdCents(existing.amountCents),
    balanceCents: existing.balanceAfterCents,
    balanceLabel: formatUsdCents(existing.balanceAfterCents),
    currency: "USD",
  };
}

/**
 * Atomically credit a PARTNER wallet (ADMIN_CREDIT).
 * Creates PartnerWalletAccount only on the first successful credit.
 * Uses version-checked conditional updateMany (same CAS discipline as debit).
 */
export async function creditPartnerWalletByAdmin(
  input: PartnerWalletCreditInput
): Promise<PartnerWalletMutationResult> {
  const adminUserId = input.adminUserId.trim();
  const partnerId = input.partnerId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const reason = input.reason.trim();
  const internalReference = input.internalReference?.trim() || null;
  const amountCents = input.amountCents;

  if (!adminUserId || adminUserId.length > 64) {
    throw new PartnerWalletCreditError("FORBIDDEN", "Not authorized.");
  }
  if (!partnerId || partnerId.length > 64) {
    throw new PartnerWalletCreditError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
  ) {
    throw new PartnerWalletCreditError(
      "INVALID_IDEMPOTENCY",
      "This credit request could not be processed. Please reload and try again."
    );
  }
  if (
    !Number.isInteger(amountCents) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < PARTNER_ADMIN_CREDIT_MIN_CENTS ||
    amountCents > PARTNER_ADMIN_CREDIT_MAX_CENTS
  ) {
    throw new PartnerWalletCreditError(
      "INVALID_AMOUNT",
      "Enter a valid USD amount."
    );
  }

  const prior = await loadExistingCreditResult(idempotencyKey, partnerId);
  if (prior) return prior;

  try {
    for (let attempt = 0; attempt < PARTNER_WALLET_CAS_MAX_ATTEMPTS; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const existingTx = await tx.partnerWalletTransaction.findUnique({
            where: { idempotencyKey },
            select: {
              id: true,
              amountCents: true,
              balanceAfterCents: true,
              type: true,
              wallet: {
                select: { partnerId: true, balanceCents: true },
              },
            },
          });

          if (existingTx) {
            if (
              existingTx.wallet.partnerId !== partnerId ||
              existingTx.type !== PartnerWalletTransactionType.ADMIN_CREDIT
            ) {
              throw new PartnerWalletCreditError(
                "INVALID_IDEMPOTENCY",
                "This credit request could not be processed. Please reload and try again."
              );
            }
            return {
              duplicate: true,
              partnerId,
              transactionId: existingTx.id,
              amountCents: existingTx.amountCents,
              amountLabel: formatUsdCents(existingTx.amountCents),
              balanceCents: existingTx.balanceAfterCents,
              balanceLabel: formatUsdCents(existingTx.balanceAfterCents),
              currency: "USD" as const,
            };
          }

          const admin = await tx.user.findUnique({
            where: { id: adminUserId },
            select: {
              id: true,
              role: true,
              deletedAt: true,
              adminDisabledAt: true,
            },
          });
          if (
            !admin ||
            admin.deletedAt ||
            admin.role !== Role.ADMIN ||
            admin.adminDisabledAt
          ) {
            throw new PartnerWalletCreditError("FORBIDDEN", "Not authorized.");
          }

          const profile = await loadPartnerProfileForMutation(tx, partnerId);
          try {
            assertActivePartnerForMutation(profile);
          } catch {
            throw new PartnerWalletCreditError(
              "PARTNER_UNAVAILABLE",
              "Partner is unavailable."
            );
          }
          if (!profile) {
            throw new PartnerWalletCreditError(
              "PARTNER_UNAVAILABLE",
              "Partner is unavailable."
            );
          }

          let wallet = profile.walletAccount;

          if (!wallet) {
            try {
              wallet = await tx.partnerWalletAccount.create({
                data: {
                  partnerId: profile.id,
                  currency: WalletCurrency.USD,
                  balanceCents: 0,
                  version: 0,
                },
                select: {
                  id: true,
                  balanceCents: true,
                  version: true,
                },
              });
            } catch (createError) {
              if (!isUniqueViolation(createError)) throw createError;
              wallet = await tx.partnerWalletAccount.findUnique({
                where: { partnerId: profile.id },
                select: {
                  id: true,
                  balanceCents: true,
                  version: true,
                },
              });
              if (!wallet) throw createError;
            }
          }

          const balanceBeforeCents = wallet.balanceCents;
          const balanceAfterCents = balanceBeforeCents + amountCents;
          if (!Number.isSafeInteger(balanceAfterCents) || balanceAfterCents < 0) {
            throw new PartnerWalletCreditError(
              "INVALID_AMOUNT",
              "Enter a valid USD amount."
            );
          }

          // Strict version CAS — concurrent credits/debits cannot lost-update.
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
            throw new PartnerWalletCasConflictError();
          }

          const transaction = await tx.partnerWalletTransaction.create({
            data: {
              partnerWalletAccountId: wallet.id,
              type: PartnerWalletTransactionType.ADMIN_CREDIT,
              amountCents,
              balanceBeforeCents,
              balanceAfterCents,
              reason,
              referenceType: PARTNER_ADMIN_CREDIT_REFERENCE_TYPE,
              referenceId: internalReference,
              createdByAdminId: admin.id,
              idempotencyKey,
            },
            select: { id: true, amountCents: true },
          });

          const metadata: Prisma.InputJsonValue = {
            method: "partner_admin_credit",
            amountCents,
            currency: "USD",
            reason,
            ...(internalReference ? { internalReference } : {}),
            partnerId: profile.id,
            partnerUserId: profile.user!.id,
            partnerWalletTransactionId: transaction.id,
          };

          await tx.auditLog.create({
            data: {
              actorUserId: admin.id,
              action: PARTNER_CREDIT_ADDED_AUDIT,
              targetType: "PartnerWalletTransaction",
              targetId: transaction.id,
              metadata,
            },
          });

          return {
            duplicate: false,
            partnerId: profile.id,
            transactionId: transaction.id,
            amountCents: transaction.amountCents,
            amountLabel: formatUsdCents(transaction.amountCents),
            balanceCents: balanceAfterCents,
            balanceLabel: formatUsdCents(balanceAfterCents),
            currency: "USD" as const,
          };
        });
      } catch (error) {
        if (
          isPartnerWalletCasConflict(error) &&
          attempt < PARTNER_WALLET_CAS_MAX_ATTEMPTS - 1
        ) {
          continue;
        }
        if (isPartnerWalletCasConflict(error)) {
          throw new PartnerWalletCreditError(
            "UNAVAILABLE",
            "Partner wallet credit is temporarily unavailable. Please try again shortly."
          );
        }
        throw error;
      }
    }

    throw new PartnerWalletCreditError(
      "UNAVAILABLE",
      "Partner wallet credit is temporarily unavailable. Please try again shortly."
    );
  } catch (error) {
    if (error instanceof PartnerWalletCreditError) throw error;

    if (isUniqueViolation(error)) {
      const recovered = await loadExistingCreditResult(
        idempotencyKey,
        partnerId
      );
      if (recovered) return recovered;
    }

    throw new PartnerWalletCreditError(
      "UNAVAILABLE",
      "Partner wallet credit is temporarily unavailable. Please try again shortly."
    );
  }
}

/**
 * Atomically debit a PARTNER wallet (ADMIN_DEBIT).
 * Wallet must already exist. Uses version-checked conditional balance update.
 */
export async function debitPartnerWalletByAdmin(
  input: PartnerWalletDebitInput
): Promise<PartnerWalletMutationResult> {
  const adminUserId = input.adminUserId.trim();
  const partnerId = input.partnerId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const reason = input.reason.trim();
  const internalReference = input.internalReference?.trim() || null;
  const amountCents = input.amountCents;

  if (!adminUserId || adminUserId.length > 64) {
    throw new PartnerWalletDebitError("FORBIDDEN", "Not authorized.");
  }
  if (!partnerId || partnerId.length > 64) {
    throw new PartnerWalletDebitError(
      "PARTNER_UNAVAILABLE",
      "Partner is unavailable."
    );
  }
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(idempotencyKey)
  ) {
    throw new PartnerWalletDebitError(
      "INVALID_IDEMPOTENCY",
      "This debit request could not be processed. Please reload and try again."
    );
  }
  if (
    !Number.isInteger(amountCents) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < PARTNER_ADMIN_DEBIT_MIN_CENTS ||
    amountCents > PARTNER_ADMIN_DEBIT_MAX_CENTS
  ) {
    throw new PartnerWalletDebitError(
      "INVALID_AMOUNT",
      "Enter a valid USD amount."
    );
  }

  const prior = await loadExistingDebitResult(idempotencyKey, partnerId);
  if (prior) return prior;

  try {
    for (let attempt = 0; attempt < PARTNER_WALLET_CAS_MAX_ATTEMPTS; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const existingTx = await tx.partnerWalletTransaction.findUnique({
            where: { idempotencyKey },
            select: {
              id: true,
              amountCents: true,
              balanceAfterCents: true,
              type: true,
              wallet: {
                select: { partnerId: true, balanceCents: true },
              },
            },
          });

          if (existingTx) {
            if (
              existingTx.wallet.partnerId !== partnerId ||
              existingTx.type !== PartnerWalletTransactionType.ADMIN_DEBIT
            ) {
              throw new PartnerWalletDebitError(
                "INVALID_IDEMPOTENCY",
                "This debit request could not be processed. Please reload and try again."
              );
            }
            return {
              duplicate: true,
              partnerId,
              transactionId: existingTx.id,
              amountCents: existingTx.amountCents,
              amountLabel: formatUsdCents(existingTx.amountCents),
              balanceCents: existingTx.balanceAfterCents,
              balanceLabel: formatUsdCents(existingTx.balanceAfterCents),
              currency: "USD" as const,
            };
          }

          const admin = await tx.user.findUnique({
            where: { id: adminUserId },
            select: {
              id: true,
              role: true,
              deletedAt: true,
              adminDisabledAt: true,
            },
          });
          if (
            !admin ||
            admin.deletedAt ||
            admin.role !== Role.ADMIN ||
            admin.adminDisabledAt
          ) {
            throw new PartnerWalletDebitError("FORBIDDEN", "Not authorized.");
          }

          const profile = await loadPartnerProfileForMutation(tx, partnerId);
          if (
            !profile ||
            profile.disabledAt ||
            !profile.user ||
            profile.user.deletedAt ||
            profile.user.role !== Role.PARTNER
          ) {
            throw new PartnerWalletDebitError(
              "PARTNER_UNAVAILABLE",
              "Partner is unavailable."
            );
          }

          const wallet = profile.walletAccount;
          if (!wallet) {
            throw new PartnerWalletDebitError(
              "WALLET_UNAVAILABLE",
              "No wallet funds are available to deduct."
            );
          }

          if (wallet.balanceCents < PARTNER_ADMIN_DEBIT_MIN_CENTS) {
            throw new PartnerWalletDebitError(
              "INSUFFICIENT_FUNDS",
              "No wallet funds are available to deduct."
            );
          }

          if (wallet.balanceCents < amountCents) {
            throw new PartnerWalletDebitError(
              "INSUFFICIENT_FUNDS",
              "Debit amount cannot exceed the available wallet balance."
            );
          }

          const balanceBeforeCents = wallet.balanceCents;
          const balanceAfterCents = balanceBeforeCents - amountCents;
          if (!Number.isSafeInteger(balanceAfterCents) || balanceAfterCents < 0) {
            throw new PartnerWalletDebitError(
              "INSUFFICIENT_FUNDS",
              "Debit amount cannot exceed the available wallet balance."
            );
          }

          // Strict version + balance CAS — concurrent mutations cannot overdraw or lost-update.
          const cas = await tx.partnerWalletAccount.updateMany({
            where: {
              id: wallet.id,
              version: wallet.version,
              balanceCents: { gte: amountCents },
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
            if (!fresh || fresh.balanceCents < amountCents) {
              throw new PartnerWalletDebitError(
                "INSUFFICIENT_FUNDS",
                "Debit amount cannot exceed the available wallet balance."
              );
            }
            throw new PartnerWalletCasConflictError();
          }

          const transaction = await tx.partnerWalletTransaction.create({
            data: {
              partnerWalletAccountId: wallet.id,
              type: PartnerWalletTransactionType.ADMIN_DEBIT,
              amountCents,
              balanceBeforeCents,
              balanceAfterCents,
              reason,
              referenceType: PARTNER_ADMIN_DEBIT_REFERENCE_TYPE,
              referenceId: internalReference,
              createdByAdminId: admin.id,
              idempotencyKey,
            },
            select: { id: true, amountCents: true },
          });

          const metadata: Prisma.InputJsonValue = {
            method: "partner_admin_debit",
            amountCents,
            currency: "USD",
            reason,
            ...(internalReference ? { internalReference } : {}),
            partnerId: profile.id,
            partnerUserId: profile.user.id,
            partnerWalletTransactionId: transaction.id,
          };

          await tx.auditLog.create({
            data: {
              actorUserId: admin.id,
              action: PARTNER_CREDIT_DEDUCTED_AUDIT,
              targetType: "PartnerWalletTransaction",
              targetId: transaction.id,
              metadata,
            },
          });

          return {
            duplicate: false,
            partnerId: profile.id,
            transactionId: transaction.id,
            amountCents: transaction.amountCents,
            amountLabel: formatUsdCents(transaction.amountCents),
            balanceCents: balanceAfterCents,
            balanceLabel: formatUsdCents(balanceAfterCents),
            currency: "USD" as const,
          };
        });
      } catch (error) {
        if (
          isPartnerWalletCasConflict(error) &&
          attempt < PARTNER_WALLET_CAS_MAX_ATTEMPTS - 1
        ) {
          continue;
        }
        if (isPartnerWalletCasConflict(error)) {
          throw new PartnerWalletDebitError(
            "UNAVAILABLE",
            "Partner wallet debit is temporarily unavailable. Please try again shortly."
          );
        }
        throw error;
      }
    }

    throw new PartnerWalletDebitError(
      "UNAVAILABLE",
      "Partner wallet debit is temporarily unavailable. Please try again shortly."
    );
  } catch (error) {
    if (error instanceof PartnerWalletDebitError) throw error;

    if (isUniqueViolation(error)) {
      const recovered = await loadExistingDebitResult(
        idempotencyKey,
        partnerId
      );
      if (recovered) return recovered;
    }

    throw new PartnerWalletDebitError(
      "UNAVAILABLE",
      "Partner wallet debit is temporarily unavailable. Please try again shortly."
    );
  }
}
