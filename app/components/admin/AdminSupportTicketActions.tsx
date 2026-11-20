"use client";

import { useActionState } from "react";
import {
  adminApproveSupportTicketRefundAction,
  adminRejectSupportTicketAction,
  adminResolveSupportTicketAction,
  type AdminSupportTicketFormState,
} from "@/app/lib/support/orderSupportTicketAdminActions";

type Props = {
  ticketId: string;
  isOpen: boolean;
  isRefundSubject: boolean;
};

export default function AdminSupportTicketActions({
  ticketId,
  isOpen,
  isRefundSubject,
}: Props) {
  const [resolveState, resolveAction, resolvePending] = useActionState(
    adminResolveSupportTicketAction,
    null as AdminSupportTicketFormState
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    adminRejectSupportTicketAction,
    null as AdminSupportTicketFormState
  );
  const [approveState, approveAction, approvePending] = useActionState(
    adminApproveSupportTicketRefundAction,
    null as AdminSupportTicketFormState
  );

  if (!isOpen) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        This ticket is closed. No further actions available.
      </p>
    );
  }

  const pending = resolvePending || rejectPending || approvePending;
  const message =
    (resolveState?.ok && resolveState.message) ||
    (rejectState?.ok && rejectState.message) ||
    (approveState?.ok && approveState.message) ||
    null;
  const error =
    (resolveState && !resolveState.ok && resolveState.error) ||
    (rejectState && !rejectState.ok && rejectState.error) ||
    (approveState && !approveState.ok && approveState.error) ||
    null;

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-[var(--heading)]">
        Resolution notes
        <textarea
          form="support-ticket-reject"
          name="note"
          rows={3}
          disabled={pending}
          placeholder="Optional notes shown to the partner/customer"
          className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          id="support-ticket-note"
        />
      </label>

      {/* Hidden note sync for other forms via JS-less: duplicate note fields */}
      <div className="flex flex-wrap gap-2">
        {isRefundSubject ? (
          <form action={approveAction}>
            <input type="hidden" name="ticketId" value={ticketId} />
            <input
              type="hidden"
              name="note"
              value=""
              id="approve-note-proxy"
            />
            <button
              type="submit"
              disabled={pending}
              onClick={() => {
                const note = (
                  document.getElementById(
                    "support-ticket-note"
                  ) as HTMLTextAreaElement | null
                )?.value;
                const proxy = document.getElementById(
                  "approve-note-proxy"
                ) as HTMLInputElement | null;
                if (proxy) proxy.value = note ?? "";
              }}
              className="inline-flex h-10 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
            >
              {approvePending ? "Approving…" : "Approve refund (credit once)"}
            </button>
          </form>
        ) : (
          <form action={resolveAction}>
            <input type="hidden" name="ticketId" value={ticketId} />
            <input type="hidden" name="note" id="resolve-note-proxy" value="" />
            <button
              type="submit"
              disabled={pending}
              onClick={() => {
                const note = (
                  document.getElementById(
                    "support-ticket-note"
                  ) as HTMLTextAreaElement | null
                )?.value;
                const proxy = document.getElementById(
                  "resolve-note-proxy"
                ) as HTMLInputElement | null;
                if (proxy) proxy.value = note ?? "";
              }}
              className="inline-flex h-10 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
            >
              {resolvePending ? "Saving…" : "Mark resolved"}
            </button>
          </form>
        )}

        <form id="support-ticket-reject" action={rejectAction}>
          <input type="hidden" name="ticketId" value={ticketId} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center rounded-xl border border-[var(--danger-border)] px-4 text-sm font-semibold text-[var(--danger-text)] disabled:opacity-60"
          >
            {rejectPending ? "Rejecting…" : "Reject"}
          </button>
        </form>
      </div>

      {message ? (
        <p className="text-sm text-[var(--text-muted)]" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-[var(--danger-text)]" role="alert">
          {error}
        </p>
      ) : null}
      {isRefundSubject ? (
        <p className="text-xs text-[var(--text-soft)]">
          Approve credits the Partner/Customer wallet exactly once with
          idempotency protection. Submitting a ticket never auto-credits.
        </p>
      ) : null}
    </div>
  );
}
