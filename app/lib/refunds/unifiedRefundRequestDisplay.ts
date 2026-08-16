/**
 * Pure unified Admin refund-queue helpers (offline-safe QA).
 */

export type UnifiedRefundSource = "customer" | "partner";
export type UnifiedRefundSourceFilter = "all" | UnifiedRefundSource;

export function parseUnifiedRefundSource(
  raw: unknown
): UnifiedRefundSourceFilter {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "customer" || value === "partner") return value;
  return "all";
}

export function unifiedRefundSourceLabel(source: UnifiedRefundSource): string {
  return source === "partner" ? "Partner" : "Customer";
}
