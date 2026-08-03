import "server-only";

import {
  ADMIN_AUDIT_LOG_LIMIT,
  formatSafeAuditDetails,
} from "@/app/lib/admin/display";
import { prisma } from "@/app/lib/db";

export type AdminAuditLogRow = {
  createdAtLabel: string;
  action: string;
  targetType: string;
  actorCategory: string;
  resultLabel: string;
  safeDetails: string;
};

export { ADMIN_AUDIT_LOG_LIMIT, formatSafeAuditDetails };

function formatCreatedAt(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

function actorCategory(
  role: string | null | undefined,
  hasActor: boolean
): string {
  if (!hasActor) return "System / unknown";
  if (role === "ADMIN") return "Admin";
  if (role === "CUSTOMER") return "Customer";
  return "User";
}

function resultFromAction(action: string): string {
  if (!action) return "Recorded";
  if (action.includes("failed") || action.includes("denied")) {
    return "Denied / failed";
  }
  if (action.includes("deleted")) return "Completed";
  if (
    action.includes("completed") ||
    action.includes("accepted") ||
    action.includes("verified")
  ) {
    return "Completed";
  }
  if (action.includes("requested") || action.includes("pending")) {
    return "Requested";
  }
  return "Recorded";
}

/**
 * Latest audit events for admin UI. Call only after requireRole("ADMIN").
 */
export async function getAdminAuditLogs(
  limit = ADMIN_AUDIT_LOG_LIMIT
): Promise<AdminAuditLogRow[]> {
  const take = Math.min(Math.max(1, limit), ADMIN_AUDIT_LOG_LIMIT);

  const rows = await prisma.auditLog.findMany({
    take,
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      action: true,
      targetType: true,
      metadata: true,
      actor: {
        select: { role: true },
      },
    },
  });

  return rows.map((row) => ({
    createdAtLabel: formatCreatedAt(row.createdAt),
    action: row.action || "unknown",
    targetType: row.targetType || "—",
    actorCategory: actorCategory(row.actor?.role, Boolean(row.actor)),
    resultLabel: resultFromAction(row.action),
    safeDetails: formatSafeAuditDetails(row.metadata),
  }));
}
