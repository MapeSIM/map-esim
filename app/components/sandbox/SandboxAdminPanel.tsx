"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createSandboxPartnerAction,
  deleteSandboxPartnerAction,
  resetSandboxDemoAction,
  setSandboxBalanceAction,
  topUpSandboxBalanceAction,
  type SandboxActionState,
} from "@/app/lib/sandbox/sandboxPartnerActions";
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
}: {
  initialPartners: SandboxPartnerPublic[];
}) {
  const [partners, setPartners] = useState(initialPartners);
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

  useEffect(() => {
    setPartners(initialPartners);
  }, [initialPartners]);

  useEffect(() => {
    if (
      createState.ok ||
      balanceState.ok ||
      topUpState.ok ||
      resetState.ok ||
      deleteState.ok
    ) {
      window.location.reload();
    }
  }, [createState, balanceState, topUpState, resetState, deleteState]);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/[0.08] bg-[#0D1526] p-5 sm:p-6">
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
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="h-10 w-full rounded-xl border border-white/[0.1] bg-[#070D19] px-3 text-sm text-slate-100 outline-none focus:border-emerald-500/40"
            />
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
              {createPending ? "Creating…" : "Create sandbox partner"}
            </button>
            <Message state={createState} />
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-50">
          Sandbox partners ({partners.length})
        </h2>
        {partners.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/[0.12] px-4 py-8 text-center text-sm text-slate-400">
            No sandbox partners yet. Create one above to enable portal login and
            API keys.
          </p>
        ) : (
          partners.map((p) => (
            <article
              key={p.id}
              className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#0D1526] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-50">
                    {p.name}
                  </p>
                  <p className="text-sm text-slate-400">{p.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Balance {formatUsd(p.balanceCents)} · key{" "}
                    {p.apiKeyPrefix ?? "—"}…
                  </p>
                </div>
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
                    Delete
                  </button>
                </form>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
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
                    className="h-9 shrink-0 rounded-lg border border-white/[0.12] px-2 text-xs font-semibold"
                  >
                    Set
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
                    className="h-9 shrink-0 rounded-lg border border-white/[0.12] px-2 text-xs font-semibold"
                  >
                    Top up
                  </button>
                </form>
                <form action={resetAction}>
                  <input type="hidden" name="partnerId" value={p.id} />
                  <button
                    type="submit"
                    disabled={resetPending}
                    className="h-9 w-full rounded-lg border border-amber-500/30 px-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/10 disabled:opacity-60"
                  >
                    Reset demo data
                  </button>
                </form>
              </div>
              <Message state={balanceState} />
              <Message state={topUpState} />
              <Message state={resetState} />
              <Message state={deleteState} />
            </article>
          ))
        )}
      </section>
    </div>
  );
}
