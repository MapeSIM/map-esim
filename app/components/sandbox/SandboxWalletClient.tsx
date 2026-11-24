"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import SimpaisaWalletFields from "@/app/components/account/SimpaisaWalletFields";
import BrandPendingLabel from "@/app/components/loading/BrandPendingLabel";
import { partnerCardClass } from "@/app/components/partner/partnerPortalUi";
import { PARTNER_SITE_ORIGIN } from "@/app/lib/domain/appDomain";
import {
  PARTNER_TOPUP_MAX_CENTS,
  PARTNER_TOPUP_MIN_CENTS,
} from "@/app/lib/partner/partnerWalletTopupConstants";
import {
  SANDBOX_TX_KEY,
  SANDBOX_WALLET_KEY,
  type SandboxWalletTx,
} from "@/app/lib/sandbox/sandboxClientStorage";
import {
  readSandboxApiKey,
  refreshSandboxWalletCache,
} from "@/app/lib/sandbox/sandboxPurchaseClient";
import { SANDBOX_DEFAULT_BALANCE_CENTS } from "@/app/lib/sandbox/sandboxShared";
import { SIMPAISA_WALLET_OPERATORS } from "@/app/lib/payments/simpaisaPolicy";

const PRESETS = [
  { id: "100", label: "$100", value: "100" },
  { id: "250", label: "$250", value: "250" },
  { id: "500", label: "$500", value: "500" },
  { id: "750", label: "$750", value: "750" },
  { id: "1000", label: "$1000", value: "1000" },
  { id: "custom", label: "Custom", value: null },
] as const;

/** Live partner wallet — sandbox never charges real funds. */
const LIVE_PARTNER_WALLET_HREF = `${PARTNER_SITE_ORIGIN}/partner/wallet`;

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function SandboxWalletClient() {
  const [balanceCents, setBalanceCents] = useState(SANDBOX_DEFAULT_BALANCE_CENTS);
  const [txs, setTxs] = useState<SandboxWalletTx[]>([]);
  const [ready, setReady] = useState(false);
  const [amount, setAmount] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [fieldsReady, setFieldsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [simBusy, setSimBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const amountId = useId();
  const amountInputRef = useRef<HTMLInputElement>(null);

  const amountCents = useMemo(() => {
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }, [amount]);

  const minLabel = (PARTNER_TOPUP_MIN_CENTS / 100).toFixed(2);
  const maxLabel = (PARTNER_TOPUP_MAX_CENTS / 100).toFixed(2);

  async function reloadWallet() {
    const key = readSandboxApiKey();
    setHasApiKey(Boolean(key));
    if (key) {
      const cents = await refreshSandboxWalletCache();
      if (typeof cents === "number") {
        setBalanceCents(cents);
      }
      try {
        const rawTx = localStorage.getItem(SANDBOX_TX_KEY);
        const parsed = rawTx ? (JSON.parse(rawTx) as SandboxWalletTx[]) : [];
        setTxs(Array.isArray(parsed) ? parsed : []);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const bal = localStorage.getItem(SANDBOX_WALLET_KEY);
      setBalanceCents(
        bal != null && Number.isFinite(Number(bal))
          ? Number(bal)
          : SANDBOX_DEFAULT_BALANCE_CENTS
      );
      const rawTx = localStorage.getItem(SANDBOX_TX_KEY);
      const parsed = rawTx ? (JSON.parse(rawTx) as SandboxWalletTx[]) : [];
      setTxs(Array.isArray(parsed) ? parsed : []);
    } catch {
      setBalanceCents(SANDBOX_DEFAULT_BALANCE_CENTS);
      setTxs([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await reloadWallet();
      if (!cancelled) setReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only hydrate
  }, []);

  function selectPreset(preset: (typeof PRESETS)[number]) {
    setSelectedPreset(preset.id);
    setError(null);
    setMessage(null);
    if (preset.value == null) {
      setAmount("");
      queueMicrotask(() => amountInputRef.current?.focus());
      return;
    }
    setAmount(preset.value);
  }

  /**
   * Partner-like gateway submit: never calls Simpaisa or credits sandbox.
   * Hands the user to live partneresim.com to add real funds on their Partner account.
   */
  function continueToLivePartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || amountCents < PARTNER_TOPUP_MIN_CENTS) {
      setError(`Enter an amount of at least $${minLabel}.`);
      return;
    }
    if (amountCents > PARTNER_TOPUP_MAX_CENTS) {
      setError(`Maximum top-up is $${maxLabel}.`);
      return;
    }
    if (!fieldsReady) {
      setError("Select a wallet operator and enter a valid mobile number.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const dest = new URL(LIVE_PARTNER_WALLET_HREF);
    dest.searchParams.set("from", "sandbox");
    dest.searchParams.set("amount", (amountCents / 100).toFixed(2));
    window.location.assign(dest.toString());
  }

  /** Demo-only Neon credit — never opens a live payment gateway. */
  async function simulateSandboxCredit() {
    if (simBusy || selectedPreset == null || selectedPreset === "custom") {
      if (selectedPreset === "custom" || !selectedPreset) {
        setError("Pick a quick amount to simulate a sandbox credit.");
      }
      return;
    }
    const usd = Number(selectedPreset);
    if (!Number.isFinite(usd) || usd <= 0) return;
    const key = readSandboxApiKey();
    if (!key) {
      setError(
        "Sandbox API key required. Use a provisioned sandbox session — local preview top-ups are disabled."
      );
      return;
    }

    setSimBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/sandbox/v1/wallet", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amountUsd: usd }),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as {
        wallet?: { balanceCents?: number };
        transactions?: SandboxWalletTx[];
        message?: string;
      } | null;
      if (!res.ok) {
        setError(data?.message || "Sandbox credit could not be completed.");
        return;
      }
      const cents = data?.wallet?.balanceCents;
      if (typeof cents === "number") {
        setBalanceCents(cents);
        try {
          localStorage.setItem(SANDBOX_WALLET_KEY, String(cents));
        } catch {
          /* ignore */
        }
      } else {
        await reloadWallet();
      }
      if (Array.isArray(data?.transactions)) {
        setTxs(data.transactions);
        try {
          localStorage.setItem(SANDBOX_TX_KEY, JSON.stringify(data.transactions));
        } catch {
          /* ignore */
        }
      }
      setMessage(`Simulated +$${usd} sandbox credit (demo only — not a live charge).`);
      setSelectedPreset(null);
      setAmount("");
    } catch {
      setError("Sandbox credit is temporarily unavailable. Try again.");
    } finally {
      setSimBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">
          Wallet
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Prepaid USD balance for wholesale eSIM purchases.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/15 via-[#0D1526] to-[#0D1526] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300/80">
          Available balance
        </p>
        <p className="mt-2 text-4xl font-bold tracking-tight text-slate-50 tabular-nums">
          {ready ? formatUsd(balanceCents) : "—"}
        </p>
        <p className="mt-1 text-sm text-slate-400">USD · Sandbox demo wallet</p>
      </div>

      <form
        onSubmit={continueToLivePartner}
        className="space-y-5 rounded-2xl border border-white/[0.08] bg-[#0D1526] p-5 sm:p-6"
        noValidate
        data-sandbox-add-funds="true"
      >
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-50">
            Add Funds
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Open the Partner payment flow (Easypaisa / JazzCash). Sandbox never
            charges live funds — Continue sends you to{" "}
            <span className="font-medium text-slate-200">partneresim.com</span>{" "}
            to complete a real Partner wallet top-up.
          </p>
        </div>

        <div className="space-y-3">
          <p className="block text-sm font-semibold text-slate-100">
            Quick amount
          </p>
          <div
            className="flex min-w-0 flex-wrap gap-2"
            role="group"
            aria-label="Quick Add Funds amounts"
          >
            {PRESETS.map((preset) => {
              const active = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={busy || simBusy}
                  aria-pressed={active}
                  onClick={() => selectPreset(preset)}
                  className={
                    active
                      ? "inline-flex h-10 min-w-[4.5rem] flex-1 items-center justify-center rounded-xl bg-emerald-500 px-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60 sm:flex-none"
                      : "inline-flex h-10 min-w-[4.5rem] flex-1 items-center justify-center rounded-xl border border-white/[0.12] bg-transparent px-3 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.04] disabled:opacity-60 sm:flex-none"
                  }
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor={amountId}
            className="block text-sm font-semibold text-slate-100"
          >
            Custom USD amount
          </label>
          <input
            id={amountId}
            ref={amountInputRef}
            name="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            disabled={busy || simBusy}
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setSelectedPreset("custom");
              setError(null);
            }}
            placeholder={minLabel}
            className="w-full rounded-xl border border-white/[0.1] bg-[#070D19] px-3 py-3 text-sm text-slate-100"
          />
          <p className="text-xs text-slate-500">
            Minimum ${minLabel} · Maximum ${maxLabel} · Up to two decimal places
          </p>
        </div>

        {amountCents > 0 ? (
          <SimpaisaWalletFields
            usdCents={amountCents}
            disabled={busy || simBusy}
            enabledOperatorIds={[
              SIMPAISA_WALLET_OPERATORS.EASYPAISA,
              SIMPAISA_WALLET_OPERATORS.JAZZCASH,
            ]}
            onValidityChange={setFieldsReady}
          />
        ) : null}

        <button
          type="submit"
          disabled={busy || simBusy || amountCents <= 0}
          aria-busy={busy || undefined}
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <BrandPendingLabel label="Opening partneresim.com…" />
          ) : (
            "Continue to partneresim.com"
          )}
        </button>

        <div className="border-t border-white/[0.06] pt-4">
          <p className="text-xs text-slate-500">
            Need demo balance only? Simulate a sandbox credit (Neon demo wallet —
            never a live payment).
          </p>
          <button
            type="button"
            disabled={
              simBusy ||
              busy ||
              !hasApiKey ||
              !selectedPreset ||
              selectedPreset === "custom"
            }
            onClick={() => void simulateSandboxCredit()}
            className="mt-3 inline-flex h-10 items-center rounded-xl border border-white/[0.12] px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {simBusy ? "Crediting…" : "Simulate sandbox credit"}
          </button>
        </div>

        {message ? (
          <p className="text-sm text-emerald-300" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-rose-300" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-50">
          Transaction history
        </h2>
        {txs.length === 0 ? (
          <div className={partnerCardClass}>
            <p className="text-sm text-slate-400">No transactions yet.</p>
          </div>
        ) : (
          <ul className={`${partnerCardClass} divide-y divide-white/[0.06] !p-0`}>
            {txs.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-100">{tx.label}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(tx.createdAt).toLocaleString()}
                  </p>
                </div>
                <p
                  className={`shrink-0 text-sm font-semibold tabular-nums ${
                    tx.kind === "credit" ? "text-emerald-300" : "text-slate-200"
                  }`}
                >
                  {tx.kind === "credit" ? "+" : ""}
                  {formatUsd(Math.abs(tx.amountCents))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
