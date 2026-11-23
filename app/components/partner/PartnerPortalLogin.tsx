"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  signinAction,
  type AuthActionState,
} from "@/app/lib/auth/actions";
import BrandPendingLabel from "@/app/components/loading/BrandPendingLabel";
import { RETAIL_SITE_ORIGIN } from "@/app/lib/domain/appDomain";
import {
  sandboxPartnerLoginAction,
  type SandboxActionState,
} from "@/app/lib/sandbox/sandboxPartnerActions";
import { SANDBOX_API_KEY_KEY } from "@/app/lib/sandbox/sandboxClientStorage";

const initialAuthState: AuthActionState = { ok: false };
const initialSandboxState: SandboxActionState = { ok: false };

type Props = {
  /** Real Auth.js partner sign-in vs Neon sandbox partner login. */
  mode: "partner" | "sandbox";
  callbackUrl?: string;
  retailHref?: string;
  applyHref?: string;
  onSandboxAuthenticated?: () => void;
};

export default function PartnerPortalLogin({
  mode,
  callbackUrl = "/",
  retailHref = RETAIL_SITE_ORIGIN,
  applyHref = "/contact?topic=partner",
  onSandboxAuthenticated,
}: Props) {
  const [partnerState, partnerAction, partnerPending] = useActionState(
    signinAction,
    initialAuthState
  );
  const [sandboxState, sandboxAction, sandboxPending] = useActionState(
    sandboxPartnerLoginAction,
    initialSandboxState
  );

  const error =
    mode === "sandbox"
      ? sandboxState.ok
        ? null
        : sandboxState.error || null
      : partnerState.ok
        ? null
        : partnerState.error || null;

  useEffect(() => {
    if (mode !== "sandbox" || !sandboxState.ok) return;
    try {
      if (sandboxState.rawApiKey) {
        localStorage.setItem(SANDBOX_API_KEY_KEY, sandboxState.rawApiKey);
      }
      localStorage.setItem(
        "mapesim_sandbox_session",
        JSON.stringify({
          id: sandboxState.partnerId,
          at: Date.now(),
        })
      );
    } catch {
      /* ignore */
    }
    onSandboxAuthenticated?.();
    window.location.href = "/sandbox";
  }, [mode, sandboxState, onSandboxAuthenticated]);

  const busy = mode === "sandbox" ? sandboxPending : partnerPending;

  return (
    <div className="min-h-screen w-full bg-[#070D19] text-slate-100">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-xs font-black text-slate-950">
              M
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-50">
              MAP eSIM{" "}
              <span className="font-medium text-slate-400">Partner</span>
            </span>
          </div>
          <span className="text-sm font-semibold text-emerald-400">Sign in</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col px-4 py-12 sm:px-6 sm:py-16">
        <div className="rounded-2xl border border-white/[0.08] bg-[#0D1526] p-6 shadow-2xl shadow-black/40 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {mode === "sandbox"
              ? "Sign in with your sandbox partner credentials"
              : "Sign in with your partner credentials"}
          </p>

          {error ? (
            <div
              className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100"
              role="alert"
            >
              <p>{error}</p>
              {mode === "sandbox" ? (
                <p className="mt-2 text-xs text-slate-400">
                  Need an account? Ask an admin to create one at{" "}
                  <Link
                    href="/sandbox/admin"
                    className="font-semibold text-emerald-300 underline-offset-2 hover:underline"
                  >
                    /sandbox/admin
                  </Link>
                  .
                </p>
              ) : error.toLowerCase().includes("mapesim.com") ||
                error.toLowerCase().includes("partner account") ? (
                <p className="mt-2 space-x-3 text-xs">
                  <a
                    href={retailHref}
                    className="font-semibold text-emerald-300 underline-offset-2 hover:underline"
                  >
                    Go to mapesim.com
                  </a>
                  <Link
                    href={applyHref}
                    className="font-semibold text-emerald-300 underline-offset-2 hover:underline"
                  >
                    Apply for Partner Account
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}

          <form
            className="mt-6 space-y-4"
            action={mode === "partner" ? partnerAction : sandboxAction}
          >
            {mode === "partner" ? (
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
            ) : null}
            {mode === "partner" ? (
              <input type="hidden" name="partnerPortal" value="1" />
            ) : null}

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-200">Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="h-11 w-full rounded-xl border border-white/[0.1] bg-[#070D19] px-3 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
              />
            </label>

            <label className="block space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-200">
                  Password
                </span>
                {mode === "partner" ? (
                  <Link
                    href="/forgot-password"
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    Forgot password?
                  </Link>
                ) : null}
              </div>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-11 w-full rounded-xl border border-white/[0.1] bg-[#070D19] px-3 text-sm text-slate-100 outline-none focus:border-emerald-500/50"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {busy ? (
                <BrandPendingLabel label="Signing in…" />
              ) : (
                "Sign In →"
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
