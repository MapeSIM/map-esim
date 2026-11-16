"use client";

import { useId, useMemo, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import {
  ESIM_COMPAT_BRAND_FILTERS,
  ESIM_COMPAT_CARRIER_LOCK_CHECK,
  ESIM_COMPAT_EID_CHECK,
  ESIM_COMPAT_SEARCH_PLACEHOLDER,
  ESIM_COMPAT_UNKNOWN_MESSAGE,
  filterEsimCompatDevices,
  matchEsimCompatDevice,
  type EsimCompatBrandFilter,
  type EsimCompatDevice,
} from "@/app/lib/checkout/esimCompatibilityCatalog";

function ResultCard({ device }: { device: EsimCompatDevice }) {
  if (device.supported) {
    return (
      <div
        className="min-w-0 rounded-2xl border border-emerald-500/40 bg-emerald-500/12 p-4"
        role="status"
        data-esim-compat-result="supported"
      >
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          ✓ eSIM Supported
        </p>
        <p className="mt-1.5 text-base font-semibold text-[var(--heading)]">
          {device.name}
        </p>
        {device.note ? (
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
            <span className="font-semibold text-[var(--heading)]">
              Important note:{" "}
            </span>
            {device.note}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="min-w-0 rounded-2xl border border-amber-500/45 bg-amber-500/12 p-4"
      role="alert"
      data-esim-compat-result="unsupported"
    >
      <p className="text-sm font-bold text-amber-200">Not Supported</p>
      <p className="mt-1.5 text-base font-semibold text-[var(--heading)]">
        {device.name}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm">
        This model typically does not include eSIM. Do not purchase a travel
        eSIM for this device — use the *#06# check if you are unsure.
      </p>
    </div>
  );
}

type Props = {
  className?: string;
  /** Compact modal lists vs taller page lists. */
  modelListMaxClassName?: string;
};

/** Interactive eSIM model search + brand filters + *#06# verification. */
export function EsimCompatibilityChecker({
  className,
  modelListMaxClassName = "max-h-40 sm:max-h-48",
}: Props) {
  const searchId = useId();
  const [brand, setBrand] = useState<EsimCompatBrandFilter>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<EsimCompatDevice | null>(null);
  const [showVerify, setShowVerify] = useState(true);

  const filtered = useMemo(
    () => filterEsimCompatDevices({ brand, query }),
    [brand, query]
  );

  const matched = useMemo(() => {
    if (selected) return selected;
    if (!query.trim()) return null;
    return matchEsimCompatDevice(query);
  }, [selected, query]);

  const listDevices =
    query.trim() || brand !== "All"
      ? filtered
      : filtered.filter((d) => d.supported).slice(0, 12);

  return (
    <div
      className={className ?? "min-w-0 space-y-4"}
      data-esim-compatibility-checker="true"
    >
      <div className="min-w-0 space-y-3">
        <label htmlFor={searchId} className="sr-only">
          Search phone model
        </label>
        <div className="relative min-w-0">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-soft)]"
            aria-hidden
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
            }}
            placeholder={ESIM_COMPAT_SEARCH_PLACEHOLDER}
            className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] py-2.5 pl-10 pr-3 text-sm text-[var(--heading)] outline-none focus:border-[var(--accent-strong)]"
            autoComplete="off"
            spellCheck={false}
            data-esim-compat-search="true"
          />
        </div>

        <div
          className="flex min-w-0 flex-wrap gap-1.5"
          role="group"
          aria-label="Brand filter"
        >
          {ESIM_COMPAT_BRAND_FILTERS.map((item) => {
            const active = brand === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setBrand(item);
                  setSelected(null);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-[var(--accent-strong)] bg-[var(--accent-strong)]/15 text-[var(--heading)]"
                    : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-hover)]"
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>

      {matched ? <ResultCard device={matched} /> : null}
      {!matched && query.trim().length >= 2 ? (
        <p
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-xs leading-relaxed text-[var(--text-muted)] sm:text-sm"
          role="status"
        >
          {ESIM_COMPAT_UNKNOWN_MESSAGE}
        </p>
      ) : null}

      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          {query.trim() || brand !== "All" ? "Matching models" : "Popular models"}
        </p>
        <ul
          className={`mt-2 space-y-1.5 overflow-y-auto overflow-x-hidden pr-0.5 ${modelListMaxClassName}`}
        >
          {listDevices.map((device) => (
            <li key={device.id} className="min-w-0">
              <button
                type="button"
                onClick={() => {
                  setSelected(device);
                  setQuery(device.name);
                }}
                className="flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-left text-sm transition hover:border-[var(--accent-strong)]/45"
              >
                <span className="min-w-0 truncate font-medium text-[var(--heading)]">
                  {device.name}
                </span>
                <span
                  className={`shrink-0 text-[10px] font-bold uppercase tracking-wide ${
                    device.supported ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {device.supported ? "eSIM" : "No"}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="px-1 py-2 text-xs text-[var(--text-muted)]">
              No models in this filter. Try All or the *#06# check.
            </li>
          ) : null}
        </ul>
      </div>

      <div className="min-w-0 rounded-2xl border border-[var(--border-strong)] bg-[var(--page-bg-soft)] p-3.5 sm:p-4">
        <button
          type="button"
          onClick={() => setShowVerify((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-[var(--heading)]"
          aria-expanded={showVerify}
        >
          Verify via *#06#
          <span className="text-xs font-medium text-[var(--accent-strong)]">
            {showVerify ? "Hide" : "Show"}
          </span>
        </button>
        {showVerify ? (
          <ol className="mt-3 space-y-3 text-xs leading-relaxed text-[var(--text)] sm:text-sm">
            <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
              <span className="font-semibold text-[var(--heading)]">
                1. Dial *#06#
              </span>
              <p className="mt-1 text-[var(--text-muted)]">
                {ESIM_COMPAT_EID_CHECK}
              </p>
            </li>
            <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
              <span className="font-semibold text-[var(--heading)]">
                2. Carrier Lock Check
              </span>
              <p className="mt-1 text-[var(--text-muted)]">
                {ESIM_COMPAT_CARRIER_LOCK_CHECK}
              </p>
            </li>
          </ol>
        ) : null}
      </div>
    </div>
  );
}
