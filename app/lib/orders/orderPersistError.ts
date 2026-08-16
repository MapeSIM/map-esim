/**
 * Safe classification of local Order persist failures.
 * Never returns exception messages, SQL, connection strings, or install secrets.
 */

import { Prisma } from "@prisma/client";

export const ORDER_PERSIST_ERROR_CODES = [
  "prisma_p2002_unique_conflict",
  "prisma_p2003_fk_conflict",
  "prisma_p2025_missing_record",
  "transaction_conflict",
  "order_persist_unknown",
] as const;

export type OrderPersistErrorCode = (typeof ORDER_PERSIST_ERROR_CODES)[number];

export type OrderPersistErrorClassification = {
  persistErrorCode: OrderPersistErrorCode;
  family: "prisma" | "transaction" | "unknown";
  prismaCode: string | null;
  targetEntity: "Order";
};

function prismaKnownCode(error: unknown): string | null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  const record =
    error && typeof error === "object"
      ? (error as { code?: unknown; name?: unknown })
      : null;
  if (record && typeof record.code === "string" && /^P\d{4}$/.test(record.code)) {
    return record.code;
  }
  return null;
}

/**
 * Map a persist exception to a normalized diagnostic code.
 * Callers must persist/audit only this result — never error.message.
 */
export function classifyOrderPersistError(
  error: unknown
): OrderPersistErrorClassification {
  const prismaCode = prismaKnownCode(error);
  if (prismaCode === "P2002") {
    return {
      persistErrorCode: "prisma_p2002_unique_conflict",
      family: "prisma",
      prismaCode,
      targetEntity: "Order",
    };
  }
  if (prismaCode === "P2003") {
    return {
      persistErrorCode: "prisma_p2003_fk_conflict",
      family: "prisma",
      prismaCode,
      targetEntity: "Order",
    };
  }
  if (prismaCode === "P2025") {
    return {
      persistErrorCode: "prisma_p2025_missing_record",
      family: "prisma",
      prismaCode,
      targetEntity: "Order",
    };
  }
  if (prismaCode === "P2034") {
    return {
      persistErrorCode: "transaction_conflict",
      family: "transaction",
      prismaCode,
      targetEntity: "Order",
    };
  }
  return {
    persistErrorCode: "order_persist_unknown",
    family: "unknown",
    prismaCode: null,
    targetEntity: "Order",
  };
}

export function isSafeOrderPersistErrorCode(
  value: string | null | undefined
): value is OrderPersistErrorCode {
  return (
    typeof value === "string" &&
    (ORDER_PERSIST_ERROR_CODES as readonly string[]).includes(value)
  );
}
