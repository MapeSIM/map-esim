/**
 * Pure helpers for Home Screen eSIM usage widget (offline-QA safe).
 * No server-only imports — safe for client components.
 */

export const HOME_ESIM_USAGE_STORAGE_KEY = "mapesim.homeEsimUsage.v1";

export type HomeEsimUsageStoredLookup = {
  /** Order ID or ICCID digits entered / auto-saved after guest checkout. */
  query: string;
  savedAt: string;
};

export type HomeEsimUsageStatusBadge =
  | "Active"
  | "Ready to Install"
  | "Expired"
  | "Depleted"
  | "Unknown";

/** Sanitized usage card returned by home usage APIs (never includes ICCID). */
export type HomeEsimUsageCard = {
  orderId: string | null;
  destination: string;
  planName: string;
  flagUrl: string | null;
  destinationHref: string;
  statusBadge: HomeEsimUsageStatusBadge;
  statusLabel: string;
  remainingDataGB: number | null;
  initialDataGB: number | null;
  usedDataGB: number | null;
  isUnlimited: boolean;
  reportsDataAllowance: boolean;
  daysRemaining: number | null;
  expiresAt: string | null;
  isActivated: boolean | null;
  isExpired: boolean | null;
  detailHref: string | null;
  topUpHref: string;
  lastUpdatedAt: string;
};

/** Classify Order ID vs ICCID from a single lookup field. */
export function classifyHomeUsageQuery(raw: string): {
  kind: "iccid" | "orderId" | "invalid";
  value: string;
} {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || trimmed.length > 64) {
    return { kind: "invalid", value: "" };
  }
  const digits = trimmed.replace(/\D+/g, "");
  if (/^\d{18,22}$/.test(digits)) {
    return { kind: "iccid", value: digits };
  }
  if (/^[A-Za-z0-9_-]{6,64}$/.test(trimmed)) {
    return { kind: "orderId", value: trimmed };
  }
  return { kind: "invalid", value: "" };
}

export function homeUsageStatusBadge(input: {
  lifecycleStatus?: string | null;
  statusLabel?: string | null;
  isActivated?: boolean | null;
  isExpired?: boolean | null;
}): HomeEsimUsageStatusBadge {
  const lifecycle = (input.lifecycleStatus ?? "").trim().toUpperCase();
  if (lifecycle === "ACTIVE") return "Active";
  if (lifecycle === "EXPIRED") return "Expired";
  if (lifecycle === "DEPLETED") return "Depleted";
  if (lifecycle === "NOT_ACTIVE") return "Ready to Install";
  if (lifecycle === "CANCELLED") return "Expired";

  if (input.isExpired === true) return "Expired";
  if (input.isActivated === true) return "Active";
  if (input.isActivated === false) return "Ready to Install";

  const blob = `${input.statusLabel ?? ""}`.toLowerCase();
  if (/expir/.test(blob)) return "Expired";
  if (/deplet|exhausted|no data/.test(blob)) return "Depleted";
  if (/active|in use|enabled/.test(blob)) return "Active";
  if (/ready|not active|inactive|pending|install/.test(blob)) {
    return "Ready to Install";
  }
  return "Unknown";
}

/** Remaining fraction of plan (0–1). Null when unknown / unlimited. */
export function homeUsageRemainingRatio(
  remainingDataGB: number | null | undefined,
  initialDataGB: number | null | undefined
): number | null {
  if (
    remainingDataGB == null ||
    initialDataGB == null ||
    !Number.isFinite(remainingDataGB) ||
    !Number.isFinite(initialDataGB) ||
    initialDataGB <= 0
  ) {
    return null;
  }
  return Math.min(1, Math.max(0, remainingDataGB / initialDataGB));
}

/** Emerald when remaining > 20% of total; amber at or below 20%. */
export function homeUsageBarTone(
  remainingRatio: number | null
): "emerald" | "amber" | "neutral" {
  if (remainingRatio == null) return "neutral";
  return remainingRatio > 0.2 ? "emerald" : "amber";
}

export function formatHomeUsageGb(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Number.isInteger(value)) return `${value} GB`;
  return `${value.toFixed(1)} GB`;
}

export function formatHomeUsageExpiryCountdown(input: {
  daysRemaining?: number | null;
  expiresAtIso?: string | null;
  isExpired?: boolean | null;
  nowMs?: number;
}): string | null {
  if (input.isExpired === true) return "Expired";
  if (
    typeof input.daysRemaining === "number" &&
    Number.isFinite(input.daysRemaining)
  ) {
    const days = Math.max(0, Math.floor(input.daysRemaining));
    if (days <= 0) return "Expires today";
    if (days === 1) return "Expires in 1 day";
    return `Expires in ${days} days`;
  }
  const iso = (input.expiresAtIso ?? "").trim();
  if (!iso) return null;
  const ends = Date.parse(iso);
  if (!Number.isFinite(ends)) return null;
  const now = input.nowMs ?? Date.now();
  const diffMs = ends - now;
  if (diffMs <= 0) return "Expired";
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Expires today";
  if (days === 1) return "Expires in 1 day";
  return `Expires in ${days} days`;
}

export function readHomeEsimUsageLookup(): HomeEsimUsageStoredLookup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HOME_ESIM_USAGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HomeEsimUsageStoredLookup>;
    const query = typeof parsed.query === "string" ? parsed.query.trim() : "";
    if (!query || query.length > 64) return null;
    const classified = classifyHomeUsageQuery(query);
    if (classified.kind === "invalid") return null;
    return {
      query: classified.value,
      savedAt:
        typeof parsed.savedAt === "string" && parsed.savedAt
          ? parsed.savedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeHomeEsimUsageLookup(queryRaw: string): void {
  if (typeof window === "undefined") return;
  const classified = classifyHomeUsageQuery(queryRaw);
  if (classified.kind === "invalid") return;
  try {
    const payload: HomeEsimUsageStoredLookup = {
      query: classified.value,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      HOME_ESIM_USAGE_STORAGE_KEY,
      JSON.stringify(payload)
    );
  } catch {
    // Quota / private mode — ignore.
  }
}

export function clearHomeEsimUsageLookup(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HOME_ESIM_USAGE_STORAGE_KEY);
  } catch {
    // ignore
  }
}
