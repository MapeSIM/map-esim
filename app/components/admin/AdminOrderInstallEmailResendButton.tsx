"use client";

import { useActionState } from "react";
import {
  resendOrderInstallEmailAction,
  type OrderInstallEmailResendFormState,
} from "@/app/lib/admin/orderInstallEmailResendActions";

/**
 * Admin Order Detail: resend installation email (QR + instructions).
 * Inline status + toast; never touches customer-facing pages.
 */
export default function AdminOrderInstallEmailResendButton({
  orderId,
  customerEmailLabel,
}: {
  orderId: string;
  customerEmailLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    resendOrderInstallEmailAction,
    null as OrderInstallEmailResendFormState
  );

  const toast = pending
    ? ({
        kind: "loading" as const,
        message: "Sending installation email…",
      } as const)
    : state?.ok
      ? ({ kind: "success" as const, message: state.message } as const)
      : state && !state.ok
        ? ({ kind: "error" as const, message: state.error } as const)
        : null;

  return (
    <div className="space-y-2">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="orderId" value={orderId} />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] shadow-[0_8px_16px_rgba(0,0,0,0.14)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
          data-admin-order-install-resend="true"
        >
          {pending ? "Sending…" : "Resend Installation Email / QR"}
        </button>
      </form>
      <p className="text-xs leading-snug text-[var(--text-muted)]">
        Sends the eSIM install email (QR + instructions) to{" "}
        <span className="font-semibold text-[var(--heading)]">
          {customerEmailLabel}
        </span>
        . Safe retry — does not re-charge or recreate the order.
      </p>
      {state?.ok ? (
        <p
          className="text-xs font-medium text-[var(--accent-strong)]"
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      {state && !state.ok ? (
        <p
          className="text-xs font-medium text-[var(--danger-text)]"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

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
