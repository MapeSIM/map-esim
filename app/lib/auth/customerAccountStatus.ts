/**
 * Durable customer account status for Model 2 block/reactivate.
 * Login/sessions are NOT denied solely for blockedAt — enforce on financial mutations.
 */
import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";

/** Exact customer-facing denial for new financial activity. */
export const CUSTOMER_ACCOUNT_RESTRICTED_MESSAGE =
  "Your MAP eSIM account is currently restricted. Please contact support@mapesim.com.";

/** Admin-facing denial (never includes blockedReason). */
export const CUSTOMER_ACCOUNT_RESTRICTED_ADMIN_MESSAGE =
  "This customer account is currently restricted and cannot receive new purchases or assignments.";

export type CustomerAccountStatusLabel = "ACTIVE" | "BLOCKED" | "DELETED";

export class CustomerAccountRestrictedError extends Error {
  readonly code = "ACCOUNT_RESTRICTED" as const;
  readonly forAdmin: boolean;

  constructor(options?: { forAdmin?: boolean }) {
    super(
      options?.forAdmin
        ? CUSTOMER_ACCOUNT_RESTRICTED_ADMIN_MESSAGE
        : CUSTOMER_ACCOUNT_RESTRICTED_MESSAGE
    );
    this.name = "CustomerAccountRestrictedError";
    this.forAdmin = options?.forAdmin === true;
  }
}

export function resolveCustomerAccountStatus(input: {
  deletedAt?: Date | null;
  blockedAt?: Date | null;
}): CustomerAccountStatusLabel {
  if (input.deletedAt) return "DELETED";
  if (input.blockedAt) return "BLOCKED";
  return "ACTIVE";
}

/**
 * Query durable DB state. Denies when DELETED or BLOCKED.
 * Does not depend on JWT claims.
 */
export async function assertCustomerFinancialActivityAllowed(
  userId: string,
  options?: { forAdmin?: boolean }
): Promise<void> {
  const id = (userId ?? "").trim();
  if (!id || id.length > 64) {
    throw new CustomerAccountRestrictedError({
      forAdmin: options?.forAdmin === true,
    });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      blockedAt: true,
    },
  });

  if (!user || user.role !== Role.CUSTOMER || user.deletedAt) {
    throw new CustomerAccountRestrictedError({
      forAdmin: options?.forAdmin === true,
    });
  }

  if (user.blockedAt) {
    throw new CustomerAccountRestrictedError({
      forAdmin: options?.forAdmin === true,
    });
  }
}
