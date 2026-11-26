"use client";

import { Eye, EyeOff } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import BrandPendingLabel from "@/app/components/loading/BrandPendingLabel";
import {
  createSandboxPartnerAction,
  deleteSandboxPartnerAction,
  resetAllSandboxDiscountsAction,
  resetSandboxDemoAction,
  setGlobalSandboxApiEnabledAction,
  setSandboxBalanceAction,
  setSandboxPartnerApiEnabledAction,
  setSandboxPartnerDiscountAction,
  topUpSandboxBalanceAction,
  type SandboxActionState,
} from "@/app/lib/sandbox/sandboxPartnerActions";
import { SANDBOX_DEFAULT_DISCOUNT_PERCENT } from "@/app/lib/sandbox/sandboxPricing";
import type { SandboxPartnerPublic } from "@/app/lib/sandbox/sandboxPartnerTypes";

const empty: SandboxActionState = { ok: false };

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function Message({ state }: { state: SandboxActionState }) {
  if (!state || (!state.message && !state.error)) return null;
  if (state.ok) {
    return (
      <div
        className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
        role="status"
      >
        <p>{state.message}</p>
        {state.rawApiKey ? (
          <p className="mt-2 break-all font-mono text-xs text-emerald-200">
            API key (copy now): {state.rawApiKey}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <p className="mt-3 text-sm text-rose-300" role="alert">
      {state.error}
    </p>
  );
}

export default function SandboxAdminPanel({
  initialPartners,
  globalSandboxApiEnabled,
}: {
  initialPartners: SandboxPartnerPublic[];
  globalSandboxApiEnabled: boolean;
}) {
  const [partners, setPartners] = useState(initialPartners);
  const [globalOn, setGlobalOn] = useState(globalSandboxApiEnabled);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createState, createAction, createPending] = useActionState(
    createSandboxPartnerAction,
    empty
  );
  const [balanceState, balanceAction, balancePending] = useActionState(
    setSandboxBalanceAction,
    empty
  );
  const [topUpState, topUpAction, topUpPending] = useActionState(
    topUpSandboxBalanceAction,
    empty
  );
  const [resetState, resetAction, resetPending] = useActionState(
    resetSandboxDemoAction,
    empty
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteSandboxPartnerAction,
    empty
  );
  const [globalState, globalAction, globalPending] = useActionState(
    setGlobalSandboxApiEnabledAction,
    empty
  );
  const [partnerApiState, partnerApiAction, partnerApiPending] = useActionState(
    setSandboxPartnerApiEnabledAction,
    empty
  );
  const [discountState, discountAction, discountPending] = useActionState(
    setSandboxPartnerDiscountAction,
    empty
  );
  const [resetDiscountState, resetDiscountAction, resetDiscountPending] =
    useActionState(resetAllSandboxDiscountsAction, empty);

  useEffect(() => {
    setPartners(initialPartners);
  }, [initialPartners]);

  useEffect(() => {
    setGlobalOn(globalSandboxApiEnabled);
  }, [globalSandboxApiEnabled]);

  useEffect(() => {
    if (
      createState.ok ||
      balanceState.ok ||
      topUpState.ok ||
      resetState.ok ||
      deleteState.ok ||
      globalState.ok ||
      partnerApiState.ok ||
      discountState.ok ||
      resetDiscountState.ok
    ) {
      window.location.reload();
    }
  }, [
    createState,
    balanceState,
    topUpState,
    resetState,
    deleteState,
    globalState,
    partnerApiState,
    discountState,
    resetDiscountState,
  ]);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/[0.08] bg-[#0D1526] p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-50">
              Global Sandbox API
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Master switch for all{" "}
              <code className="text-slate-300">/api/sandbox/v1/*</code> traffic.
              When OFF, partners cannot see API docs/keys and calls return 503.
            </p>
          </div>
          <form action={globalAction} className="shrink-0">
            <input
              type="hidden"
              name="enabled"
              value={globalOn ? "0" : "1"}
            />
            <button
              type="submit"
              disabled={globalPending}
              className={
                globalOn
                  ? "inline-flex h-10 items-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                  : "inline-flex h-10 items-center rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 text-sm font-bold text-rose-100 hover:bg-rose-500/20 disabled:opacity-60"
              }
            >
              {globalPending ? (
                <BrandPendingLabel label="Updating…" />
              ) : globalOn ? (
                "API ON — turn OFF"
              ) : (
                "API OFF — turn ON"
              )}
            </button>
          </form>
        </div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Status:{" "}
          <span className={globalOn ? "text-emerald-300" : "text-rose-300"}>
            {globalOn ? "Enabled" : "Disabled"}
          </span>
        </p>
        <Message state={globalState} />
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#0D1526] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-50">
          Create sandbox partner
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Hashed password, opening demo balance, and an{" "}
          <code className="text-slate-300">sb_test_*</code> API key (shown once).
        </p>
        <form action={createAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Name
            </span>
            <input
              name="name"
              required
              maxLength={120}
              className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#070D19] px-3 text-sm text-slate-100 outline-none focus:border-emerald-500/40"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Email
            </span>
            <input
              name="email"
              type="email"
              required
              className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#070D19] px-3 text-sm text-slate-100 outline-none focus:border-emerald-500/40"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Password
            </span>
            <div className="relative">
              <input
                name="password"
                type={showCreatePassword ? "text" : "password"}
                required
                minLength={8}
                className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#070D19] px-3 pr-10 text-sm text-slate-100 outline-none focus:border-emerald-500/40"
              />
              <button
                type="button"
                onClick={() => setShowCreatePassword((v) => !v)}
                className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06]"
                aria-label={
                  showCreatePassword ? "Hide password" : "Show password"
                }
              >
                {showCreatePassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Opening balance (USD)
            </span>
            <input
              name="initialBalanceUsd"
              type="number"
              min={0}
              step={1}
              defaultValue={1250}
              className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#070D19] px-3 text-sm text-slate-100 outline-none focus:border-emerald-500/40"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={createPending}
              className="inline-flex h-10 items-center rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {createPending ? (
                <BrandPendingLabel label="Creating…" />
              ) : (
                "Create sandbox partner"
              )}
            </button>
            <Message state={createState} />
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-slate-50">
            Sandbox partners ({partners.length})
          </h2>
          <form action={resetDiscountAction}>
            <button
              type="submit"
              disabled={resetDiscountPending || partners.length === 0}
              className="inline-flex h-9 items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
              onClick={(e) => {
                if (
                  !window.confirm(
                    `Reset all sandbox partners to ${SANDBOX_DEFAULT_DISCOUNT_PERCENT}% off?`
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              {resetDiscountPending
                ? "…"
                : `Reset all to ${SANDBOX_DEFAULT_DISCOUNT_PERCENT}%`}
            </button>
          </form>
        </div>
        <Message state={resetDiscountState} />
        {partners.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/[0.12] px-4 py-8 text-center text-sm text-slate-400">
            No sandbox partners yet. Create one above to enable portal login and
            API keys.
          </p>
        ) : (
          partners.map((p) => (
            <article
              key={p.id}
              className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#0D1526] p-4 sm:p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-slate-50">
                    {p.name}
                  </p>
                  <p className="truncate text-sm text-slate-400">{p.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Balance {formatUsd(p.balanceCents)} · discount{" "}
                    <span className="text-emerald-300">
                      {p.discountPercent ?? SANDBOX_DEFAULT_DISCOUNT_PERCENT}%
                      off
                    </span>{" "}
                    · key {p.apiKeyPrefix ?? "—"}… · API{" "}
                    <span
                      className={
                        p.apiEnabled && globalOn
                          ? "text-emerald-300"
                          : "text-rose-300"
                      }
                    >
                      {p.apiEnabled ? "ON" : "OFF"}
                      {!globalOn ? " (global OFF)" : ""}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <form action={partnerApiAction}>
                    <input type="hidden" name="partnerId" value={p.id} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={p.apiEnabled ? "0" : "1"}
                    />
                    <button
                      type="submit"
                      disabled={partnerApiPending}
                      className="h-9 rounded-xl border border-white/[0.12] px-3 text-xs font-semibold text-slate-100 hover:bg-white/[0.04] disabled:opacity-60"
                    >
                      {partnerApiPending
                        ? "…"
                        : p.apiEnabled
                          ? "Disable API"
                          : "Enable API"}
                    </button>
                  </form>
                  <form action={deleteAction}>
                    <input type="hidden" name="partnerId" value={p.id} />
                    <button
                      type="submit"
                      disabled={deletePending}
                      className="h-9 rounded-xl border border-rose-500/30 px-3 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:opacity-60"
                      onClick={(e) => {
                        if (
                          !window.confirm(
                            `Delete sandbox partner ${p.email}? This cannot be undone.`
                          )
                        ) {
                          e.preventDefault();
                        }
                      }}
                    >
                      {deletePending ? "…" : "Delete"}
                    </button>
                  </form>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <form action={discountAction} className="flex gap-2">
                  <input type="hidden" name="partnerId" value={p.id} />
                  <input
                    name="discountPercent"
                    type="number"
                    min={0}
                    max={50}
                    step={1}
                    defaultValue={
                      p.discountPercent ?? SANDBOX_DEFAULT_DISCOUNT_PERCENT
                    }
                    title="Partner discount %"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#070D19] px-2 text-sm"
                    required
                  />
                  <button
                    type="submit"
                    disabled={discountPending}
                    className="h-9 shrink-0 rounded-lg border border-emerald-500/30 px-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-60"
                  >
                    {discountPending ? "…" : "Set %"}
                  </button>
                </form>
                <form action={balanceAction} className="flex gap-2">
                  <input type="hidden" name="partnerId" value={p.id} />
                  <input
                    name="balanceUsd"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Set USD"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#070D19] px-2 text-sm"
                    required
                  />
                  <button
                    type="submit"
                    disabled={balancePending}
                    className="h-9 shrink-0 rounded-lg border border-white/[0.12] px-2 text-xs font-semibold disabled:opacity-60"
                  >
                    {balancePending ? "…" : "Set"}
                  </button>
                </form>
                <form action={topUpAction} className="flex gap-2">
                  <input type="hidden" name="partnerId" value={p.id} />
                  <input
                    name="topUpUsd"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Top-up USD"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-white/[0.1] bg-[#070D19] px-2 text-sm"
                    required
                  />
                  <button
                    type="submit"
                    disabled={topUpPending}
                    className="h-9 shrink-0 rounded-lg border border-white/[0.12] px-2 text-xs font-semibold disabled:opacity-60"
                  >
                    {topUpPending ? "…" : "Top up"}
                  </button>
                </form>
                <form action={resetAction}>
                  <input type="hidden" name="partnerId" value={p.id} />
                  <button
                    type="submit"
                    disabled={resetPending}
                    className="h-9 w-full rounded-lg border border-amber-500/30 px-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/10 disabled:opacity-60"
                  >
                    {resetPending ? "…" : "Reset demo data"}
                  </button>
                </form>
              </div>
              <Message state={discountState} />
              <Message state={balanceState} />
              <Message state={topUpState} />
              <Message state={resetState} />
              <Message state={deleteState} />
              <Message state={partnerApiState} />
            </article>
          ))
        )}
      </section>
    </div>
  );
}
