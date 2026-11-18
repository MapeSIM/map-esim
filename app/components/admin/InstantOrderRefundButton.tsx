"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminInstantOrderRefundAction,
  type InstantOrderRefundActionState,
} from "@/app/lib/admin/instantOrderRefundActions";
import {
  INSTANT_REFUND_REASON_MAX,
  type InstantOrderRefundButtonProps,
} from "@/app/lib/admin/instantOrderRefundShared";
import { AdminStatusPill } from "@/app/components/admin/ui";

/**
 * Fast Instant Refund control for admin order / purchase rows.
 * Confirmation dialog → server action (MAP Wallet / Partner wallet credit).
 */
export default function InstantOrderRefundButton({
  orderId,
  partnerPurchaseId = null,
  amountLabel,
  paymentMethodLabel,
  partyLabel,
  alreadyRefunded,
  refundEligible,
  ineligibleReason = null,
  compact = false,
}: InstantOrderRefundButtonProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    adminInstantOrderRefundAction,
    null as InstantOrderRefundActionState
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  if (alreadyRefunded) {
    return (
      <AdminStatusPill value="Refunded">Refunded</AdminStatusPill>
    );
  }

  if (!refundEligible) {
    return (
      <span
        className="text-xs text-[var(--text-muted)]"
        title={ineligibleReason ?? "Not eligible for instant refund"}
      >
        {compact ? "—" : ineligibleReason ?? "Not eligible"}
      </span>
    );
  }

  const toast = pending
    ? ({ kind: "loading" as const, message: "Processing refund…" } as const)
    : state?.ok
      ? ({ kind: "success" as const, message: state.message } as const)
      : state && !state.ok
        ? ({ kind: "error" as const, message: state.error } as const)
        : null;

  return (
    <div className={compact ? "inline-flex flex-col gap-1" : "space-y-2"}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className={
          compact
            ? "inline-flex h-8 items-center justify-center rounded-lg border border-[var(--danger-border)] bg-[var(--danger-bg)] px-2.5 text-xs font-semibold text-[var(--danger-text)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-text)] disabled:opacity-60"
            : "inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 text-sm font-semibold text-[var(--danger-text)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-text)] disabled:opacity-60"
        }
        data-admin-instant-refund="open"
      >
        Refund
      </button>

      <dialog
        ref={dialogRef}
        className="w-[min(100%,28rem)] max-w-[calc(100vw-2rem)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--heading)] shadow-xl backdrop:bg-black/40"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          if (pending) {
            e.preventDefault();
            return;
          }
          setOpen(false);
        }}
      >
        <form action={formAction} className="space-y-4 p-5">
          <input type="hidden" name="orderId" value={orderId} />
          {partnerPurchaseId ? (
            <input
              type="hidden"
              name="partnerPurchaseId"
              value={partnerPurchaseId}
            />
          ) : null}

          <div className="space-y-1">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">
              Confirm instant refund
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              Credits the customer MAP Wallet or Partner wallet. Does not call
              the payment gateway.
            </p>
          </div>

          <dl className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-[var(--text-soft)]">Order ID</dt>
              <dd className="break-all font-mono text-xs font-semibold">
                {orderId}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-[var(--text-soft)]">Customer / Partner</dt>
              <dd className="max-w-[60%] break-words text-right font-medium">
                {partyLabel}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-[var(--text-soft)]">Amount</dt>
              <dd className="font-semibold tabular-nums">{amountLabel}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-[var(--text-soft)]">Payment method</dt>
              <dd className="font-semibold">{paymentMethodLabel}</dd>
            </div>
          </dl>

          <div className="min-w-0">
            <label
              htmlFor={`instant-refund-reason-${orderId}`}
              className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
            >
              Reason (optional)
            </label>
            <input
              id={`instant-refund-reason-${orderId}`}
              name="reason"
              maxLength={INSTANT_REFUND_REASON_MAX}
              disabled={pending}
              autoComplete="off"
              placeholder="Short internal note"
              className="mt-1 w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
            />
          </div>

          {state && !state.ok ? (
            <p className="text-sm text-[var(--danger-text)]" role="alert">
              {state.error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 min-w-[9rem] items-center justify-center gap-2 rounded-xl bg-[var(--danger-text)] px-4 text-sm font-semibold text-white disabled:opacity-60"
              data-admin-instant-refund="confirm"
            >
              {pending ? (
                <>
                  <span
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    aria-hidden
                  />
                  Refunding…
                </>
              ) : (
                "Confirm Refund"
              )}
            </button>
          </div>
        </form>
      </dialog>

      {toast ? (
        <div
          className="pointer-events-none fixed bottom-4 right-4 z-[90] max-w-sm"
          role={toast.kind === "error" ? "alert" : "status"}
          aria-live="polite"
          data-admin-toast={toast.kind}
        >
          <div
            className={
              toast.kind === "success"
                ? "rounded-2xl border border-[var(--accent-strong)]/40 bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--heading)] shadow-lg"
                : toast.kind === "error"
                  ? "rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--danger-text)] shadow-lg"
                  : "rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--heading)] shadow-lg"
            }
          >
            {toast.message}
          </div>
        </div>
      ) : null}
    </div>
  );
}
