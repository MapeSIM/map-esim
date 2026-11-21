"use client";

import { useActionState } from "react";
import BrandPendingLabel from "@/app/components/loading/BrandPendingLabel";
import {
  adminApproveSupportTicketRefundAction,
  adminRejectSupportTicketAction,
  adminResolveSupportTicketAction,
  adminSetSupportTicketInfoRequiredAction,
  adminSetSupportTicketInReviewAction,
  type AdminSupportTicketFormState,
} from "@/app/lib/support/orderSupportTicketAdminActions";

type Props = {
  ticketId: string;
  isOpen: boolean;
  isRefundSubject: boolean;
};

function readNote(): string {
  return (
    (
      document.getElementById(
        "support-ticket-note"
      ) as HTMLTextAreaElement | null
    )?.value ?? ""
  );
}

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
  const [inReviewState, inReviewAction, inReviewPending] = useActionState(
    adminSetSupportTicketInReviewAction,
    null as AdminSupportTicketFormState
  );
  const [infoState, infoAction, infoPending] = useActionState(
    adminSetSupportTicketInfoRequiredAction,
    null as AdminSupportTicketFormState
  );

  if (!isOpen) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        This ticket is closed. No further actions available.
      </p>
    );
  }

  const pending =
    resolvePending ||
    rejectPending ||
    approvePending ||
    inReviewPending ||
    infoPending;
  const message =
    (resolveState?.ok && resolveState.message) ||
    (rejectState?.ok && rejectState.message) ||
    (approveState?.ok && approveState.message) ||
    (inReviewState?.ok && inReviewState.message) ||
    (infoState?.ok && infoState.message) ||
    null;
  const error =
    (resolveState && !resolveState.ok && resolveState.error) ||
    (rejectState && !rejectState.ok && rejectState.error) ||
    (approveState && !approveState.ok && approveState.error) ||
    (inReviewState && !inReviewState.ok && inReviewState.error) ||
    (infoState && !infoState.ok && infoState.error) ||
    null;

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-[var(--heading)]">
        Notes (optional)
        <textarea
          form="support-ticket-reject"
          name="note"
          rows={3}
          disabled={pending}
          placeholder="Optional note shown on the Support ticket modal"
          className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          id="support-ticket-note"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <form action={inReviewAction}>
          <input type="hidden" name="ticketId" value={ticketId} />
          <input type="hidden" name="note" id="in-review-note-proxy" value="" />
          <button
            type="submit"
            disabled={pending}
            aria-busy={inReviewPending || undefined}
            onClick={() => {
              const proxy = document.getElementById(
                "in-review-note-proxy"
              ) as HTMLInputElement | null;
              if (proxy) proxy.value = readNote();
            }}
            className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {inReviewPending ? (
              <BrandPendingLabel label="Saving…" />
            ) : (
              "Mark In Review"
            )}
          </button>
        </form>

        <form action={infoAction}>
          <input type="hidden" name="ticketId" value={ticketId} />
          <input
            type="hidden"
            name="note"
            id="info-required-note-proxy"
            value=""
          />
          <button
            type="submit"
            disabled={pending}
            aria-busy={infoPending || undefined}
            onClick={() => {
              const proxy = document.getElementById(
                "info-required-note-proxy"
              ) as HTMLInputElement | null;
              if (proxy) proxy.value = readNote();
            }}
            className="inline-flex h-10 items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--heading)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {infoPending ? (
              <BrandPendingLabel label="Saving…" />
            ) : (
              "Request info"
            )}
          </button>
        </form>

        {isRefundSubject ? (
          <form action={approveAction}>
            <input type="hidden" name="ticketId" value={ticketId} />
            <input type="hidden" name="note" id="approve-note-proxy" value="" />
            <button
              type="submit"
              disabled={pending}
              aria-busy={approvePending || undefined}
              onClick={() => {
                const proxy = document.getElementById(
                  "approve-note-proxy"
                ) as HTMLInputElement | null;
                if (proxy) proxy.value = readNote();
              }}
              className="inline-flex h-10 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {approvePending ? (
                <BrandPendingLabel label="Approving…" />
              ) : (
                "Approve refund (credit once)"
              )}
            </button>
          </form>
        ) : (
          <form action={resolveAction}>
            <input type="hidden" name="ticketId" value={ticketId} />
            <input type="hidden" name="note" id="resolve-note-proxy" value="" />
            <button
              type="submit"
              disabled={pending}
              aria-busy={resolvePending || undefined}
              onClick={() => {
                const proxy = document.getElementById(
                  "resolve-note-proxy"
                ) as HTMLInputElement | null;
                if (proxy) proxy.value = readNote();
              }}
              className="inline-flex h-10 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-ink)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {resolvePending ? (
                <BrandPendingLabel label="Saving…" />
              ) : (
                "Mark resolved"
              )}
            </button>
          </form>
        )}

        <form id="support-ticket-reject" action={rejectAction}>
          <input type="hidden" name="ticketId" value={ticketId} />
          <button
            type="submit"
            disabled={pending}
            aria-busy={rejectPending || undefined}
            className="inline-flex h-10 items-center rounded-xl border border-[var(--danger-border)] px-4 text-sm font-semibold text-[var(--danger-text)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {rejectPending ? (
              <BrandPendingLabel label="Rejecting…" />
            ) : (
              "Reject"
            )}
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
