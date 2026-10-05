/**
 * Pure VeSIM lifecycle display helpers (offline-QA safe).
 * Canonical statuses are cached on Order after usage fetch.
 */

export const PROVIDER_LIFECYCLE_STATUSES = [
  "NOT_ACTIVE",
  "ACTIVE",
  "EXPIRED",
  "DEPLETED",
  "UNKNOWN",
] as const;

export type ProviderLifecycleStatus =
  (typeof PROVIDER_LIFECYCLE_STATUSES)[number];

export type ProviderLifecycleCacheView = {
  lifecycleStatus: ProviderLifecycleStatus | null;
  lifecycleLabel: string | null;
  remainingDataGb: number | null;
  usedDataGb: number | null;
  initialDataGb: number | null;
  usagePercent: number | null;
  activatedAtLabel: string | null;
  expiresAtLabel: string | null;
  syncedAtLabel: string | null;
  /** Raw ISO/instant for relative day math — never invents expiry. */
  activatedAtIso: string | null;
  expiresAtIso: string | null;
};

export function isProviderLifecycleStatus(
  value: unknown
): value is ProviderLifecycleStatus {
  return (
    typeof value === "string" &&
    (PROVIDER_LIFECYCLE_STATUSES as readonly string[]).includes(value)
  );
}

/** Map live usage snapshot fields → canonical lifecycle status. */
export function classifyProviderLifecycleStatus(input: {
  status?: string | null;
  statusLabel?: string | null;
  isActivated?: boolean | null;
  isExpired?: boolean | null;
  remainingDataGB?: number | null;
  isUnlimited?: boolean;
}): ProviderLifecycleStatus {
  const blob = `${input.statusLabel ?? ""} ${input.status ?? ""}`.trim();
  if (input.isExpired === true || /expir/i.test(blob)) {
    return "EXPIRED";
  }
  if (
    /deplet|exhausted|no[_ ]?data|empty/i.test(blob) ||
    (typeof input.remainingDataGB === "number" &&
      Number.isFinite(input.remainingDataGB) &&
      input.remainingDataGB <= 0 &&
      input.isUnlimited !== true)
  ) {
    return "DEPLETED";
  }
  if (
    input.isActivated === true ||
    /\b(active|in[_ ]?use|enabled)\b/i.test(blob)
  ) {
    return "ACTIVE";
  }
  if (
    input.isActivated === false ||
    /not[_ ]?active|inactive|pending|ready|installed|released/i.test(blob)
  ) {
    return "NOT_ACTIVE";
  }
  return "UNKNOWN";
}

export function providerLifecycleLabel(
  status: ProviderLifecycleStatus | null | undefined
): string | null {
  switch (status) {
    case "NOT_ACTIVE":
      return "Not Active";
    case "ACTIVE":
      return "Active";
    case "EXPIRED":
      return "Expired";
    case "DEPLETED":
      return "Depleted";
    default:
      return null;
  }
}

export function formatLifecycleGb(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (Number.isInteger(value)) return `${value} GB left`;
  return `${value.toFixed(2)} GB left`;
}

export function formatLifecycleSyncedAt(
  value: Date | string | null | undefined
): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return (
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(d) + " UTC"
  );
}

function toIsoInstant(
  value: Date | string | null | undefined
): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function toProviderLifecycleCacheView(input: {
  providerLifecycleStatus?: string | null;
  providerRemainingDataGb?: number | null;
  providerUsedDataGb?: number | null;
  providerInitialDataGb?: number | null;
  providerUsagePercent?: number | null;
  providerActivatedAt?: Date | string | null;
  providerExpiresAt?: Date | string | null;
  providerUsageSyncedAt?: Date | string | null;
}): ProviderLifecycleCacheView {
  const lifecycleStatus = isProviderLifecycleStatus(input.providerLifecycleStatus)
    ? input.providerLifecycleStatus
    : null;
  const activatedAtIso = toIsoInstant(input.providerActivatedAt ?? null);
  const expiresAtIso = toIsoInstant(input.providerExpiresAt ?? null);
  return {
    lifecycleStatus,
    lifecycleLabel: providerLifecycleLabel(lifecycleStatus),
    remainingDataGb:
      typeof input.providerRemainingDataGb === "number" &&
      Number.isFinite(input.providerRemainingDataGb)
        ? input.providerRemainingDataGb
        : null,
    usedDataGb:
      typeof input.providerUsedDataGb === "number" &&
      Number.isFinite(input.providerUsedDataGb)
        ? input.providerUsedDataGb
        : null,
    initialDataGb:
      typeof input.providerInitialDataGb === "number" &&
      Number.isFinite(input.providerInitialDataGb)
        ? input.providerInitialDataGb
        : null,
    usagePercent:
      typeof input.providerUsagePercent === "number" &&
      Number.isFinite(input.providerUsagePercent)
        ? input.providerUsagePercent
        : null,
    activatedAtLabel: formatLifecycleSyncedAt(input.providerActivatedAt ?? null),
    expiresAtLabel: formatLifecycleSyncedAt(input.providerExpiresAt ?? null),
    syncedAtLabel: formatLifecycleSyncedAt(input.providerUsageSyncedAt ?? null),
    activatedAtIso,
    expiresAtIso,
  };
}
