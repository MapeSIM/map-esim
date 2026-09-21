/**
 * Pure audit-log admin query helpers — safe for offline QA.
 * No Prisma, no mutations, no secrets.
 */

import {
  ADMIN_AUDIT_LOG_LIMIT,
  ADMIN_SEARCH_MAX_LENGTH,
  normalizeAdminSearchQuery,
  parseAdminOrdersPage,
} from "@/app/lib/admin/display";

export const ADMIN_AUDIT_LOGS_PAGE_SIZE = ADMIN_AUDIT_LOG_LIMIT;

export const ADMIN_AUDIT_ACTOR_FILTERS = [
  "all",
  "admin",
  "customer",
  "system",
] as const;

export type AdminAuditActorFilter = (typeof ADMIN_AUDIT_ACTOR_FILTERS)[number];

export function parseAdminAuditActorFilter(
  raw: string | null | undefined
): AdminAuditActorFilter {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "admin" || v === "customer" || v === "system") return v;
  return "all";
}

export function adminAuditActorFilterLabel(
  filter: AdminAuditActorFilter
): string {
  switch (filter) {
    case "admin":
      return "Admin";
    case "customer":
      return "Customer";
    case "system":
      return "System / unknown";
    default:
      return "All actors";
  }
}

export function parseAdminAuditLogsPage(
  raw: string | null | undefined
): number {
  return parseAdminOrdersPage(raw);
}

export function normalizeAdminAuditSearchQuery(
  raw: string | null | undefined
): string {
  return normalizeAdminSearchQuery(raw).slice(0, ADMIN_SEARCH_MAX_LENGTH);
}

export function buildAdminAuditLogsHref(options: {
  q?: string;
  actor?: AdminAuditActorFilter | string | null;
  page?: number;
}): string {
  const params = new URLSearchParams();
  const q = normalizeAdminAuditSearchQuery(options.q);
  const actor = parseAdminAuditActorFilter(options.actor);
  const page = Math.max(1, Math.floor(options.page ?? 1));
  if (q) params.set("q", q);
  if (actor !== "all") params.set("actor", actor);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/audit-logs?${qs}` : "/admin/audit-logs";
}
