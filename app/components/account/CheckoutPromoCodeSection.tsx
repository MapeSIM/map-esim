"use client";

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  applyCustomerPromoAction,
  removeCustomerPromoAction,
} from "@/app/lib/promo/promoCustomerActions";
import {
  initialPromoCheckoutState,
  type PromoCheckoutActionState,
} from "@/app/lib/promo/promoCustomerState";
import { formatUsdCents } from "@/app/lib/wallet/display";

type Props = {
  purchaseId: string;
  applied: boolean;
  code: string | null;
  originalCents: number;
  discountCents: number;
  totalCents: number;
  disabled?: boolean;
};

export default function CheckoutPromoCodeSection({
  purchaseId,
  applied,
  code,
  originalCents,
  discountCents,
  totalCents,
  disabled = false,
}: Props) {
  const router = useRouter();
  const headingId = useId();
  const inputId = useId();
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const [applyState, applyAction, applyPending] = useActionState(
    applyCustomerPromoAction,
    initialPromoCheckoutState
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeCustomerPromoAction,
    initialPromoCheckoutState
  );
  const applyWasPending = useRef(false);
  const removeWasPending = useRef(false);
  const applyResult = applyState as PromoCheckoutActionState;
  const removeResult = removeState as PromoCheckoutActionState;
  const busy = applyPending || removePending || disabled;

  useEffect(() => {
    if (applyWasPending.current && !applyPending && applyResult.ok === true) {
      router.refresh();
    }
    applyWasPending.current = applyPending;
  }, [applyResult, applyPending, router]);

  useEffect(() => {
    if (removeWasPending.current && !removePending && removeResult.ok === true) {
      router.refresh();
    }
    removeWasPending.current = removePending;
  }, [removeResult, removePending, router]);

  const applyError =
    applyResult.ok === false ? applyResult.error : null;
  const removeError =
    removeResult.ok === false ? removeResult.error : null;

  function onPromoInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const submitter = applyButtonRef.current;
    const form = event.currentTarget.form;
    if (!form || !submitter || submitter.disabled) return;
    form.requestSubmit(submitter);
  }

  return (
    <section
      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
      aria-labelledby={headingId}
    >
      <h2
        id={headingId}
        className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
      >
        Promo code
      </h2>

      {applied ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm font-semibold text-[var(--heading)]" role="status">
            Promo applied{code ? ` · ${code}` : ""}
          </p>
          <dl className="text-sm">
            <div className="grid gap-1 py-1 sm:grid-cols-[140px_1fr]">
              <dt className="text-[var(--text-muted)]">Original</dt>
              <dd className="font-medium text-[var(--heading)]">
                {formatUsdCents(originalCents)}
              </dd>
            </div>
            <div className="grid gap-1 py-1 sm:grid-cols-[140px_1fr]">
              <dt className="text-[var(--text-muted)]">Discount</dt>
              <dd className="font-medium text-[var(--heading)]">
                −{formatUsdCents(discountCents)}
              </dd>
            </div>
            <div className="grid gap-1 py-1 sm:grid-cols-[140px_1fr]">
              <dt className="text-[var(--text-muted)]">Package total</dt>
              <dd className="font-semibold text-[var(--heading)]">
                {formatUsdCents(totalCents)}
              </dd>
            </div>
          </dl>
          <input type="hidden" name="purchaseId" value={purchaseId} />
          <button
            type="submit"
            formAction={removeAction}
            disabled={busy}
            className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline disabled:opacity-60"
          >
            {removePending ? "Removing…" : "Remove promo"}
          </button>
          {removeError ? (
            <p className="text-sm text-[var(--heading)]" role="alert">
              {removeError}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <input type="hidden" name="purchaseId" value={purchaseId} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={inputId} className="sr-only">
              Enter promo code
            </label>
            <input
              id={inputId}
              name="promoCode"
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={30}
              disabled={busy}
              placeholder="Enter code"
              onKeyDown={onPromoInputKeyDown}
              className="min-w-0 flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm uppercase text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            />
            <button
              ref={applyButtonRef}
              type="submit"
              formAction={applyAction}
              disabled={busy}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-ink)] disabled:opacity-60"
            >
              {applyPending ? "Applying…" : "Apply"}
            </button>
          </div>
          {applyError ? (
            <p className="text-sm text-[var(--heading)]" role="alert">
              {applyError}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
