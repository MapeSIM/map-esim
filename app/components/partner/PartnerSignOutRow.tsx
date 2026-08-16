"use client";

import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/lib/auth/actions";

export default function PartnerSignOutRow() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 text-left transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
      >
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--danger-text)]">
          <LogOut className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-[var(--heading)]">
            Sign Out
          </span>
          <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
            End this Partner session
          </span>
        </span>
      </button>
    </form>
  );
}
