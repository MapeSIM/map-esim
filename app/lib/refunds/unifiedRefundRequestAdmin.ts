/**
 * Merge customer + Partner refund requests into one Admin queue.
 */
import "server-only";

import { RefundRequestStatus } from "@prisma/client";
import { listAdminPartnerRefundRequests } from "@/app/lib/partner/partnerRefundRequestAdmin";
import { listAdminRefundRequests } from "@/app/lib/refunds/refundRequestAdmin";
import {
  type UnifiedRefundSource,
  type UnifiedRefundSourceFilter,
} from "@/app/lib/refunds/unifiedRefundRequestDisplay";

export type UnifiedAdminRefundRequestRow = {
  source: UnifiedRefundSource;
  id: string;
  href: string;
  status: RefundRequestStatus;
  statusLabel: string;
  reasonLabel: string;
  createdAt: Date;
  createdAtLabel: string;
  actorLabel: string;
  actorEmail: string | null;
  destinationLabel: string | null;
  planLabel: string | null;
  orderRefLabel: string;
  amountLabel: string;
  debitLabel: string | null;
  retailLabel: string | null;
};

export async function listAdminUnifiedRefundRequests(options?: {
  source?: UnifiedRefundSourceFilter;
  limit?: number;
}): Promise<UnifiedAdminRefundRequestRow[]> {
  const source = options?.source ?? "all";
  const take = Math.min(Math.max(1, options?.limit ?? 50), 100);

  const [customerRows, partnerRows] = await Promise.all([
    source === "partner" ? Promise.resolve([]) : listAdminRefundRequests(take),
    source === "customer"
      ? Promise.resolve([])
      : listAdminPartnerRefundRequests(take),
  ]);

  const unified: UnifiedAdminRefundRequestRow[] = [
    ...customerRows.map((row) => ({
      source: "customer" as const,
      id: row.id,
      href: `/admin/refund-requests/${encodeURIComponent(row.id)}`,
      status: row.status,
      statusLabel: row.statusLabel,
      reasonLabel: row.reasonLabel,
      createdAt: row.createdAt,
      createdAtLabel: row.createdAtLabel,
      actorLabel: row.customerLabel,
      actorEmail: null,
      destinationLabel: null,
      planLabel: null,
      orderRefLabel: row.orderReference,
      amountLabel: row.amountLabel,
      debitLabel: null,
      retailLabel: null,
    })),
    ...partnerRows.map((row) => ({
      source: "partner" as const,
      id: row.id,
      href: row.href,
      status: row.status,
      statusLabel: row.statusLabel,
      reasonLabel: row.reasonLabel,
      createdAt: row.createdAt,
      createdAtLabel: row.createdAtLabel,
      actorLabel: row.partnerLabel,
      actorEmail: row.partnerEmail,
      destinationLabel: row.destinationLabel,
      planLabel: row.planLabel,
      orderRefLabel: row.orderRefLabel,
      amountLabel: row.debitLabel,
      debitLabel: row.debitLabel,
      retailLabel: row.retailLabel,
    })),
  ];

  unified.sort((a, b) => {
    const byTime = b.createdAt.getTime() - a.createdAt.getTime();
    if (byTime !== 0) return byTime;
    return b.id.localeCompare(a.id);
  });

  return unified.slice(0, take);
}
