"use client";

import { useActionState, useEffect, useId } from "react";
import {
  cancelWhatsAppCheckoutOrderAction,
  fulfillWhatsAppCheckoutOrderAction,
  type WhatsAppFulfillFormState,
} from "@/app/lib/admin/whatsappCheckoutFulfillmentActions";
import type { WhatsAppPendingOrderListItem } from "@/app/lib/admin/whatsappCheckoutFulfillment";

function ActionMessage({ state }: { state: WhatsAppFulfillFormState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p
        className="text-sm font-medium text-[var(--accent-strong)]"
        role="status"
      >
        {state.message}
      </p>
    );
  }
  return (
    <p className="text-sm font-medium text-red-700 dark:text-red-300" role="alert">
      {state.error}
    </p>
  );
}

function RowActions({ orderId }: { orderId: string }) {
  const formId = useId();
  const [fulfillState, fulfillAction, fulfillPending] = useActionState(
    fulfillWhatsAppCheckoutOrderAction,
    null
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelWhatsAppCheckoutOrderAction,
    null
  );
  const busy = fulfillPending || cancelPending;

  useEffect(() => {
    if (fulfillState?.ok || cancelState?.ok) {
      // Soft refresh after success so the row drops from pending list.
      try {
        window.location.reload();
      } catch {
        // ignore
      }
    }
  }, [fulfillState, cancelState]);

  return (
    <div className="space-y-2">
      <form action={fulfillAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="whatsappOrderId" value={orderId} />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--accent-strong)] px-3 py-2 text-xs font-semibold text-[var(--accent-ink)] transition hover:opacity-95 disabled:opacity-60"
        >
          {fulfillPending ? "Issuing eSIM…" : "Verify Payment & Issue eSIM"}
        </button>
      </form>
      <form action={cancelAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="whatsappOrderId" value={orderId} />
        <label className="sr-only" htmlFor={`${formId}-reason`}>
          Cancel reason
        </label>
        <input
          id={`${formId}-reason`}
          name="reason"
          type="text"
          disabled={busy}
          placeholder="Cancel reason (optional)"
          className="min-w-[10rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-xs"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] disabled:opacity-60"
        >
          {cancelPending ? "Cancelling…" : "Cancel / Reject"}
        </button>
      </form>
      <ActionMessage state={fulfillState} />
      <ActionMessage state={cancelState} />
    </div>
  );
}

export function WhatsAppPendingOrdersPanel({
  orders,
}: {
  orders: WhatsAppPendingOrderListItem[];
}) {
  if (orders.length === 0) {
    return (
      <div
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-8"
        role="status"
      >
        <p className="text-sm font-medium text-[var(--heading)]">
          No WhatsApp pending orders right now.
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          New Buy via WhatsApp checkouts appear here as WHATSAPP_PENDING.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-[var(--surface-2)] text-xs uppercase tracking-[0.06em] text-[var(--text-soft)]">
          <tr>
            <th className="px-4 py-3 font-semibold">Reference</th>
            <th className="px-4 py-3 font-semibold">Customer</th>
            <th className="px-4 py-3 font-semibold">Package</th>
            <th className="px-4 py-3 font-semibold">Price</th>
            <th className="px-4 py-3 font-semibold">Created</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr
              key={order.id}
              className="border-t border-[var(--border)] align-top"
            >
              <td className="px-4 py-3 font-semibold text-[var(--heading)]">
                {order.reference}
                <div className="mt-0.5 text-[11px] font-normal text-[var(--text-soft)]">
                  {order.paymentMethod}
                </div>
              </td>
              <td className="px-4 py-3 text-[var(--heading)]">
                {order.customerEmail}
              </td>
              <td className="px-4 py-3 text-[var(--heading)]">
                <div className="font-medium">{order.planName}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {order.destination}
                </div>
              </td>
              <td className="px-4 py-3 font-medium text-[var(--heading)]">
                {order.amountLabel}
              </td>
              <td className="px-4 py-3 text-[var(--text-muted)]">
                {order.createdAtLabel}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--heading)]">
                  {order.status}
                </span>
              </td>
              <td className="px-4 py-3">
                <RowActions orderId={order.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
