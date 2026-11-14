"use client";

import { useState } from "react";
import { AdminButton, AdminStatusPill } from "@/app/components/admin/ui";

type GuestCheckoutConfigProps = {
  initial: {
    enabled: boolean;
    updatedAt: string | null;
  };
};

export function GuestCheckoutConfigPanel({
  initial,
}: GuestCheckoutConfigProps) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function toggleGuestCheckout() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/operations/guest-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.success) {
        setEnabled(Boolean(data.enabled));
        setMessage(
          data.enabled
            ? "Guest checkout is now ON."
            : "Guest checkout is now OFF. Guests must sign in."
        );
      } else {
        setMessage(
          (data && typeof data.error === "string" && data.error) ||
            "Failed to update guest checkout."
        );
      }
    } catch {
      setMessage("An error occurred while updating.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-[var(--heading)]">
            Guest Checkout
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Allow unauthenticated visitors to use{" "}
            <span className="font-medium">/checkout</span>. When off, guests
            are asked to sign in or register. Signed-in account and partner
            purchases are unaffected.
          </p>
        </div>
        <AdminStatusPill value={enabled ? "ENABLED" : "DISABLED"}>
          {enabled ? "ON" : "OFF"}
        </AdminStatusPill>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
        <span className="text-sm font-medium text-[var(--heading)]">
          Status:{" "}
          {enabled
            ? "Guest checkout available"
            : "Guests must sign in / register"}
        </span>
        <AdminButton
          type="button"
          onClick={toggleGuestCheckout}
          disabled={loading}
          variant="secondary"
          size="sm"
        >
          {loading
            ? "Updating..."
            : enabled
              ? "Turn Guest Checkout OFF"
              : "Turn Guest Checkout ON"}
        </AdminButton>
      </div>

      {message ? (
        <p className="mt-3 text-xs font-medium text-[var(--accent-strong)]">
          {message}
        </p>
      ) : null}
    </section>
  );
}
