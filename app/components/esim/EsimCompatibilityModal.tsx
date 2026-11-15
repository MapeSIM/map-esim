"use client";

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { CheckCircle2, Search, Smartphone, X } from "lucide-react";
import {
  CHECKOUT_COMPATIBILITY_TITLE,
  DEVICE_COMPATIBILITY_PAGE_HREF,
} from "@/app/lib/checkout/checkoutCompatibilityGuide";
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

export type EsimCompatibilityFooterAction = "continue" | "explore";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** Checkout: Got it, Continue. Info pages: Explore Plans. */
  footerAction?: EsimCompatibilityFooterAction;
};

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

function EsimCompatibilityDialog({
  open,
  onClose,
  footerAction = "continue",
}: ModalProps) {
  const titleId = useId();
  const searchId = useId();
  const [brand, setBrand] = useState<EsimCompatBrandFilter>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<EsimCompatDevice | null>(null);
  const [showVerify, setShowVerify] = useState(true);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setBrand("All");
      setSelected(null);
      setShowVerify(true);
    }
  }, [open]);

  const filtered = useMemo(
    () => filterEsimCompatDevices({ brand, query }),
    [brand, query]
  );

  const matched = useMemo(() => {
    if (selected) return selected;
    if (!query.trim()) return null;
    return matchEsimCompatDevice(query);
  }, [selected, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
      data-esim-compatibility-modal="true"
      data-checkout-compatibility-modal="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92vh] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-t-3xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.5)] sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/12">
              <Smartphone
                className="h-5 w-5 text-[var(--accent-strong)]"
                aria-hidden
              />
            </div>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-base font-bold tracking-tight text-[var(--heading)] sm:text-lg"
              >
                {CHECKOUT_COMPATIBILITY_TITLE}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                Search your phone model or verify with *#06# in under 10 seconds.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-2 text-[var(--text-muted)] outline-none transition hover:text-[var(--heading)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            aria-label="Close compatibility check"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-5">
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
              {query.trim() || brand !== "All"
                ? "Matching models"
                : "Popular models"}
            </p>
            <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto overflow-x-hidden pr-0.5 sm:max-h-48">
              {(query.trim() || brand !== "All"
                ? filtered
                : filtered.filter((d) => d.supported).slice(0, 12)
              ).map((device) => (
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
                        device.supported
                          ? "text-emerald-300"
                          : "text-amber-300"
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

        <div className="shrink-0 space-y-2 border-t border-[var(--border)] px-4 py-3 sm:px-5">
          {footerAction === "explore" ? (
            <Link
              href="/countries"
              onClick={onClose}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95"
            >
              Explore Plans
            </Link>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95"
            >
              Got it, Continue
            </button>
          )}
          <Link
            href={DEVICE_COMPATIBILITY_PAGE_HREF}
            onClick={onClose}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-xl text-xs font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
          >
            Full compatibility guide
          </Link>
        </div>
      </div>
    </div>
  );
}

type TriggerProps = {
  className?: string;
  children?: ReactNode;
  footerAction?: EsimCompatibilityFooterAction;
  /** Optional data attribute for QA / analytics. */
  "data-checkout-compatibility-trigger"?: string;
};

/**
 * Opens the interactive eSIM compatibility modal without navigating away
 * (preserves checkout state).
 */
export function EsimCompatibilityTrigger({
  className,
  children,
  footerAction = "continue",
  "data-checkout-compatibility-trigger": dataTrigger,
}: TriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 transition hover:border-[var(--border-hover)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
        }
        data-checkout-compatibility-trigger={dataTrigger ?? "true"}
        data-esim-compatibility-trigger="true"
      >
        {children ?? "Check eSIM compatibility (?)"}
      </button>
      <EsimCompatibilityDialog
        open={open}
        onClose={() => setOpen(false)}
        footerAction={footerAction}
      />
    </>
  );
}

export { EsimCompatibilityDialog };
