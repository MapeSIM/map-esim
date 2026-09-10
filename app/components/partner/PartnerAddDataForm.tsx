"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { startPartnerAddDataCheckoutAction } from "@/app/lib/partner/partnerPurchaseActions";
import {
  initialPartnerPurchaseActionState,
  type PartnerPurchaseActionState,
} from "@/app/lib/partner/partnerPurchaseFormState";

type Props = {
  /** MAP local order id only — never VeSIM provider ids. */
  orderId: string;
};

export default function PartnerAddDataForm({ orderId }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    startPartnerAddDataCheckoutAction,
    initialPartnerPurchaseActionState
  );
  const result = state as PartnerPurchaseActionState;

  useEffect(() => {
    if (
      result.ok === true &&
      (result.kind === "success" || result.kind === "duplicate_success")
    ) {
      router.push("/partner/orders");
      router.refresh();
    }
  }, [result, router]);

  const errorMessage =
    result.ok === false
      ? result.message
      : null;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="orderId" value={orderId} />

      {errorMessage ? (
        <p
          className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-sm text-[var(--danger-text)]"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      {result.ok === true &&
      (result.kind === "success" || result.kind === "duplicate_success") ? (
        <p
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)]"
          role="status"
        >
          {result.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Processing…" : "Confirm Add More Data"}
      </button>
    </form>
  );
}
