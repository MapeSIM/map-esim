/**
 * Pure eSIM lifecycle notification helpers (offline-safe).
 * Never invents expiry or remaining data — callers must pass provider/local usage.
 *
 * Delivery enables expiry (24h / expired) plus usage alerts:
 * LOW_DATA (≤20% remaining ≈ 80% used) and DATA_EXHAUSTED (0 GB).
 */

export const ESIM_LIFECYCLE_KINDS = [
  "EXPIRY_SOON_24H",
  "EXPIRED",
  "LOW_DATA",
  "DATA_EXHAUSTED",
] as const;

export type EsimLifecycleKind = (typeof ESIM_LIFECYCLE_KINDS)[number];

/**
 * Send allowlist — expiry + data depletion / low-data alerts.
 */
export const ESIM_LIFECYCLE_V1_ENABLED_KINDS = [
  "EXPIRY_SOON_24H",
  "EXPIRED",
  "LOW_DATA",
  "DATA_EXHAUSTED",
] as const satisfies readonly EsimLifecycleKind[];

/**
 * Highest-first precedence when multiple kinds are due in one pass.
 * Runner may deliver each enabled due kind once (unique eventKey).
 */
export const ESIM_LIFECYCLE_DELIVERY_PRECEDENCE: readonly EsimLifecycleKind[] = [
  "EXPIRED",
  "EXPIRY_SOON_24H",
  "DATA_EXHAUSTED",
  "LOW_DATA",
] as const;

/** Hours-before-expiry window for the single pre-expiry notice. */
export const ESIM_LIFECYCLE_EXPIRY_SOON_HOURS = 24;

/**
 * Remaining-data threshold (percent of initial) for LOW_DATA.
 * ≤20% remaining ≈ ≥80% consumed.
 */
export const ESIM_LIFECYCLE_LOW_DATA_REMAINING_PERCENT = 20;

export const ESIM_LIFECYCLE_CLAIM_TTL_MS = 5 * 60 * 1000;
/** Runner lock TTL / stale threshold — reclaim after 5 minutes if prior run crashed. */
export const ESIM_LIFECYCLE_RUNNER_LOCK_TTL_MS = 5 * 60 * 1000;
export const ESIM_LIFECYCLE_BATCH_SIZE = 5;

/** Fetch a wider pool, then prioritize urgent rows before taking BATCH_SIZE. */
export const ESIM_LIFECYCLE_CANDIDATE_POOL_MULTIPLIER = 4;

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
 * Authoritative expired check for Add More Data / lifecycle.
 * True when provider says isExpired, or expiresAt/endAt is parseable and <= now.
 * Never uses Order.validity text or daysRemaining alone.
 */
export function isProviderUsageExpired(
  usage: Pick<EsimLifecycleUsageInput, "expiresAt" | "isExpired">,
  nowMs: number = Date.now()
): boolean {
  if (!Number.isFinite(nowMs)) return false;
  if (usage.isExpired === true) return true;
  const expiresMs = parseProviderInstantMs(usage.expiresAt);
  return expiresMs != null && expiresMs <= nowMs;
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

  if (isProviderUsageExpired(usage, nowMs)) {
    return ["EXPIRED"];
  }

  const expiresMs = parseProviderInstantMs(usage.expiresAt);

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
 * Remaining-data candidates from provider GB fields only.
 * Exhausted (0 GB) takes precedence over low-data within the data family.
 * LOW_DATA when remaining ≤ 20% of initial (≈ 80% used).
 */
export function evaluateEsimLifecycleDataEvents(
  usage: EsimLifecycleUsageInput
): EsimLifecycleKind[] {
  if (usage.isUnlimited || !usage.reportsDataAllowance) {
    return [];
  }

  if (
    typeof usage.remainingDataGB === "number" &&
    Number.isFinite(usage.remainingDataGB) &&
    usage.remainingDataGB <= 0
  ) {
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
 * Apply allowlist + precedence ordering for due kinds.
 * Returns every enabled due kind (highest precedence first).
 */
export function selectEsimLifecycleEventsForDelivery(
  candidates: readonly EsimLifecycleKind[],
  enabledKinds: readonly EsimLifecycleKind[] = ESIM_LIFECYCLE_V1_ENABLED_KINDS
): EsimLifecycleKind[] {
  const enabled = new Set<EsimLifecycleKind>(enabledKinds);
  const present = new Set(
    candidates.filter((kind) => enabled.has(kind))
  );
  const selected: EsimLifecycleKind[] = [];
  for (const kind of ESIM_LIFECYCLE_DELIVERY_PRECEDENCE) {
    if (present.has(kind)) {
      selected.push(kind);
    }
  }
  return selected;
}

/**
 * Runner / on-demand entry: expiry + data evaluation, then allowlist filter.
 */
export function evaluateEsimLifecycleEvents(
  usage: EsimLifecycleUsageInput,
  nowMs: number = Date.now()
): EsimLifecycleKind[] {
  return selectEsimLifecycleEventsForDelivery(
    [
      ...evaluateEsimLifecycleExpiryEvents(usage, nowMs),
      ...evaluateEsimLifecycleDataEvents(usage),
    ],
    ESIM_LIFECYCLE_V1_ENABLED_KINDS
  );
}

/**
 * Higher score = poll sooner. Uses cached provider fields when present;
 * never invents expiry from catalog duration.
 */
export function scoreEsimLifecycleCandidatePriority(input: {
  nowMs: number;
  providerExpiresAtMs: number | null;
  providerLifecycleStatus: string | null;
  remainingDataGB: number | null;
  initialDataGB: number | null;
  lifecycleUsageCheckedAtMs: number | null;
}): number {
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  let score = 0;
  const status = (input.providerLifecycleStatus ?? "").trim().toUpperCase();

  if (status === "EXPIRED") score += 400;
  if (status === "DEPLETED") score += 350;

  const expiresMs = input.providerExpiresAtMs;
  if (typeof expiresMs === "number" && Number.isFinite(expiresMs)) {
    if (expiresMs <= nowMs) {
      score += 400;
    } else {
      const hoursLeft = (expiresMs - nowMs) / 3_600_000;
      if (hoursLeft <= ESIM_LIFECYCLE_EXPIRY_SOON_HOURS) {
        score += 300;
      }
    }
  }

  const rem = input.remainingDataGB;
  const initial = input.initialDataGB;
  if (typeof rem === "number" && Number.isFinite(rem)) {
    if (rem <= 0) {
      score += 350;
    } else if (
      typeof initial === "number" &&
      Number.isFinite(initial) &&
      initial > 0 &&
      (rem / initial) * 100 <= ESIM_LIFECYCLE_LOW_DATA_REMAINING_PERCENT
    ) {
      score += 250;
    }
  }

  // Never-checked and stale checks get a small fairness boost.
  if (input.lifecycleUsageCheckedAtMs == null) {
    score += 40;
  } else if (Number.isFinite(input.lifecycleUsageCheckedAtMs)) {
    const ageHours =
      (nowMs - input.lifecycleUsageCheckedAtMs) / 3_600_000;
    if (ageHours >= 24) score += 20;
  }

  return score;
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
