/**
 * Central ACTIVE ADMIN access helpers.
 * Disabled admins keep role=ADMIN but must not retain admin access.
 */
import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { isAdminAccessDenied } from "@/app/lib/auth/adminAccessShared";

export {
  isActiveAdminForProtection,
  isAdminAccessDenied,
  resolveAdminAccountStatus,
  type AdminAccountStatusLabel,
} from "@/app/lib/auth/adminAccessShared";

/**
 * Load an admin actor that may perform admin mutations.
 * Requires role ADMIN, not deleted, not disabled.
 */
export async function findActiveAdminActor(
  adminUserId: string
): Promise<{ id: string } | null> {
  const id = (adminUserId ?? "").trim();
  if (!id || id.length > 64) return null;

  const admin = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      adminDisabledAt: true,
    },
  });

  if (!admin || isAdminAccessDenied(admin)) {
    return null;
  }

  return { id: admin.id };
}
