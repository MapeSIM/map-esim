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
/** Keep cron under external ~30s timeouts (carrier usage GETs are slow). */
export const ESIM_LIFECYCLE_BATCH_SIZE = 2;
/** Max concurrent order usage polls within a cron batch. */
export const ESIM_LIFECYCLE_PROCESS_CONCURRENCY = 3;

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

/**
 * Normalize an alert-cycle token for eventKey suffixing.
 * Empty / "0" → null (legacy unsuffixed key for backward compatibility).
 */
export function normalizeEsimLifecycleAlertCycleToken(
  raw: string | null | undefined
): string | null {
  const value = (raw ?? "").trim();
  if (!value || value === "0") return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) return null;
  return value;
}

/**
 * Deterministic outbox key.
 * - cycle 0 / omitted → `esim_lifecycle:{orderId}:{kind}` (legacy, keeps existing SENT rows)
 * - otherwise → `esim_lifecycle:{orderId}:{kind}:c{cycleToken}`
 */
export function buildEsimLifecycleEventKey(
  orderId: string,
  kind: EsimLifecycleKind,
  cycleToken?: string | null
): string {
  const base = `esim_lifecycle:${orderId.trim()}:${kind}`;
  const cycle = normalizeEsimLifecycleAlertCycleToken(cycleToken);
  return cycle ? `${base}:c${cycle}` : base;
}

/** Quantize GB to 0.1 for stable cycle fingerprints. */
export function quantizeEsimLifecycleGb(
  value: number | null | undefined
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value * 10);
}

export function esimLifecycleExpiryDayBucket(
  expiresAt: string | null | undefined
): number {
  const ms = parseProviderInstantMs(expiresAt);
  if (ms == null) return 0;
  return Math.floor(ms / 86_400_000);
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

/** True when usage would currently qualify for LOW_DATA or DATA_EXHAUSTED. */
export function isInEsimLifecycleDataAlertZone(
  usage: Pick<
    EsimLifecycleUsageInput,
    | "remainingDataGB"
    | "initialDataGB"
    | "isUnlimited"
    | "reportsDataAllowance"
  >
): boolean {
  return (
    evaluateEsimLifecycleDataEvents({
      expiresAt: null,
      daysRemaining: null,
      isExpired: null,
      isUnlimited: usage.isUnlimited === true,
      reportsDataAllowance: usage.reportsDataAllowance !== false,
      initialDataGB: usage.initialDataGB,
      remainingDataGB: usage.remainingDataGB,
    }).length > 0
  );
}

/**
 * Significant remaining/initial increase after a prior data-alert (top-up / refill).
 * Requires previous sample in the alert zone and a clear recovery jump.
 */
export function isSignificantEsimLifecycleDataRefill(input: {
  previousRemainingDataGB: number | null | undefined;
  previousInitialDataGB: number | null | undefined;
  currentRemainingDataGB: number | null | undefined;
  currentInitialDataGB: number | null | undefined;
}): boolean {
  const prevRem = input.previousRemainingDataGB;
  const curRem = input.currentRemainingDataGB;
  if (
    typeof prevRem !== "number" ||
    !Number.isFinite(prevRem) ||
    typeof curRem !== "number" ||
    !Number.isFinite(curRem)
  ) {
    return false;
  }

  const prevInitial =
    typeof input.previousInitialDataGB === "number" &&
    Number.isFinite(input.previousInitialDataGB) &&
    input.previousInitialDataGB > 0
      ? input.previousInitialDataGB
      : null;
  const curInitial =
    typeof input.currentInitialDataGB === "number" &&
    Number.isFinite(input.currentInitialDataGB) &&
    input.currentInitialDataGB > 0
      ? input.currentInitialDataGB
      : null;

  const prevInAlert = isInEsimLifecycleDataAlertZone({
    remainingDataGB: prevRem,
    initialDataGB: prevInitial,
    isUnlimited: false,
    reportsDataAllowance: true,
  });
  if (!prevInAlert) return false;

  const initialBump =
    curInitial != null &&
    prevInitial != null &&
    curInitial >= prevInitial + 0.25;

  const threshold = Math.max(
    0.5,
    ((curInitial ?? prevInitial ?? 1) * 15) / 100
  );
  const remainingBump = curRem >= prevRem + threshold;
  const leftAlertZone = !isInEsimLifecycleDataAlertZone({
    remainingDataGB: curRem,
    initialDataGB: curInitial ?? prevInitial,
    isUnlimited: false,
    reportsDataAllowance: true,
  });

  return (remainingBump || initialBump) && (leftAlertZone || initialBump);
}

/** Expiry pushed out by at least 12 hours (typical top-up / plan extension). */
export function isSignificantEsimLifecycleExpiryExtension(input: {
  previousExpiresAtMs: number | null | undefined;
  currentExpiresAt: string | null | undefined;
  minExtensionMs?: number;
}): boolean {
  const prev = input.previousExpiresAtMs;
  const cur = parseProviderInstantMs(input.currentExpiresAt);
  if (typeof prev !== "number" || !Number.isFinite(prev) || cur == null) {
    return false;
  }
  const minMs =
    typeof input.minExtensionMs === "number" &&
    Number.isFinite(input.minExtensionMs) &&
    input.minExtensionMs > 0
      ? input.minExtensionMs
      : 12 * 3_600_000;
  return cur >= prev + minMs;
}

export type EsimLifecycleAlertCycleInput = {
  completedAddDataCount: number;
  previousRemainingDataGB?: number | null;
  previousInitialDataGB?: number | null;
  previousExpiresAtMs?: number | null;
  currentRemainingDataGB?: number | null;
  currentInitialDataGB?: number | null;
  currentExpiresAt?: string | null;
};

/**
 * Resolve outbox cycle token for re-alerting after Add Data / allowance refill.
 * Returns "0" for the legacy unsuffixed eventKey (backward compatible).
 *
 * Spam guard: with completed top-ups, only leave legacy once prior cache was
 * healthy, remaining/initial clearly recovered, or expiry extended — so a
 * still-depleted usage read right after purchase does not open a new cycle.
 */
export function resolveEsimLifecycleAlertCycleToken(
  input: EsimLifecycleAlertCycleInput
): string {
  const topUps = Math.max(
    0,
    Math.floor(
      Number.isFinite(input.completedAddDataCount)
        ? input.completedAddDataCount
        : 0
    )
  );
  const initialQ = quantizeEsimLifecycleGb(input.currentInitialDataGB);
  const expDay = esimLifecycleExpiryDayBucket(input.currentExpiresAt);

  const dataRefill = isSignificantEsimLifecycleDataRefill({
    previousRemainingDataGB: input.previousRemainingDataGB,
    previousInitialDataGB: input.previousInitialDataGB,
    currentRemainingDataGB: input.currentRemainingDataGB,
    currentInitialDataGB: input.currentInitialDataGB,
  });
  const expiryExt = isSignificantEsimLifecycleExpiryExtension({
    previousExpiresAtMs: input.previousExpiresAtMs,
    currentExpiresAt: input.currentExpiresAt,
  });

  const prevRem = input.previousRemainingDataGB;
  const prevInitial = input.previousInitialDataGB;
  const prevHadCache =
    (typeof prevRem === "number" && Number.isFinite(prevRem)) ||
    (typeof prevInitial === "number" && Number.isFinite(prevInitial)) ||
    (typeof input.previousExpiresAtMs === "number" &&
      Number.isFinite(input.previousExpiresAtMs));

  const prevInDataAlert =
    typeof prevRem === "number" &&
    Number.isFinite(prevRem) &&
    isInEsimLifecycleDataAlertZone({
      remainingDataGB: prevRem,
      initialDataGB:
        typeof prevInitial === "number" && Number.isFinite(prevInitial)
          ? prevInitial
          : null,
      isUnlimited: false,
      reportsDataAllowance: true,
    });

  const recoveredOrExtended = dataRefill || expiryExt || !prevInDataAlert;

  if (topUps > 0) {
    // Sticky after Add Data once recovery/extension is observed (or no prior
    // alert-zone cache). Avoids immediate re-spam while still depleted.
    if (!prevHadCache || recoveredOrExtended) {
      return `t${topUps}_${initialQ}_${expDay}`;
    }
    return "0";
  }

  // No MAP Add Data row — re-arm on observed refill/extension, or when re-entering
  // an alert after a healthy prior cache (legacy SENT must not block forever).
  if (dataRefill || expiryExt || (prevHadCache && !prevInDataAlert)) {
    return `r${initialQ}_${expDay}`;
  }

  return "0";
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
