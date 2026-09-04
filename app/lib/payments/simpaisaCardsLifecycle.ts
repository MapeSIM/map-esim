/**
 * Durable Simpaisa Cards payment-attempt lifecycle (TS foundation).
 * Pure — no Prisma migration yet. Safe for offline QA.
 *
 * Browser return may observe state for UX only.
 * Funding is allowed ONLY after verified provider evidence lands in
 * VERIFIED_SUCCESS (via callback/inquiry), never from browser return.
 */

export const SIMPAISA_CARDS_ATTEMPT_STATUSES = [
  "CREATED",
  "SESSION_PENDING",
  "CUSTOMER_ACTION_REQUIRED",
  "PROCESSING",
  "VERIFIED_SUCCESS",
  "VERIFIED_FAILED",
  "RECONCILIATION_REQUIRED",
] as const;

export type SimpaisaCardsAttemptStatus =
  (typeof SIMPAISA_CARDS_ATTEMPT_STATUSES)[number];

/** Terminal statuses (no further happy-path progression). */
export const SIMPAISA_CARDS_TERMINAL_STATUSES = [
  "VERIFIED_SUCCESS",
  "VERIFIED_FAILED",
  "RECONCILIATION_REQUIRED",
] as const satisfies readonly SimpaisaCardsAttemptStatus[];

export type SimpaisaCardsTerminalStatus =
  (typeof SIMPAISA_CARDS_TERMINAL_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<
  SimpaisaCardsAttemptStatus,
  readonly SimpaisaCardsAttemptStatus[]
> = {
  CREATED: ["SESSION_PENDING", "VERIFIED_FAILED", "RECONCILIATION_REQUIRED"],
  SESSION_PENDING: [
    "CUSTOMER_ACTION_REQUIRED",
    "PROCESSING",
    "VERIFIED_FAILED",
    "RECONCILIATION_REQUIRED",
  ],
  CUSTOMER_ACTION_REQUIRED: [
    "PROCESSING",
    "VERIFIED_FAILED",
    "RECONCILIATION_REQUIRED",
  ],
  PROCESSING: [
    "VERIFIED_SUCCESS",
    "VERIFIED_FAILED",
    "RECONCILIATION_REQUIRED",
  ],
  VERIFIED_SUCCESS: [],
  VERIFIED_FAILED: [],
  RECONCILIATION_REQUIRED: [],
};

export function isSimpaisaCardsAttemptStatus(
  value: string
): value is SimpaisaCardsAttemptStatus {
  return (SIMPAISA_CARDS_ATTEMPT_STATUSES as readonly string[]).includes(value);
}

export function isSimpaisaCardsTerminalStatus(
  status: SimpaisaCardsAttemptStatus
): status is SimpaisaCardsTerminalStatus {
  return (SIMPAISA_CARDS_TERMINAL_STATUSES as readonly string[]).includes(
    status
  );
}

export function canTransitionSimpaisaCardsAttempt(
  from: SimpaisaCardsAttemptStatus,
  to: SimpaisaCardsAttemptStatus
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Funding may be attempted only after verified success evidence.
 * Browser return must never call this with a true result.
 */
export function canFundFromSimpaisaCardsLifecycle(
  status: SimpaisaCardsAttemptStatus,
  options: { evidenceVerified: boolean; fundedOnce: boolean }
): boolean {
  if (options.fundedOnce) return false;
  if (!options.evidenceVerified) return false;
  return status === "VERIFIED_SUCCESS";
}

/** UX-only observation from browser return — never a funding gate. */
export function browserReturnMayObserveStatus(
  status: SimpaisaCardsAttemptStatus
): boolean {
  void status;
  return true;
}

/** Explicit invariant for return handlers / QA. */
export const SIMPAISA_CARDS_BROWSER_RETURN_MAY_FUND = false as const;
