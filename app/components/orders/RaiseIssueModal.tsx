"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import {
  createOrderSupportTicketAction,
  type CreateOrderSupportTicketFormState,
} from "@/app/lib/support/orderSupportTicketActions";
import {
  ORDER_SUPPORT_DETAILS_MAX,
  ORDER_SUPPORT_TICKET_SUBJECTS,
  orderSupportSubjectLabel,
} from "@/app/lib/support/orderSupportTicketConstants";
import type { OrderSupportTicketSummary } from "@/app/lib/support/orderSupportTicket";

type Props = {
  orderId: string;
  planName: string | null;
  iccid: string | null;
  actor: "CUSTOMER" | "PARTNER";
  existingTicket?: OrderSupportTicketSummary | null;
  /** Controlled open from parent; if omitted, manages its own trigger button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
  triggerClassName?: string;
};

export default function RaiseIssueModal({
  orderId,
  planName,
  iccid,
  actor,
  existingTicket = null,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
  triggerClassName,
}: Props) {
  const titleId = useId();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };

  const [state, formAction, pending] = useActionState(
    createOrderSupportTicketAction,
    null as CreateOrderSupportTicketFormState
  );

  useEffect(() => {
    if (state?.ok) setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const canSubmit = !existingTicket?.isOpen;

  return (
    <>
      {showTrigger && canSubmit ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            triggerClassName ??
            "inline-flex h-10 items-center justify-center rounded-xl border border-[#1E3A5F] bg-transparent px-3.5 text-sm font-semibold text-white/80 transition hover:bg-white/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00B8E6]"
          }
        >
          Raise issue
        </button>
      ) : null}

      {state?.ok ? (
        <p
          className="mt-2 text-xs text-emerald-300/90"
          role="status"
        >
          {state.message}
        </p>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0D1526] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <h2 id={titleId} className="text-base font-semibold text-slate-50">
                Raise an issue
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] text-slate-300 hover:bg-white/[0.04]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form action={formAction} className="space-y-4 p-4">
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="actor" value={actor} />

              <dl className="grid gap-2 rounded-xl border border-white/[0.08] bg-[#070D19] px-3 py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Order ID</dt>
                  <dd className="truncate font-mono text-xs text-slate-200">
                    {orderId}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Plan</dt>
                  <dd className="truncate text-slate-100">
                    {planName || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">ICCID</dt>
                  <dd className="truncate font-mono text-xs text-slate-200">
                    {iccid || "Not available"}
                  </dd>
                </div>
              </dl>

              <div>
                <label
                  htmlFor={`support-subject-${orderId}`}
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500"
                >
                  Subject
                </label>
                <select
                  id={`support-subject-${orderId}`}
                  name="subject"
                  required
                  disabled={pending}
                  defaultValue=""
                  className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#070D19] px-3 py-2.5 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 disabled:opacity-60"
                >
                  <option value="" disabled>
                    Select a subject
                  </option>
                  {ORDER_SUPPORT_TICKET_SUBJECTS.map((id) => (
                    <option key={id} value={id}>
                      {orderSupportSubjectLabel(id)}
                    </option>
                  ))}
                </select>
                {state && !state.ok && state.fieldErrors?.subject ? (
                  <p className="mt-1 text-sm text-rose-300">
                    {state.fieldErrors.subject}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor={`support-details-${orderId}`}
                  className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500"
                >
                  Details
                </label>
                <textarea
                  id={`support-details-${orderId}`}
                  name="details"
                  required
                  rows={4}
                  maxLength={ORDER_SUPPORT_DETAILS_MAX}
                  disabled={pending}
                  placeholder="Describe what happened…"
                  className="mt-1.5 w-full rounded-xl border border-white/[0.1] bg-[#070D19] px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-emerald-400/50 disabled:opacity-60"
                />
                {state && !state.ok && state.fieldErrors?.details ? (
                  <p className="mt-1 text-sm text-rose-300">
                    {state.fieldErrors.details}
                  </p>
                ) : null}
              </div>

              {state && !state.ok ? (
                <p className="text-sm text-rose-300" role="alert">
                  {state.error}
                </p>
              ) : null}

              <p className="text-[11px] text-slate-500">
                Submitting a refund request never credits a wallet automatically.
                An admin must review and approve first.
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {pending ? "Submitting…" : "Submit ticket"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-200 hover:bg-white/[0.04] disabled:opacity-60"
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
