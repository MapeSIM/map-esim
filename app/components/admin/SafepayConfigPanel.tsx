"use client";

import { useState } from "react";
import { AdminButton, AdminStatusPill } from "@/app/components/admin/ui";

type SafepayConfigProps = {
  initial: {
    enabled: boolean;
    updatedAt: string | null;
    updatedByEmail: string | null;
  };
};

export function SafepayConfigPanel({ initial }: SafepayConfigProps) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function toggleSafepay() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/operations/safepay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setEnabled(data.enabled);
        setMessage("Safepay status updated successfully!");
      } else {
        setMessage(data.error || "Failed to update Safepay configuration.");
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
            Safepay Payment Gateway (Cards)
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Enable or disable Credit/Debit card checkout via Safepay.
          </p>
        </div>
        <AdminStatusPill value={enabled ? "ENABLED" : "DISABLED"}>
          {enabled ? "ENABLED" : "DISABLED"}
        </AdminStatusPill>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
        <span className="text-sm font-medium text-[var(--heading)]">
          Status: {enabled ? "Live on Checkout" : "Hidden from Checkout"}
        </span>
        <AdminButton
          type="button"
          onClick={toggleSafepay}
          disabled={loading}
          variant={enabled ? "destructive" : "primary"}
          size="sm"
        >
          {loading ? "Updating..." : enabled ? "Disable Safepay" : "Enable Safepay"}
        </AdminButton>
      </div>

      {message && (
        <p className="mt-3 text-xs font-medium text-[var(--accent-strong)]">
          {message}
        </p>
      )}
    </section>
  );
}