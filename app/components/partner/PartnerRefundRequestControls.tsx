"use client";

import { useActionState, useEffect, useState } from "react";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";
import {
  createPartnerRefundRequestAction,
  type PartnerRefundRequestFormState,
} from "@/app/lib/partner/partnerRefundRequestActions";
import {
  PARTNER_REFUND_NOTE_MAX,
  PARTNER_REFUND_REQUEST_REASONS,
  partnerRefundReasonLabel,
} from "@/app/lib/partner/partnerRefundRequestConstants";

const initialState: PartnerRefundRequestFormState = null;

export type PartnerRefundRequestCardState = {
  statusLabel: string;
  reasonLabel: string;
  createdAtLabel: string;
} | null;

type Props = {
  purchaseId: string;
  partnerDebitLabel: string;
  alreadyRefunded: boolean;
  existingRequest: PartnerRefundRequestCardState;
};

export default function PartnerRefundRequestControls({
  purchaseId,
  partnerDebitLabel,
  alreadyRefunded,
  existingRequest,
}: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(
    createPartnerRefundRequestAction,
    initialState
  );

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  if (alreadyRefunded) {
    return (
      <p className="text-sm text-[var(--text-muted)]" role="status">
        Balance returned
      </p>
    );
  }

  if (existingRequest) {
    return (
      <section
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
        aria-label="Refund request status"
      >
        <p className="text-sm font-semibold text-[var(--heading)]">
          Refund requested
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {existingRequest.statusLabel} · {existingRequest.reasonLabel}
        </p>
        <p className="mt-1 text-xs text-[var(--text-soft)]">
          Submitted {existingRequest.createdAtLabel}
        </p>
      </section>
    );
  }

  return (
    <div className="min-w-0">
      {state?.ok ? (
        <p className="text-sm font-semibold text-[var(--heading)]" role="status">
          {state.message}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--page-bg-soft)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] sm:w-auto"
        >
          Request Refund
        </button>
      )}

      <EsimActionSheet
        open={open}
        title="Request Refund"
        onClose={() => {
          if (!pending) setOpen(false);
        }}
      >
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="purchaseId" value={purchaseId} />
          <p className="text-sm text-[var(--text-muted)]">
            Submitting a request does not automatically issue a refund. MAP eSIM
            will review the order and provider status first.
          </p>
          <p className="text-sm text-[var(--heading)]">
            Amount paid:{" "}
            <span className="font-semibold tabular-nums">{partnerDebitLabel}</span>
          </p>

          <div>
            <label
              htmlFor={`partner-refund-reason-${purchaseId}`}
              className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
            >
              Reason
            </label>
            <select
              id={`partner-refund-reason-${purchaseId}`}
              name="reason"
              required
              disabled={pending}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
            >
              <option value="" disabled>
                Select a reason
              </option>
              {PARTNER_REFUND_REQUEST_REASONS.map((code) => (
                <option key={code} value={code}>
                  {partnerRefundReasonLabel(code)}
                </option>
              ))}
            </select>
            {state && !state.ok && state.fieldErrors?.reason ? (
              <p className="mt-1 text-sm text-[var(--danger-text)]">
                {state.fieldErrors.reason}
              </p>
            ) : null}
          </div>

          {reason === "INSTALL_DETAILS_UNAVAILABLE" ? (
            <p className="text-sm text-[var(--text-muted)]">
              If installation details can be recovered from the provider, the
              eSIM will be restored instead of refunded.
            </p>
          ) : null}

          <div>
            <label
              htmlFor={`partner-refund-note-${purchaseId}`}
              className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
            >
              Short explanation (optional)
            </label>
            <textarea
              id={`partner-refund-note-${purchaseId}`}
              name="partnerNote"
              maxLength={PARTNER_REFUND_NOTE_MAX}
              rows={3}
              disabled={pending}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
              placeholder="Optional details for the review team"
            />
            {state && !state.ok && state.fieldErrors?.partnerNote ? (
              <p className="mt-1 text-sm text-[var(--danger-text)]">
                {state.fieldErrors.partnerNote}
              </p>
            ) : null}
          </div>

          {state && !state.ok && state.error && !state.fieldErrors ? (
            <p className="text-sm text-[var(--danger-text)]" role="alert">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--accent-strong)] px-4 text-sm font-semibold text-[var(--accent-ink)] outline-none hover:bg-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
          >
            {pending ? "Submitting…" : "Submit request"}
          </button>
        </form>
      </EsimActionSheet>
    </div>
  );
}
