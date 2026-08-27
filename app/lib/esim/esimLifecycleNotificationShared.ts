/**
 * Pure eSIM lifecycle notification helpers (offline-safe).
 * Never invents expiry or remaining data — callers must pass provider/local usage.
 *
 * V1 delivery enables EXPIRY_SOON_24H + EXPIRED only.
 * LOW_DATA / DATA_EXHAUSTED helpers exist for a future release and must not be
 * wired into the runner until provider remaining-data semantics are proven.
 */

export const ESIM_LIFECYCLE_KINDS = [
  "EXPIRY_SOON_24H",
  "EXPIRED",
  "LOW_DATA",
  "DATA_EXHAUSTED",
] as const;

export type EsimLifecycleKind = (typeof ESIM_LIFECYCLE_KINDS)[number];

/**
 * V1 send allowlist. Data kinds stay detected only via future helpers and are
 * excluded from delivery until this set is expanded deliberately.
 */
export const ESIM_LIFECYCLE_V1_ENABLED_KINDS = [
  "EXPIRY_SOON_24H",
  "EXPIRED",
] as const satisfies readonly EsimLifecycleKind[];

/**
 * Highest-first precedence for a single delivery per order per runner pass.
 * Prevents multi-email spam if data kinds are enabled later without a policy.
 */
export const ESIM_LIFECYCLE_DELIVERY_PRECEDENCE: readonly EsimLifecycleKind[] = [
  "EXPIRED",
  "EXPIRY_SOON_24H",
  "DATA_EXHAUSTED",
  "LOW_DATA",
] as const;

/** Hours-before-expiry window for the single pre-expiry notice. */
export const ESIM_LIFECYCLE_EXPIRY_SOON_HOURS = 24;

/** Remaining-data threshold (percent of initial) for optional future low-data warning. */
export const ESIM_LIFECYCLE_LOW_DATA_REMAINING_PERCENT = 10;

export const ESIM_LIFECYCLE_CLAIM_TTL_MS = 5 * 60 * 1000;
export const ESIM_LIFECYCLE_RUNNER_LOCK_TTL_MS = 10 * 60 * 1000;
export const ESIM_LIFECYCLE_BATCH_SIZE = 40;

/**
 * Daily Vercel Hobby-compatible cron (UTC).
 * Hobby allows at most one cron run per day — keep this daily until plan upgrade
 * or an approved external hourly scheduler is introduced.
 */
export const ESIM_LIFECYCLE_CRON_SCHEDULE_DAILY_UTC = "0 6 * * *";

export type EsimLifecycleUsageInput = {
  expiresAt: string | null;
  daysRemaining: number | null;
  isExpired: boolean | null;
  isUnlimited: boolean;
  reportsDataAllowance: boolean;
  initialDataGB: number | null;
  remainingDataGB: number | null;
};

export function buildEsimLifecycleEventKey(
  orderId: string,
  kind: EsimLifecycleKind
): string {
  return `esim_lifecycle:${orderId.trim()}:${kind}`;
}

/** Parse provider ISO/instant strings only — returns null when unparseable. */
export function parseProviderInstantMs(
  raw: string | null | undefined
): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return ms;
}

/**
 * Expiry candidates from authoritative provider timestamps / flags only.
 * - Prefer expiresAt/endAt (passed as usage.expiresAt after normalize).
 * - EXPIRY_SOON only when expiresAt is > now and <= 24h away.
 * - If already expired → EXPIRED only (never also EXPIRY_SOON).
 * - Does NOT use daysRemaining (semantics not proven exact enough for V1).
 * - Does not invent end dates from catalog duration or validity labels.
 */
export function evaluateEsimLifecycleExpiryEvents(
  usage: EsimLifecycleUsageInput,
  nowMs: number = Date.now()
): EsimLifecycleKind[] {
  if (!Number.isFinite(nowMs)) return [];

  const expiresMs = parseProviderInstantMs(usage.expiresAt);
  const expiredByFlag = usage.isExpired === true;
  const expiredByTimestamp = expiresMs != null && expiresMs <= nowMs;
  const isExpired = expiredByFlag || expiredByTimestamp;

  if (isExpired) {
    return ["EXPIRED"];
  }

  if (expiresMs == null) {
    return [];
  }

  const hoursLeft = (expiresMs - nowMs) / 3_600_000;
  if (hoursLeft > 0 && hoursLeft <= ESIM_LIFECYCLE_EXPIRY_SOON_HOURS) {
    return ["EXPIRY_SOON_24H"];
  }

  return [];
}

/**
 * Future-only remaining-data candidates. Not used by V1 delivery/runner.
 * Exhausted takes precedence over low-data within the data family.
 */
export function evaluateEsimLifecycleDataEvents(
  usage: EsimLifecycleUsageInput
): EsimLifecycleKind[] {
  if (usage.isUnlimited || !usage.reportsDataAllowance) {
    return [];
  }

  if (usage.remainingDataGB === 0) {
    return ["DATA_EXHAUSTED"];
  }

  if (
    typeof usage.remainingDataGB === "number" &&
    Number.isFinite(usage.remainingDataGB) &&
    usage.remainingDataGB > 0 &&
    typeof usage.initialDataGB === "number" &&
    Number.isFinite(usage.initialDataGB) &&
    usage.initialDataGB > 0
  ) {
    const remainingPct =
      (usage.remainingDataGB / usage.initialDataGB) * 100;
    if (remainingPct <= ESIM_LIFECYCLE_LOW_DATA_REMAINING_PERCENT) {
      return ["LOW_DATA"];
    }
  }

  return [];
}

/**
 * Apply allowlist + single-event precedence for one runner pass.
 * Default allowlist is V1 (expiry only) — data kinds cannot create deliveries.
 */
export function selectEsimLifecycleEventsForDelivery(
  candidates: readonly EsimLifecycleKind[],
  enabledKinds: readonly EsimLifecycleKind[] = ESIM_LIFECYCLE_V1_ENABLED_KINDS
): EsimLifecycleKind[] {
  const enabled = new Set<EsimLifecycleKind>(enabledKinds);
  const present = new Set(
    candidates.filter((kind) => enabled.has(kind))
  );
  for (const kind of ESIM_LIFECYCLE_DELIVERY_PRECEDENCE) {
    if (present.has(kind)) {
      return [kind];
    }
  }
  return [];
}

/**
 * V1 entry point used by the runner: expiry evaluation + V1 delivery filter.
 * Does not call data-event helpers — remaining-data emails stay off.
 */
export function evaluateEsimLifecycleEvents(
  usage: EsimLifecycleUsageInput,
  nowMs: number = Date.now()
): EsimLifecycleKind[] {
  return selectEsimLifecycleEventsForDelivery(
    evaluateEsimLifecycleExpiryEvents(usage, nowMs),
    ESIM_LIFECYCLE_V1_ENABLED_KINDS
  );
}

export function formatLifecycleExpiryLabel(
  expiresAt: string | null,
  nowMs: number = Date.now()
): string | null {
  const ms = parseProviderInstantMs(expiresAt);
  if (ms == null) return null;
  const date = new Date(ms);
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);
  void nowMs;
  return label;
}

export function lifecycleSubject(kind: EsimLifecycleKind): string {
  switch (kind) {
    case "EXPIRY_SOON_24H":
      return "Your MAP eSIM plan expires in about 24 hours";
    case "EXPIRED":
      return "Your MAP eSIM plan has expired";
    case "LOW_DATA":
      return "Your MAP eSIM data is running low";
    case "DATA_EXHAUSTED":
      return "Your MAP eSIM data is used up";
    default:
      return "MAP eSIM plan update";
  }
}

export function normalizeOpaqueLifecycleErrorCode(
  raw: string | null | undefined
): string {
  const value = (raw ?? "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  if (!value) return "unknown";
  return value.slice(0, 64);
}
