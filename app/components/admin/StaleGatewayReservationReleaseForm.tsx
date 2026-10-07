"use client";

import { useActionState } from "react";
import {
  releaseStaleGatewayReservationAction,
  type StaleGatewayReleaseFormState,
} from "@/app/lib/admin/staleGatewayReservationReleaseActions";
import type { PaymentRecoveryOwnerKind } from "@/app/lib/admin/paymentRecoveryShared";
import {
  ADMIN_GATEWAY_ONLY_DISMISS_REASON,
  ADMIN_STALE_HOLD_RELEASE_REASON,
  PAYMENT_WORKBENCH_LABEL,
} from "@/app/lib/admin/paymentDetailWorkbenchShared";
import { AdminButton } from "@/app/components/admin/ui";

const initial: StaleGatewayReleaseFormState = null;

/**
 * Safe Admin release / dismiss for unpaid stale gateway attempts.
 * Never marks paid / funds / replays webhooks.
 * Gateway-only dismiss uses a one-click button with a server-validated default reason.
 */
export default function StaleGatewayReservationReleaseForm(props: {
  paymentAttemptId: string;
  ownerKind: PaymentRecoveryOwnerKind;
  walletAppliedCents: number;
  /** Gateway-only dismiss (no wallet hold) — age ≥ 30 minutes. */
  gatewayOnlyDismiss?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    releaseStaleGatewayReservationAction,
    initial
  );
  const hasHold =
    Number.isInteger(props.walletAppliedCents) && props.walletAppliedCents > 0;
  const dismissOnly = Boolean(props.gatewayOnlyDismiss) || !hasHold;
  const reason = dismissOnly
    ? ADMIN_GATEWAY_ONLY_DISMISS_REASON
    : ADMIN_STALE_HOLD_RELEASE_REASON;
  const submitLabel = dismissOnly
    ? PAYMENT_WORKBENCH_LABEL.dismissStale
    : PAYMENT_WORKBENCH_LABEL.dismissStale;

  return (
    <section
      id="stale-release"
      className="rounded-2xl border border-amber-500/35 bg-amber-500/8 px-4 py-4 sm:px-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--heading)]">
            {dismissOnly ? "Stale unpaid attempt" : "Stale wallet hold"}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {dismissOnly
              ? "No funds were deducted. Dismiss to mark expired and clear pending queues."
              : `Release the reserved wallet hold (${props.walletAppliedCents}¢) and close this attempt.`}{" "}
            Never marks paid.
          </p>
        </div>
        <form action={formAction} className="shrink-0">
          <input
            type="hidden"
            name="paymentAttemptId"
            value={props.paymentAttemptId}
          />
          <input type="hidden" name="ownerKind" value={props.ownerKind} />
          <input type="hidden" name="reason" value={reason} />
          <AdminButton type="submit" variant="primary" disabled={pending}>
            {pending ? "Dismissing…" : submitLabel}
          </AdminButton>
        </form>
      </div>

      {state?.ok ? (
        <p className="mt-3 text-sm font-medium text-[var(--heading)]" role="status">
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
