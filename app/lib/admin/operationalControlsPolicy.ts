/**
 * Server-only operational control policy (Part A2).
 * Reads allowlisted pause switches for new risky transaction initiation.
 * Fail closed on DB read failure. Missing rows use safe ACTIVE default.
 * Never enables unavailable features. Never mutates business records.
 */
import "server-only";

import { OperationalControlKey } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  CONTROL_CONFIRM_PHRASES,
  CONTROL_DISPLAY,
  OPERATIONAL_CONTROL_KEYS,
  OPERATIONAL_CONTROL_MISSING_DEFAULT_PAUSED,
  OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE,
  controlStateLabel,
  evaluateFlowControls,
  overallTransactionsStatus,
  truncateControlReason,
  type OperationalControlKeyName,
  type SanitizedOperationalControlView,
  type TransactionFlow,
} from "@/app/lib/admin/operationalControlsShared";
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";

export type { SanitizedOperationalControlView };

export class OperationalControlBlockedError extends Error {
  readonly code = "OPERATIONAL_CONTROL_PAUSED" as const;
  readonly blockingKeys: OperationalControlKeyName[];

  constructor(blockingKeys: OperationalControlKeyName[] = []) {
    super(OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE);
    this.name = "OperationalControlBlockedError";
    this.blockingKeys = blockingKeys;
  }
}

export class OperationalControlUnavailableError extends Error {
  readonly code = "OPERATIONAL_CONTROL_UNAVAILABLE" as const;

  constructor() {
    super(OPERATIONAL_CONTROL_UNAVAILABLE_MESSAGE);
    this.name = "OperationalControlUnavailableError";
  }
}

export type ControlPausedMap = Partial<
  Record<OperationalControlKeyName, boolean>
>;

/**
 * Load paused flags for allowlisted keys.
 * Missing keys → safe default (not paused).
 * Throws OperationalControlUnavailableError on read failure (fail closed for risky paths).
 */
export async function loadOperationalControlPausedMap(): Promise<ControlPausedMap> {
  try {
    const rows = await prisma.operationalControl.findMany({
      where: {
        key: {
          in: [...OPERATIONAL_CONTROL_KEYS] as OperationalControlKey[],
        },
      },
      select: { key: true, paused: true },
    });
    const map: ControlPausedMap = {};
    for (const key of OPERATIONAL_CONTROL_KEYS) {
      map[key] = OPERATIONAL_CONTROL_MISSING_DEFAULT_PAUSED;
    }
    for (const row of rows) {
      const key = row.key as OperationalControlKeyName;
      if (OPERATIONAL_CONTROL_KEYS.includes(key)) {
        map[key] = Boolean(row.paused);
      }
    }
    return map;
  } catch {
    throw new OperationalControlUnavailableError();
  }
}

/**
 * Soft read for dashboards / public browsing — never throws.
 * On failure returns empty map (callers must not use this for financial initiation).
 */
export async function loadOperationalControlPausedMapSoft(): Promise<{
  ok: boolean;
  map: ControlPausedMap;
}> {
  try {
    const map = await loadOperationalControlPausedMap();
    return { ok: true, map };
  } catch {
    return { ok: false, map: {} };
  }
}

/**
 * Assert a new risky transaction may initiate.
 * Call only at safest pre-mutation boundaries (before create / claim+debit / PROVIDER_PENDING).
 */
export async function assertNewRiskyTransactionAllowed(
  flow: TransactionFlow,
  options?: { includeProviderOrder?: boolean }
): Promise<void> {
  const map = await loadOperationalControlPausedMap();
  const result = evaluateFlowControls(flow, map, options);
  if (result.blocked) {
    throw new OperationalControlBlockedError(result.blockingKeys);
  }
}

export type OperationalControlsHealthSnapshot = {
  checkedAtLabel: string;
  freshness: "DATABASE_DERIVED" | "NOT_AVAILABLE";
  overallTransactionsStatus:
    | "ACTIVE"
    | "PARTIALLY_PAUSED"
    | "PAUSED"
    | "UNKNOWN";
  controls: SanitizedOperationalControlView[];
  pausedControlKeys: OperationalControlKeyName[];
  guestCheckoutStatus: "NOT_IMPLEMENTED / DISABLED";
  readOk: boolean;
};

function safeActorId(id: string | null | undefined): string | null {
  const v = (id ?? "").trim();
  if (!v || v.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return null;
  if (v.length <= 12) return v;
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

function viewForKey(
  key: OperationalControlKeyName,
  row?: {
    paused: boolean;
    version: number;
    reason: string | null;
    updatedByAdminId: string | null;
    updatedAt: Date;
  } | null
): SanitizedOperationalControlView {
  const paused = row
    ? Boolean(row.paused)
    : OPERATIONAL_CONTROL_MISSING_DEFAULT_PAUSED;
  return {
    key,
    name: CONTROL_DISPLAY[key].name,
    scope: CONTROL_DISPLAY[key].scope,
    state: controlStateLabel(paused),
    paused,
    version: row?.version ?? 0,
    reasonTruncated: truncateControlReason(row?.reason),
    updatedAtLabel: formatUtcTimestamp(row?.updatedAt),
    updatedByAdminIdSafe: safeActorId(row?.updatedByAdminId),
    pausePhrase: CONTROL_CONFIRM_PHRASES[key].pause,
    resumePhrase: CONTROL_CONFIRM_PHRASES[key].resume,
  };
}

export async function getOperationalControlsHealthSnapshot(): Promise<OperationalControlsHealthSnapshot> {
  const checkedAt = new Date();
  const checkedAtLabel = formatUtcTimestamp(checkedAt);
  const guestCheckoutStatus = "NOT_IMPLEMENTED / DISABLED" as const;

  try {
    const rows = await prisma.operationalControl.findMany({
      where: {
        key: {
          in: [...OPERATIONAL_CONTROL_KEYS] as OperationalControlKey[],
        },
      },
      select: {
        key: true,
        paused: true,
        version: true,
        reason: true,
        updatedByAdminId: true,
        updatedAt: true,
      },
    });
    const byKey = new Map(
      rows.map((r) => [r.key as OperationalControlKeyName, r])
    );
    const pausedByKey: ControlPausedMap = {};
    const controls: SanitizedOperationalControlView[] = [];

    for (const key of OPERATIONAL_CONTROL_KEYS) {
      const row = byKey.get(key) ?? null;
      const view = viewForKey(key, row);
      pausedByKey[key] = view.paused;
      controls.push(view);
    }

    const pausedControlKeys = OPERATIONAL_CONTROL_KEYS.filter(
      (k) => pausedByKey[k]
    );

    return {
      checkedAtLabel,
      freshness: "DATABASE_DERIVED",
      overallTransactionsStatus: overallTransactionsStatus(pausedByKey),
      controls,
      pausedControlKeys,
      guestCheckoutStatus,
      readOk: true,
    };
  } catch {
    return {
      checkedAtLabel,
      freshness: "NOT_AVAILABLE",
      overallTransactionsStatus: "UNKNOWN",
      controls: OPERATIONAL_CONTROL_KEYS.map((key) => viewForKey(key, null)),
      pausedControlKeys: [],
      guestCheckoutStatus,
      readOk: false,
    };
  }
}
