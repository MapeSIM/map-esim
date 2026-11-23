"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  readSandboxShareBranding,
  type SandboxShareBranding,
  SANDBOX_DEFAULT_BRANDING,
} from "@/app/lib/sandbox/sandboxClientStorage";

export default function SandboxSharePreviewClient() {
  const [branding, setBranding] = useState<SandboxShareBranding>(
    SANDBOX_DEFAULT_BRANDING
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setBranding(readSandboxShareBranding());
    setHydrated(true);
  }, []);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          White-label share preview
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Uses branding saved on Account (local to this browser).
        </p>
      </header>

      <div
        className={`overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0D1526] shadow-xl shadow-black/40 ${
          hydrated ? "" : "opacity-70"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#070D19]">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt=""
                width={44}
                height={44}
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <span className="text-sm font-black text-emerald-400">
                {(branding.companyName[0] || "M").toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-50">
              {branding.companyName}
            </p>
            <a
              href={`mailto:${branding.supportEmail}`}
              className="truncate text-xs text-slate-400 hover:text-emerald-300"
            >
              {branding.supportEmail}
            </a>
          </div>
        </div>

        <div className="space-y-4 px-5 py-6 text-center">
          <div>
            <p className="text-lg font-bold text-slate-50">Sample Plan</p>
            <p className="mt-0.5 text-sm text-slate-500">Sample destination</p>
          </div>
          <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
            Ready to install
          </span>
          <div
            className="mx-auto h-40 w-40 rounded-2xl border border-white/[0.08] bg-white p-3"
            aria-hidden="true"
          >
            <div className="h-full w-full bg-[repeating-linear-gradient(90deg,#111_0_4px,transparent_4px_8px),repeating-linear-gradient(0deg,#111_0_4px,transparent_4px_8px)] opacity-80" />
          </div>
          <button
            type="button"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold"
            style={{
              backgroundColor: branding.buttonBackground,
              color: branding.buttonTextColor,
            }}
          >
            Install eSIM
          </button>
          <p className="text-[11px] text-slate-500">
            Powered by {branding.companyName}
          </p>
        </div>
      </div>

      <p className="text-center text-sm text-slate-500">
        <Link
          href="/sandbox/account"
          className="font-semibold text-emerald-400 hover:text-emerald-300"
        >
          ← Edit branding on Account
        </Link>
      </p>
    </div>
  );
}
