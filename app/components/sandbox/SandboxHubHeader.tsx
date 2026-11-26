"use client";

import Link from "next/link";
import { useTransition } from "react";
import { signOutAction } from "@/app/lib/auth/actions";
import { sandboxPartnerLogoutAction } from "@/app/lib/sandbox/sandboxPartnerActions";
import BrandPendingLabel from "@/app/components/loading/BrandPendingLabel";

type Props = {
  mode: "admin" | "partner";
  email: string;
  name?: string | null;
};

export default function SandboxHubHeader({ mode, email, name }: Props) {
  const [pending, startTransition] = useTransition();

  function onSignOut() {
    startTransition(async () => {
      if (mode === "admin") {
        await signOutAction();
        return;
      }
      await sandboxPartnerLogoutAction();
      window.location.href = "/sandbox";
    });
  }

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#0D1526] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              mode === "admin"
                ? "inline-flex rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-amber-200"
                : "inline-flex rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-emerald-300"
            }
          >
            {mode === "admin" ? "Admin" : "Sandbox Partner"}
          </span>
          <p className="truncate text-sm font-medium text-slate-200">
            {name?.trim() || email}
          </p>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">{email}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {mode === "admin" ? (
          <Link
            href="/sandbox/admin"
            className="inline-flex h-9 items-center rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-semibold text-amber-100 hover:bg-amber-500/20"
          >
            Admin Console
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onSignOut}
          disabled={pending}
          className="inline-flex h-9 items-center rounded-xl border border-white/[0.12] px-3 text-xs font-semibold text-slate-200 hover:bg-white/[0.04] disabled:opacity-60"
        >
          {pending ? <BrandPendingLabel label="Signing out…" /> : "Sign Out"}
        </button>
      </div>
    </div>
  );
}
