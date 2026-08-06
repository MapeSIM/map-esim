"use client";

import { useActionState } from "react";
import {
  deescalateReconciliationCaseAction,
  escalateReconciliationCaseAction,
  lockReconciliationCaseAction,
  backfillReconciliationIccidAction,
  resendReconciliationEmailAction,
  resolveReconciliationCaseAction,
  unlockReconciliationCaseAction,
  type CaseManagementFormState,
} from "@/app/lib/admin/reconciliationCaseActions";
import {
  BACKFILL_ICCID_PHRASE,
  CASE_REASON_MAX,
  DEESCALATE_CASE_PHRASE,
  ESCALATION_PRIORITIES,
  LOCK_CASE_PHRASE,
  RESEND_EMAIL_PHRASE,
  RESOLUTION_CODES,
  RESOLVE_CASE_PHRASE,
  UNLOCK_CASE_PHRASE,
} from "@/app/lib/admin/reconciliationCaseShared";

const initial: CaseManagementFormState = null;

function FieldError({
  state,
  field,
}: {
  state: CaseManagementFormState;
  field: keyof NonNullable<
    Extract<CaseManagementFormState, { ok: false }>["fieldErrors"]
  >;
}) {
  if (!state || state.ok || !state.fieldErrors?.[field]) return null;
  return (
    <p className="mt-1 text-sm text-[var(--danger-text)]">
      {state.fieldErrors[field]}
    </p>
  );
}

function ActionMessage({ state }: { state: CaseManagementFormState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p className="text-sm font-medium text-[var(--heading)]" role="status">
        {"message" in state && state.message
          ? state.message
          : "Case updated."}
      </p>
    );
  }
  if (state.fieldErrors) return null;
  return (
    <p className="text-sm text-[var(--danger-text)]" role="alert">
      {state.error}
    </p>
  );
}

export default function CaseManagementPanel(props: {
  sourceType: string;
  attemptId: string;
  stateLabel: string;
  locked: boolean;
  escalated: boolean;
  resolved: boolean;
  lockedAtLabel: string;
  lockedByLabel: string;
  lockReason: string;
  escalatedAtLabel: string;
  escalatedByLabel: string;
  escalationPriority: string;
  escalationReason: string;
  resolvedAtLabel: string;
  resolvedByLabel: string;
  resolutionReason: string;
  resolutionCode: string;
  resolutionEligibilityMessage: string;
  canLock: boolean;
  canUnlock: boolean;
  canEscalate: boolean;
  canDeescalate: boolean;
  deescalatePriorityOptions: string[];
  canResolve: boolean;
  emailResendSupported: boolean;
  emailResendAllowed: boolean;
  emailResendMessage: string;
  iccidBackfillSupported: boolean;
  iccidBackfillAllowed: boolean;
  iccidBackfillMessage: string;
}) {
  const [lockState, lockAction, lockPending] = useActionState(
    lockReconciliationCaseAction,
    initial
  );
  const [unlockState, unlockAction, unlockPending] = useActionState(
    unlockReconciliationCaseAction,
    initial
  );
  const [escalateState, escalateAction, escalatePending] = useActionState(
    escalateReconciliationCaseAction,
    initial
  );
  const [deescalateState, deescalateAction, deescalatePending] = useActionState(
    deescalateReconciliationCaseAction,
    initial
  );
  const [resolveState, resolveAction, resolvePending] = useActionState(
    resolveReconciliationCaseAction,
    initial
  );
  const [resendState, resendAction, resendPending] = useActionState(
    resendReconciliationEmailAction,
    initial
  );
  const [iccidState, iccidAction, iccidPending] = useActionState(
    backfillReconciliationIccidAction,
    initial
  );

  const readOnly = props.resolved;
  const busy =
    lockPending ||
    unlockPending ||
    escalatePending ||
    deescalatePending ||
    resolvePending ||
    resendPending ||
    iccidPending;

  return (
    <section className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Case management</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Lock, escalate, or mark resolved when local evidence shows no active
          risk. Wallet balances, refunds, and provider order placement are never
          changed here. ICCID backfill writes only a missing ICCID when provider
          evidence confirms it.
        </p>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            State
          </dt>
          <dd className="mt-1 font-medium text-[var(--heading)]">
            {props.stateLabel}
            {props.escalated && !props.resolved ? (
              <span className="ml-2 inline-block rounded-md bg-[var(--accent-strong)]/12 px-2 py-0.5 text-xs font-semibold text-[var(--accent-strong)]">
                Escalated {props.escalationPriority}
              </span>
            ) : null}
            {props.locked && !props.resolved ? (
              <span className="ml-2 inline-block rounded-md border border-[var(--border)] px-2 py-0.5 text-xs font-semibold text-[var(--heading)]">
                Locked
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Resolution eligibility
          </dt>
          <dd className="mt-1 text-[var(--heading)]">
            {props.resolutionEligibilityMessage}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Locked by / at
          </dt>
          <dd className="mt-1 text-[var(--heading)]">
            {props.lockedByLabel} · {props.lockedAtLabel}
          </dd>
          <dd className="mt-1 text-xs text-[var(--text-soft)]">
            {props.lockReason}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Escalation
          </dt>
          <dd className="mt-1 text-[var(--heading)]">
            {props.escalationPriority} · {props.escalatedByLabel} ·{" "}
            {props.escalatedAtLabel}
          </dd>
          <dd className="mt-1 text-xs text-[var(--text-soft)]">
            {props.escalationReason}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Resolved by / at
          </dt>
          <dd className="mt-1 text-[var(--heading)]">
            {props.resolvedByLabel} · {props.resolvedAtLabel} ·{" "}
            {props.resolutionCode}
          </dd>
          <dd className="mt-1 text-xs text-[var(--text-soft)]">
            {props.resolutionReason}
          </dd>
        </div>
      </dl>

      {readOnly ? (
        <p className="text-sm font-medium text-[var(--heading)]" role="status">
          This case is resolved and read-only.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {props.canLock ? (
            <form action={lockAction} className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                Lock case
              </h3>
              <input type="hidden" name="sourceType" value={props.sourceType} />
              <input type="hidden" name="attemptId" value={props.attemptId} />
              <div>
                <label
                  htmlFor="lock-reason"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Reason
                </label>
                <textarea
                  id="lock-reason"
                  name="reason"
                  required
                  maxLength={CASE_REASON_MAX}
                  rows={2}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                />
                <FieldError state={lockState} field="reason" />
              </div>
              <div>
                <label
                  htmlFor="lock-confirm"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Type {LOCK_CASE_PHRASE}
                </label>
                <input
                  id="lock-confirm"
                  name="confirmPhrase"
                  required
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                />
                <FieldError state={lockState} field="confirmPhrase" />
              </div>
              <ActionMessage state={lockState} />
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
              >
                {lockPending ? "Locking…" : "Lock case"}
              </button>
            </form>
          ) : null}

          {props.canUnlock ? (
            <form action={unlockAction} className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                Unlock case
              </h3>
              <input type="hidden" name="sourceType" value={props.sourceType} />
              <input type="hidden" name="attemptId" value={props.attemptId} />
              <div>
                <label
                  htmlFor="unlock-reason"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Reason
                </label>
                <textarea
                  id="unlock-reason"
                  name="reason"
                  required
                  maxLength={CASE_REASON_MAX}
                  rows={2}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                />
                <FieldError state={unlockState} field="reason" />
              </div>
              <div>
                <label
                  htmlFor="unlock-confirm"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Type {UNLOCK_CASE_PHRASE}
                </label>
                <input
                  id="unlock-confirm"
                  name="confirmPhrase"
                  required
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                />
                <FieldError state={unlockState} field="confirmPhrase" />
              </div>
              <ActionMessage state={unlockState} />
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
              >
                {unlockPending ? "Unlocking…" : "Unlock case"}
              </button>
            </form>
          ) : null}

          {props.canEscalate ? (
            <form action={escalateAction} className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                Escalate case
              </h3>
              <input type="hidden" name="sourceType" value={props.sourceType} />
              <input type="hidden" name="attemptId" value={props.attemptId} />
              <div>
                <label
                  htmlFor="escalate-priority"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Priority
                </label>
                <select
                  id="escalate-priority"
                  name="priority"
                  required
                  disabled={busy}
                  defaultValue="MEDIUM"
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                >
                  {ESCALATION_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <FieldError state={escalateState} field="priority" />
              </div>
              <div>
                <label
                  htmlFor="escalate-reason"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Reason
                </label>
                <textarea
                  id="escalate-reason"
                  name="reason"
                  required
                  maxLength={CASE_REASON_MAX}
                  rows={2}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                />
                <FieldError state={escalateState} field="reason" />
              </div>
              <ActionMessage state={escalateState} />
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
              >
                {escalatePending ? "Escalating…" : "Escalate case"}
              </button>
            </form>
          ) : null}

          {props.canDeescalate ? (
            <form action={deescalateAction} className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                De-escalate case
              </h3>
              <input type="hidden" name="sourceType" value={props.sourceType} />
              <input type="hidden" name="attemptId" value={props.attemptId} />
              <div>
                <label
                  htmlFor="deescalate-priority"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Lower priority
                </label>
                <select
                  id="deescalate-priority"
                  name="priority"
                  required
                  disabled={busy}
                  defaultValue={props.deescalatePriorityOptions[0] || ""}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                >
                  {props.deescalatePriorityOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <FieldError state={deescalateState} field="priority" />
              </div>
              <div>
                <label
                  htmlFor="deescalate-reason"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Reason
                </label>
                <textarea
                  id="deescalate-reason"
                  name="reason"
                  required
                  maxLength={CASE_REASON_MAX}
                  rows={2}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                />
                <FieldError state={deescalateState} field="reason" />
              </div>
              <div>
                <label
                  htmlFor="deescalate-confirm"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Type {DEESCALATE_CASE_PHRASE}
                </label>
                <input
                  id="deescalate-confirm"
                  name="confirmPhrase"
                  required
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                />
                <FieldError state={deescalateState} field="confirmPhrase" />
              </div>
              <ActionMessage state={deescalateState} />
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
              >
                {deescalatePending ? "De-escalating…" : "De-escalate case"}
              </button>
            </form>
          ) : null}

          {props.emailResendSupported ? (
            <form action={resendAction} className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                Resend email
              </h3>
              <p className="text-sm text-[var(--text-muted)]">
                {props.emailResendMessage}
              </p>
              <input type="hidden" name="sourceType" value={props.sourceType} />
              <input type="hidden" name="attemptId" value={props.attemptId} />
              <div>
                <label
                  htmlFor="resend-reason"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Reason
                </label>
                <textarea
                  id="resend-reason"
                  name="reason"
                  required
                  maxLength={CASE_REASON_MAX}
                  rows={2}
                  disabled={busy || !props.emailResendAllowed}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                />
                <FieldError state={resendState} field="reason" />
              </div>
              <div>
                <label
                  htmlFor="resend-confirm"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Type {RESEND_EMAIL_PHRASE}
                </label>
                <input
                  id="resend-confirm"
                  name="confirmPhrase"
                  required
                  disabled={busy || !props.emailResendAllowed}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                />
                <FieldError state={resendState} field="confirmPhrase" />
              </div>
              <ActionMessage state={resendState} />
              <button
                type="submit"
                disabled={busy || !props.emailResendAllowed}
                className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resendPending ? "Resending…" : "Resend email"}
              </button>
            </form>
          ) : null}

          {props.iccidBackfillSupported ? (
            <form action={iccidAction} className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                Backfill ICCID
              </h3>
              <p className="text-sm text-[var(--text-muted)]">
                {props.iccidBackfillMessage}
              </p>
              <input type="hidden" name="sourceType" value={props.sourceType} />
              <input type="hidden" name="attemptId" value={props.attemptId} />
              <div>
                <label
                  htmlFor="iccid-backfill-reason"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Reason
                </label>
                <textarea
                  id="iccid-backfill-reason"
                  name="reason"
                  required
                  maxLength={CASE_REASON_MAX}
                  rows={2}
                  disabled={busy || !props.iccidBackfillAllowed}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                />
                <FieldError state={iccidState} field="reason" />
              </div>
              <div>
                <label
                  htmlFor="iccid-backfill-confirm"
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Type {BACKFILL_ICCID_PHRASE}
                </label>
                <input
                  id="iccid-backfill-confirm"
                  name="confirmPhrase"
                  required
                  disabled={busy || !props.iccidBackfillAllowed}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
                />
                <FieldError state={iccidState} field="confirmPhrase" />
              </div>
              <ActionMessage state={iccidState} />
              <button
                type="submit"
                disabled={busy || !props.iccidBackfillAllowed}
                className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {iccidPending ? "Backfilling…" : "Backfill ICCID"}
              </button>
            </form>
          ) : null}

          <form action={resolveAction} className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--heading)]">
              Mark resolved
            </h3>
            <input type="hidden" name="sourceType" value={props.sourceType} />
            <input type="hidden" name="attemptId" value={props.attemptId} />
            <div>
              <label
                htmlFor="resolve-code"
                className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
              >
                Resolution code
              </label>
              <select
                id="resolve-code"
                name="resolutionCode"
                required
                disabled={busy || !props.canResolve}
                defaultValue="ALREADY_RECOVERED"
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
              >
                {RESOLUTION_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <FieldError state={resolveState} field="resolutionCode" />
            </div>
            <div>
              <label
                htmlFor="resolve-reason"
                className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
              >
                Reason
              </label>
              <textarea
                id="resolve-reason"
                name="reason"
                required
                maxLength={CASE_REASON_MAX}
                rows={2}
                disabled={busy || !props.canResolve}
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
              />
              <FieldError state={resolveState} field="reason" />
            </div>
            <div>
              <label
                htmlFor="resolve-confirm"
                className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
              >
                Type {RESOLVE_CASE_PHRASE}
              </label>
              <input
                id="resolve-confirm"
                name="confirmPhrase"
                required
                disabled={busy || !props.canResolve}
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
              />
              <FieldError state={resolveState} field="confirmPhrase" />
            </div>
            {!props.canResolve ? (
              <p className="text-sm text-[var(--text-muted)]" role="status">
                Mark resolved is unavailable until eligibility passes and the
                case is unlocked.
              </p>
            ) : null}
            <ActionMessage state={resolveState} />
            <button
              type="submit"
              disabled={busy || !props.canResolve}
              className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resolvePending ? "Resolving…" : "Mark resolved"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
