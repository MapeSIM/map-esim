"use client";

import { useState } from "react";
import { AdminButton, AdminStatusPill } from "@/app/components/admin/ui";

type GuestCheckoutConfigProps = {
  initial: {
    enabled: boolean;
    dbEnabled?: boolean;
    envForcedOff?: boolean;
    updatedAt: string | null;
  };
};

export function GuestCheckoutConfigPanel({
  initial,
}: GuestCheckoutConfigProps) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [dbEnabled, setDbEnabled] = useState(
    initial.dbEnabled ?? initial.enabled
  );
  const envForcedOff = initial.envForcedOff === true;
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function toggleGuestCheckout() {
    if (envForcedOff) return;
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/operations/guest-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !dbEnabled }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.success) {
        const nextDb = Boolean(data.enabled);
        setDbEnabled(nextDb);
        setEnabled(nextDb);
        setMessage(
          nextDb
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

  const effectiveOn = !envForcedOff && enabled;

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
        <AdminStatusPill value={effectiveOn ? "ENABLED" : "DISABLED"}>
          {effectiveOn ? "ON" : "OFF"}
        </AdminStatusPill>
      </div>

      {envForcedOff ? (
        <p className="mt-3 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-xs font-medium text-[var(--danger-text)]">
          Emergency env kill switch is active (
          <code className="font-mono">GUEST_CHECKOUT_FORCE_OFF=true</code>
          ). Guest checkout stays OFF until that variable is removed, even if
          the admin toggle is saved as ON.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
        <span className="text-sm font-medium text-[var(--heading)]">
          Status:{" "}
          {effectiveOn
            ? "Guest checkout available"
            : "Guests must sign in / register"}
        </span>
        <AdminButton
          type="button"
          onClick={toggleGuestCheckout}
          disabled={loading || envForcedOff}
          variant="secondary"
          size="sm"
        >
          {loading
            ? "Updating..."
            : dbEnabled
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
