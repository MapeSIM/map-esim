import { randomBytes } from "node:crypto";
import { Role } from "@prisma/client";
import { hashPassword } from "@/app/lib/auth/password";
import { prisma } from "@/app/lib/db";

/** Non-deliverable unique placeholder freeing the original email for re-registration. */
export function deletedAccountEmail(userId: string): string {
  return `deleted+${userId}@deleted.invalid`;
}

/**
 * Soft-delete / anonymize a CUSTOMER account.
 * Preserves Order rows and VeSIM provider data; unlinks userId only.
 * Never logs passwords, OTPs, or the original email.
 */
export async function softDeleteCustomerAccount(options: {
  userId: string;
}): Promise<{ ok: true } | { ok: false; reason: "not_found" | "not_customer" | "already_deleted" }> {
  const user = await prisma.user.findUnique({
    where: { id: options.userId },
    select: { id: true, role: true, deletedAt: true },
  });

  if (!user) return { ok: false, reason: "not_found" };
  if (user.deletedAt) return { ok: false, reason: "already_deleted" };
  if (user.role !== Role.CUSTOMER) {
    return { ok: false, reason: "not_customer" };
  }

  const now = new Date();
  const disabledPasswordHash = await hashPassword(
    randomBytes(32).toString("hex")
  );

  // Remote/Accelerate DBs need more than the default 5s interactive timeout.
  await prisma.$transaction(
    async (tx) => {
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.account.deleteMany({ where: { userId: user.id } });

      await tx.emailOtp.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });

      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });

      // Keep order/payment rows; drop the account link only.
      await tx.order.updateMany({
        where: { userId: user.id },
        data: { userId: null },
      });

      await tx.user.update({
        where: { id: user.id },
        data: {
          name: "Deleted User",
          email: deletedAccountEmail(user.id),
          passwordHash: disabledPasswordHash,
          emailVerifiedAt: null,
          credentialsChangedAt: now,
          deletedAt: now,
        },
      });
    },
    { maxWait: 10_000, timeout: 30_000 }
  );

  return { ok: true };
}
