"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  clearWalletPurchaseAlternateDeliveryEmailAction,
  saveWalletPurchaseAlternateDeliveryEmailAction,
} from "@/app/lib/esim/walletPurchaseActions";
import {
  ALTERNATE_DELIVERY_EMAIL_COPY,
  ALTERNATE_DELIVERY_EMAIL_MAX_LENGTH,
} from "@/app/lib/esim/esimDeliveryEmail";
import {
  initialDeliveryEmailActionState,
  type DeliveryEmailActionState,
} from "@/app/lib/esim/esimDeliveryEmailFormState";

type Props = {
  purchaseId: string;
  accountEmail: string;
  savedAlternateEmail: string | null;
  editable: boolean;
  disabled?: boolean;
  onBlockingChange?: (blocked: boolean) => void;
};

export default function CheckoutDeliveryEmailSection({
  purchaseId,
  accountEmail,
  savedAlternateEmail,
  editable,
  disabled = false,
  onBlockingChange,
}: Props) {
  const router = useRouter();
  const optionId = useId();
  const emailId = useId();
  const confirmId = useId();
  const attestId = useId();
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const [saveState, saveAction, savePending] = useActionState(
    saveWalletPurchaseAlternateDeliveryEmailAction,
    initialDeliveryEmailActionState
  );
  const [clearState, clearAction, clearPending] = useActionState(
    clearWalletPurchaseAlternateDeliveryEmailAction,
    initialDeliveryEmailActionState
  );
  const saveWasPending = useRef(false);
  const clearWasPending = useRef(false);
  const [editing, setEditing] = useState(!savedAlternateEmail);
  const [useAlternate, setUseAlternate] = useState(Boolean(savedAlternateEmail));
  const [deliveryEmail, setDeliveryEmail] = useState(savedAlternateEmail ?? "");
  const [confirmEmail, setConfirmEmail] = useState(savedAlternateEmail ?? "");
  const [attested, setAttested] = useState(false);

  useEffect(() => {
    if (saveWasPending.current && !savePending && saveState.ok === true) {
      router.refresh();
    }
    saveWasPending.current = savePending;
  }, [saveState, savePending, router]);

  useEffect(() => {
    if (clearWasPending.current && !clearPending && clearState.ok === true) {
      router.refresh();
    }
    clearWasPending.current = clearPending;
  }, [clearState, clearPending, router]);

  const saveResult = saveState as DeliveryEmailActionState;
  const clearResult = clearState as DeliveryEmailActionState;
  const busy = savePending || clearPending || disabled || !editable;
  const saveError = saveResult.ok === false ? saveResult.error : null;
  const clearError = clearResult.ok === false ? clearResult.error : null;
  const formOpen = useAlternate && editing;
  const blocked =
    editable &&
    (savePending ||
      clearPending ||
      (useAlternate && !savedAlternateEmail) ||
      (Boolean(savedAlternateEmail) && editing));

  useEffect(() => {
    onBlockingChange?.(blocked);
  }, [blocked, onBlockingChange]);

  if (!editable && !savedAlternateEmail) {
    return null;
  }

  function onEmailKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const submitter = saveButtonRef.current;
    const form = event.currentTarget.form;
    if (!form || !submitter || submitter.disabled) return;
    form.requestSubmit(submitter);
  }

  return (
    <div className="mt-4 min-w-0 border-t border-[var(--border)] pt-4">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      {savedAlternateEmail && !editing ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--heading)] break-words">
            {ALTERNATE_DELIVERY_EMAIL_COPY.savedPrefix}{" "}
            <span className="font-semibold">{savedAlternateEmail}</span>
          </p>
          {editable ? (
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(true);
                  setUseAlternate(true);
                  setDeliveryEmail(savedAlternateEmail);
                  setConfirmEmail(savedAlternateEmail);
                  setAttested(false);
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] disabled:opacity-60 sm:w-auto"
              >
                {ALTERNATE_DELIVERY_EMAIL_COPY.change}
              </button>
              <button
                type="submit"
                formAction={clearAction}
                disabled={busy}
                className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] disabled:opacity-60 sm:w-auto"
              >
                {clearPending
                  ? "Updating…"
                  : ALTERNATE_DELIVERY_EMAIL_COPY.useAccount}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <label
            htmlFor={optionId}
            className="flex min-w-0 items-start gap-3 text-sm text-[var(--heading)]"
          >
            <input
              id={optionId}
              name="useAlternateDeliveryEmail"
              type="checkbox"
              checked={useAlternate}
              onChange={(event) => {
                const next = event.target.checked;
                setUseAlternate(next);
                setEditing(true);
                if (!next) {
                  setDeliveryEmail("");
                  setConfirmEmail("");
                  setAttested(false);
                }
              }}
              disabled={busy}
              className="mt-1 shrink-0"
            />
            <span className="min-w-0">
              {ALTERNATE_DELIVERY_EMAIL_COPY.option}
            </span>
          </label>
        </>
      )}

      {formOpen ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-[var(--text-muted)]">
            {ALTERNATE_DELIVERY_EMAIL_COPY.unverified} Billing, payment, refund,
            and security emails stay on {accountEmail}.
          </p>
          <div className="grid min-w-0 gap-3">
            <label htmlFor={emailId} className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                {ALTERNATE_DELIVERY_EMAIL_COPY.deliveryEmail}
              </span>
              <input
                id={emailId}
                name="deliveryEmail"
                type="email"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                maxLength={ALTERNATE_DELIVERY_EMAIL_MAX_LENGTH}
                value={deliveryEmail}
                onChange={(event) => setDeliveryEmail(event.target.value)}
                onKeyDown={onEmailKeyDown}
                disabled={busy}
                className="h-11 w-full min-w-0 rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--heading)]"
              />
            </label>
            <label htmlFor={confirmId} className="min-w-0 text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
                {ALTERNATE_DELIVERY_EMAIL_COPY.confirmDeliveryEmail}
              </span>
              <input
                id={confirmId}
                name="deliveryEmailConfirm"
                type="email"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                maxLength={ALTERNATE_DELIVERY_EMAIL_MAX_LENGTH}
                value={confirmEmail}
                onChange={(event) => setConfirmEmail(event.target.value)}
                onKeyDown={onEmailKeyDown}
                disabled={busy}
                className="h-11 w-full min-w-0 rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--heading)]"
              />
            </label>
          </div>
          <label
            htmlFor={attestId}
            className="flex min-w-0 items-start gap-3 text-sm text-[var(--heading)]"
          >
            <input
              id={attestId}
              name="deliveryEmailAttestation"
              type="checkbox"
              value="on"
              checked={attested}
              onChange={(event) => setAttested(event.target.checked)}
              disabled={busy}
              className="mt-1 shrink-0"
            />
            <span className="min-w-0">
              {ALTERNATE_DELIVERY_EMAIL_COPY.attestation}
            </span>
          </label>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
            <button
              ref={saveButtonRef}
              type="submit"
              formAction={saveAction}
              disabled={busy || !attested}
              className="inline-flex h-11 w-full items-center justify-center rounded-[14px] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] disabled:opacity-60 sm:w-auto"
            >
              {savePending ? "Saving…" : "Save delivery email"}
            </button>
            {savedAlternateEmail ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setUseAlternate(true);
                  setDeliveryEmail(savedAlternateEmail);
                  setConfirmEmail(savedAlternateEmail);
                  setAttested(false);
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] disabled:opacity-60 sm:w-auto"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {saveError || clearError ? (
        <p className="mt-3 text-sm text-[var(--heading)]" role="alert">
          {saveError || clearError}
        </p>
      ) : null}
    </div>
  );
}
