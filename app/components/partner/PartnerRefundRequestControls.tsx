"use client";

import { useActionState, useEffect, useState } from "react";
import EsimActionSheet from "@/app/components/install/EsimActionSheet";
import {
  createPartnerRefundRequestAction,
  type PartnerRefundRequestFormState,
} from "@/app/lib/partner/partnerRefundRequestActions";
import {
  partnerCardClass,
  partnerQuietCtaClass,
  partnerSectionLabelClass,
} from "@/app/components/partner/partnerPortalUi";
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
  isOpen: boolean;
  isCompleted: boolean;
  decisionNote: string | null;
  refundedAmountLabel: string | null;
} | null;

type Props = {
  purchaseId: string;
  partnerDebitLabel: string;
  alreadyRefunded: boolean;
  existingRequest: PartnerRefundRequestCardState;
  embedded?: boolean;
};

export default function PartnerRefundRequestControls({
  purchaseId,
  partnerDebitLabel,
  alreadyRefunded,
  existingRequest,
  embedded = false,
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

  const shellClass = embedded
    ? "min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
    : partnerCardClass;

  if (existingRequest?.isCompleted) {
    return (
      <section className={shellClass} aria-label="Refund completed">
        <p className={partnerSectionLabelClass}>Refund</p>
        <p className="mt-3 text-sm font-semibold text-[var(--heading)]">
          {existingRequest.statusLabel}
        </p>
        {existingRequest.refundedAmountLabel ? (
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {existingRequest.refundedAmountLabel} returned to your Partner
            balance
          </p>
        ) : null}
      </section>
    );
  }

  if (alreadyRefunded) {
    return (
      <section className={shellClass} role="status">
        <p className={partnerSectionLabelClass}>Refund</p>
        <p className="mt-3 text-sm text-[var(--text-muted)]">Balance returned</p>
      </section>
    );
  }

  const showButton = !existingRequest?.isOpen;

  return (
    <section className={shellClass} aria-label="Refund request status">
      <p className={partnerSectionLabelClass}>Refund</p>
      <h3 className="mt-2 text-base font-semibold tracking-tight text-[var(--heading)]">
        Refund request
      </h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Requests are reviewed before any balance is returned.
      </p>

      {existingRequest ? (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--heading)]">
            {existingRequest.statusLabel}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {existingRequest.reasonLabel}
          </p>
          {existingRequest.decisionNote ? (
            <p className="mt-1 break-words text-sm text-[var(--text-muted)]">
              {existingRequest.decisionNote}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-[var(--text-soft)]">
            Submitted {existingRequest.createdAtLabel}
          </p>
        </div>
      ) : null}

      {showButton ? (
        <div className="mt-4">
          {state?.ok ? (
            <p className="text-sm font-semibold text-[var(--heading)]" role="status">
              {state.message}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`${partnerQuietCtaClass} sm:w-auto`}
            >
              Request Refund
            </button>
          )}
        </div>
      ) : null}

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
    </section>
  );
}
