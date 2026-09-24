"use client";

import { useActionState } from "react";
import {
  releaseStaleGatewayReservationAction,
  type StaleGatewayReleaseFormState,
} from "@/app/lib/admin/staleGatewayReservationReleaseActions";
import { PENDING_PAYMENT_VERIFY_REASON_MAX } from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateShared";
import type { PaymentRecoveryOwnerKind } from "@/app/lib/admin/paymentRecoveryShared";
import { AdminButton } from "@/app/components/admin/ui";

const initial: StaleGatewayReleaseFormState = null;

/**
 * Safe Admin release for unpaid stale gateway wallet holds.
 * Never marks paid / funds / replays webhooks.
 */
export default function StaleGatewayReservationReleaseForm(props: {
  paymentAttemptId: string;
  ownerKind: PaymentRecoveryOwnerKind;
  walletAppliedCents: number;
}) {
  const [state, formAction, pending] = useActionState(
    releaseStaleGatewayReservationAction,
    initial
  );

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm sm:p-5">
      <h2 className="text-base font-semibold text-[var(--heading)]">
        Release stale wallet reservation
      </h2>
      <p className="mt-2 text-[var(--text-muted)]">
        Releases an unpaid {props.ownerKind === "partner" ? "Partner" : "customer"}{" "}
        wallet hold that is past the stale threshold or expired. Restores the
        purchase to READY. Never marks paid, never funds, never replays
        webhooks.
      </p>
      {props.walletAppliedCents > 0 ? (
        <p className="mt-2 text-xs text-[var(--text-soft)]">
          Reserved wallet amount on record: {props.walletAppliedCents}¢
        </p>
      ) : (
        <p className="mt-2 text-xs text-[var(--text-soft)]">
          No wallet debit on this attempt (gateway-only). Release still closes
          the open attempt when eligible.
        </p>
      )}

      <form action={formAction} className="mt-4 space-y-3">
        <input
          type="hidden"
          name="paymentAttemptId"
          value={props.paymentAttemptId}
        />
        <input type="hidden" name="ownerKind" value={props.ownerKind} />
        <div>
          <label
            htmlFor={`stale-release-reason-${props.paymentAttemptId}`}
            className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
          >
            Reason (required)
          </label>
          <textarea
            id={`stale-release-reason-${props.paymentAttemptId}`}
            name="reason"
            required
            maxLength={PENDING_PAYMENT_VERIFY_REASON_MAX}
            rows={3}
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)]"
            placeholder="Why this unpaid reservation should be released"
            disabled={pending}
          />
          {state && !state.ok && state.fieldErrors?.reason ? (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {state.fieldErrors.reason}
            </p>
          ) : null}
        </div>
        <AdminButton type="submit" variant="secondary" disabled={pending}>
          {pending ? "Releasing…" : "Release reservation"}
        </AdminButton>
      </form>

      {state?.ok ? (
        <p className="mt-3 text-sm text-[var(--heading)]" role="status">
          {state.message}
        </p>
      ) : null}
      {state && !state.ok ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
