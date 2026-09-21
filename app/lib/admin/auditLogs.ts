/**
 * Read-only admin audit log queries. Local DB only — never mutates AuditLog.
 */
import "server-only";

import { Prisma } from "@prisma/client";
import {
  ADMIN_AUDIT_LOG_LIMIT,
  formatSafeAuditDetails,
} from "@/app/lib/admin/display";
import { prisma } from "@/app/lib/db";
import {
  ADMIN_AUDIT_LOGS_PAGE_SIZE,
  adminAuditActorFilterLabel,
  buildAdminAuditLogsHref,
  normalizeAdminAuditSearchQuery,
  parseAdminAuditActorFilter,
  parseAdminAuditLogsPage,
  type AdminAuditActorFilter,
} from "@/app/lib/admin/auditLogsShared";
import { requireAdminPermission } from "@/app/lib/admin/adminPermissionAccess";

export type AdminAuditLogRow = {
  createdAtLabel: string;
  action: string;
  targetType: string;
  actorCategory: string;
  resultLabel: string;
  safeDetails: string;
};

export type AdminAuditLogsPageResult = {
  rows: AdminAuditLogRow[];
  search: string;
  actor: AdminAuditActorFilter;
  actorLabel: string;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export {
  ADMIN_AUDIT_LOG_LIMIT,
  ADMIN_AUDIT_LOGS_PAGE_SIZE,
  formatSafeAuditDetails,
  buildAdminAuditLogsHref,
};

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

function buildAuditWhere(options: {
  search: string;
  actor: AdminAuditActorFilter;
}): Prisma.AuditLogWhereInput {
  const parts: Prisma.AuditLogWhereInput[] = [];

  if (options.search) {
    const q = options.search;
    parts.push({
      OR: [
        { id: q },
        { action: { contains: q, mode: "insensitive" } },
        { targetType: { contains: q, mode: "insensitive" } },
        { targetId: q },
      ],
    });
  }

  if (options.actor === "admin") {
    parts.push({ actor: { role: "ADMIN" } });
  } else if (options.actor === "customer") {
    parts.push({ actor: { role: "CUSTOMER" } });
  } else if (options.actor === "system") {
    parts.push({ actorUserId: null });
  }

  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0]!;
  return { AND: parts };
}

export async function requireActiveAdminForAuditLogs() {
  return requireAdminPermission("AUDIT_LOGS");
}

/**
 * Paginated, filterable audit events for admin UI.
 * Call only after requireActiveAdminForAuditLogs / requireRole("ADMIN").
 * Read-only: findMany + count only — never update/delete/clear.
 */
export async function getAdminAuditLogsPage(options: {
  q?: string | null;
  actor?: string | null;
  page?: string | null;
} = {}): Promise<AdminAuditLogsPageResult> {
  const search = normalizeAdminAuditSearchQuery(options.q);
  const actor = parseAdminAuditActorFilter(options.actor);
  const pageSize = ADMIN_AUDIT_LOGS_PAGE_SIZE;
  let page = parseAdminAuditLogsPage(options.page);
  const where = buildAuditWhere({ search, actor });

  const totalCount = await prisma.auditLog.count({ where });
  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);
  if (page > totalPages) page = totalPages;

  const rowsRaw = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize,
    skip: (page - 1) * pageSize,
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

  const rows: AdminAuditLogRow[] = rowsRaw.map((row) => ({
    createdAtLabel: formatCreatedAt(row.createdAt),
    action: row.action || "unknown",
    targetType: row.targetType || "—",
    actorCategory: actorCategory(row.actor?.role, Boolean(row.actor)),
    resultLabel: resultFromAction(row.action),
    safeDetails: formatSafeAuditDetails(row.metadata),
  }));

  return {
    rows,
    search,
    actor,
    actorLabel: adminAuditActorFilterLabel(actor),
    page,
    pageSize,
    totalCount,
    totalPages,
  };
}

/**
 * Latest audit events (first page, no filters). Prefer getAdminAuditLogsPage.
 */
export async function getAdminAuditLogs(
  limit = ADMIN_AUDIT_LOG_LIMIT
): Promise<AdminAuditLogRow[]> {
  const take = Math.min(Math.max(1, limit), ADMIN_AUDIT_LOG_LIMIT);
  const page = await getAdminAuditLogsPage({ page: "1" });
  return page.rows.slice(0, take);
}
