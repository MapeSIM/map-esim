"use client";

import { useActionState } from "react";
import { startCustomerAddDataCheckoutAction } from "@/app/lib/esim/walletPurchaseActions";

type Props = {
  /** MAP local order id only — never VeSIM provider ids. */
  orderId: string;
};

/**
 * Client wrapper so Add More Data start disables while the server action runs.
 * Server action redirects on success / failure paths.
 */
export default function CustomerAddDataForm({ orderId }: Props) {
  const [, formAction, pending] = useActionState(
    startCustomerAddDataCheckoutAction,
    null
  );

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="orderId" value={orderId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Continuing…" : "Continue to checkout"}
      </button>
    </form>
  );
}
