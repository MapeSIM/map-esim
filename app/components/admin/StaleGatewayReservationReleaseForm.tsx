"use client";

import { useActionState } from "react";
import {
  releaseStaleGatewayReservationAction,
  type StaleGatewayReleaseFormState,
} from "@/app/lib/admin/staleGatewayReservationReleaseActions";
import { PENDING_PAYMENT_VERIFY_REASON_MAX } from "@/app/lib/admin/pendingSimpaisaPaymentInvestigateShared";
import type { PaymentRecoveryOwnerKind } from "@/app/lib/admin/paymentRecoveryShared";
import { PAYMENT_WORKBENCH_LABEL } from "@/app/lib/admin/paymentDetailWorkbenchShared";
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
  const hasHold =
    Number.isInteger(props.walletAppliedCents) && props.walletAppliedCents > 0;

  return (
    <section
      id="stale-release"
      className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm sm:p-5"
    >
      <h2 className="text-base font-semibold text-[var(--heading)]">
        Dismiss unpaid attempt
      </h2>
      <p className="mt-2 text-[var(--text-muted)]">
        This attempt is past the stale threshold and still unpaid. Mark it
        abandoned / expired to close it
        {hasHold
          ? " and release the wallet hold"
          : ""}
        . Never marks paid.
      </p>
      {hasHold ? (
        <p className="mt-2 text-xs text-[var(--text-soft)]">
          Wallet hold on record: {props.walletAppliedCents}¢
        </p>
      ) : (
        <p className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--heading)]">
          Status: {PAYMENT_WORKBENCH_LABEL.noFundsDeducted}
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
            rows={2}
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)]"
            placeholder="Why this unpaid attempt should be closed"
            disabled={pending}
            defaultValue="Stale unpaid attempt — customer/partner did not complete payment"
          />
          {state && !state.ok && state.fieldErrors?.reason ? (
            <p className="mt-1 text-xs text-red-600" role="alert">
              {state.fieldErrors.reason}
            </p>
          ) : null}
        </div>
        <AdminButton type="submit" variant="primary" disabled={pending}>
          {pending ? "Closing…" : PAYMENT_WORKBENCH_LABEL.dismissStale}
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
