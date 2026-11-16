"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import {
  ChevronDown,
  HelpCircle,
  RefreshCw,
  Signal,
  Smartphone,
} from "lucide-react";
import {
  clearHomeEsimUsageLookup,
  formatHomeUsageExpiryCountdown,
  formatHomeUsageGb,
  homeUsageBarTone,
  homeUsageRemainingRatio,
  readHomeEsimUsageLookup,
  writeHomeEsimUsageLookup,
  type HomeEsimUsageCard,
} from "@/app/lib/esim/homeUsageLookupShared";

type Card = HomeEsimUsageCard;

function statusBadgeClass(badge: Card["statusBadge"]): string {
  switch (badge) {
    case "Active":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-100";
    case "Ready to Install":
      return "border-[var(--accent-strong)]/45 bg-[var(--accent-strong)]/14 text-[var(--heading)]";
    case "Expired":
    case "Depleted":
      return "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]";
    default:
      return "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--heading)]";
  }
}

function barClass(tone: "emerald" | "amber" | "neutral"): string {
  if (tone === "emerald") return "bg-emerald-400";
  if (tone === "amber") return "bg-amber-400";
  return "bg-[var(--accent-strong)]/50";
}

function formatLastUpdated(iso: string | null | undefined): string {
  if (!iso) return "Not updated yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not updated yet";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function IccidHelpAccordion() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-[var(--heading)]"
      >
        <HelpCircle
          className="h-3.5 w-3.5 shrink-0 text-[var(--accent-strong)]"
          aria-hidden
        />
        <span className="min-w-0 flex-1">(?) Where to find ICCID</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={panelId}
          className="space-y-2 border-t border-[var(--border)] px-3 py-3 text-xs leading-relaxed text-[var(--text-muted)]"
        >
          <p>
            <span className="font-semibold text-[var(--heading)]">iPhone:</span>{" "}
            Settings → General → About → scroll to ICCID.
          </p>
          <p>
            <span className="font-semibold text-[var(--heading)]">Android:</span>{" "}
            Settings → About phone → SIM status (or Status) → ICCID.
          </p>
          <p>
            <span className="font-semibold text-[var(--heading)]">
              Email / WhatsApp:
            </span>{" "}
            Open your MAP eSIM receipt — Order ID and ICCID are listed there.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function UsageCardView({
  card,
  onRefresh,
  refreshing,
  onCheckAnother,
  showCheckAnother,
}: {
  card: Card;
  onRefresh: () => void;
  refreshing: boolean;
  onCheckAnother?: () => void;
  showCheckAnother?: boolean;
}) {
  const ratio = homeUsageRemainingRatio(
    card.remainingDataGB,
    card.initialDataGB
  );
  const tone = homeUsageBarTone(ratio);
  const fillPct =
    ratio == null ? (card.isUnlimited ? 100 : 0) : Math.round(ratio * 100);
  const expiry = formatHomeUsageExpiryCountdown({
    daysRemaining: card.daysRemaining,
    expiresAtIso: card.expiresAt,
    isExpired: card.isExpired || card.statusBadge === "Expired",
  });
  const ready = card.statusBadge === "Ready to Install";
  const primaryHref = ready
    ? card.detailHref || "/support"
    : card.topUpHref || "/countries";
  const primaryLabel = ready ? "View QR / Details" : "Top Up / Buy Again";

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface)]">
          {card.flagUrl ? (
            <Image
              src={card.flagUrl}
              alt=""
              width={48}
              height={48}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <Signal className="h-5 w-5 text-[var(--accent-strong)]" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-base font-bold text-[var(--heading)]">
              {card.destination}
            </p>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(card.statusBadge)}`}
            >
              {card.statusBadge}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">
            {card.planName}
          </p>
        </div>
      </div>

      {card.isUnlimited ? (
        <p className="text-2xl font-bold tracking-tight text-[var(--heading)]">
          Unlimited data
        </p>
      ) : (
        <div className="min-w-0 space-y-2">
          <p className="text-2xl font-bold tracking-tight text-[var(--heading)]">
            {formatHomeUsageGb(card.remainingDataGB)}
            <span className="text-base font-semibold text-[var(--text-muted)]">
              {" "}
              / {formatHomeUsageGb(card.initialDataGB)}
            </span>
          </p>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)]"
            role="progressbar"
            aria-valuenow={fillPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Remaining data"
          >
            <div
              className={`h-full rounded-full transition-all ${barClass(tone)}`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <p className="text-xs text-[var(--text-soft)]">
            Remaining vs total plan data
          </p>
        </div>
      )}

      {expiry ? (
        <p className="text-sm font-medium text-[var(--text-muted)]">{expiry}</p>
      ) : null}

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--text-soft)]">
          Last updated {formatLastUpdated(card.lastUpdatedAt)}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 text-xs font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/50 disabled:opacity-60"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden
          />
          Refresh
        </button>
      </div>

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <Link
          href={primaryHref}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 sm:flex-1"
        >
          {primaryLabel}
        </Link>
        {!ready && card.detailHref ? (
          <Link
            href={card.detailHref}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] sm:flex-1"
          >
            View details
          </Link>
        ) : null}
      </div>

      {showCheckAnother ? (
        <button
          type="button"
          onClick={onCheckAnother}
          className="text-left text-xs font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
        >
          Check another eSIM
        </button>
      ) : null}
    </div>
  );
}

/**
 * Airalo-style eSIM Data Usage card for the Home Screen (#esim-usage).
 */
export default function HomeEsimUsageWidget() {
  const headingId = useId();
  const inputId = useId();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyCard = useCallback((next: Card | null, persistQuery?: string) => {
    setCard(next);
    if (next && persistQuery) {
      writeHomeEsimUsageLookup(persistQuery);
    }
  }, []);

  const loadLoggedIn = useCallback(async (refresh = false) => {
    const res = await fetch(
      `/api/account/esims/home-usage${refresh ? "?refresh=1" : ""}`,
      {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      }
    );
    if (res.status === 401) {
      return { authorized: false as const, card: null as Card | null, error: null as string | null };
    }
    const json = (await res.json().catch(() => null)) as {
      success?: boolean;
      card?: Card | null;
      error?: string;
    } | null;
    if (!res.ok && res.status === 429 && json?.card) {
      return {
        authorized: true as const,
        card: json.card,
        error: json.error || "Please wait before refreshing again.",
      };
    }
    if (!res.ok || !json?.success) {
      return {
        authorized: true as const,
        card: json?.card ?? null,
        error: json?.error || "Usage is temporarily unavailable.",
      };
    }
    return {
      authorized: true as const,
      card: json.card ?? null,
      error: null as string | null,
    };
  }, []);

  const lookupGuest = useCallback(
    async (rawQuery: string) => {
      const res = await fetch("/api/esim-usage/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        body: JSON.stringify({ query: rawQuery }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        card?: Card;
        error?: string;
      } | null;
      if (!res.ok || !json?.success || !json.card) {
        return {
          ok: false as const,
          error: json?.error || "Could not load usage for that eSIM.",
        };
      }
      return { ok: true as const, card: json.card };
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBootstrapping(true);
      setError(null);
      try {
        const logged = await loadLoggedIn(false);
        if (cancelled) return;
        if (logged.authorized) {
          setLoggedIn(true);
          if (logged.card) {
            setCard(logged.card);
            setShowForm(false);
          } else {
            setShowForm(true);
          }
          if (logged.error) setError(logged.error);
          return;
        }

        setLoggedIn(false);
        const stored = readHomeEsimUsageLookup();
        if (stored?.query) {
          setQuery(stored.query);
          setLoading(true);
          const result = await lookupGuest(stored.query);
          if (cancelled) return;
          if (result.ok) {
            applyCard(result.card, stored.query);
            setShowForm(false);
          } else {
            setShowForm(true);
            setError(result.error);
          }
          setLoading(false);
        } else {
          setShowForm(true);
        }
      } catch {
        if (!cancelled) {
          setShowForm(true);
          setError("Usage is temporarily unavailable. Please try again later.");
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCard, loadLoggedIn, lookupGuest]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await lookupGuest(query);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      applyCard(result.card, query);
      setShowForm(false);
    } catch {
      setError("Usage is temporarily unavailable. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  async function onRefresh() {
    setError(null);
    setRefreshing(true);
    try {
      if (loggedIn && card?.orderId) {
        const logged = await loadLoggedIn(true);
        if (logged.card) setCard(logged.card);
        if (logged.error) setError(logged.error);
        return;
      }
      const stored = readHomeEsimUsageLookup();
      const q = stored?.query || query;
      if (!q) {
        setShowForm(true);
        return;
      }
      const result = await lookupGuest(q);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      applyCard(result.card, q);
    } catch {
      setError("Usage is temporarily unavailable. Please try again later.");
    } finally {
      setRefreshing(false);
    }
  }

  function onCheckAnother() {
    clearHomeEsimUsageLookup();
    setCard(null);
    setQuery("");
    setShowForm(true);
    setError(null);
  }

  return (
    <section
      aria-labelledby={headingId}
      className="border-b border-[var(--border)] bg-[var(--page-bg)]"
      data-home-esim-usage-widget="true"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
            Live eSIM status
          </p>
          <h2
            id={headingId}
            className="mt-2 text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl"
          >
            eSIM Data Usage
          </h2>
          <p className="mt-2 text-sm text-[var(--text-muted)] sm:text-base">
            Check remaining data, expiry, and status — for your account eSIMs or
            any Order ID / ICCID from your receipt.
          </p>
        </div>

        <div className="mt-6 min-w-0 max-w-xl overflow-x-hidden rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.28)] sm:p-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-soft)]">
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            MAP eSIM usage
          </div>

          {bootstrapping ? (
            <p className="text-sm text-[var(--text-muted)]" role="status">
              Loading your eSIM usage…
            </p>
          ) : null}

          {!bootstrapping && card && !showForm ? (
            <UsageCardView
              card={card}
              onRefresh={onRefresh}
              refreshing={refreshing}
              showCheckAnother
              onCheckAnother={onCheckAnother}
            />
          ) : null}

          {!bootstrapping && (showForm || !card) ? (
            <form onSubmit={onSubmit} className="min-w-0 space-y-4" noValidate>
              <div className="min-w-0">
                <label
                  htmlFor={inputId}
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]"
                >
                  Order ID or ICCID
                </label>
                <input
                  id={inputId}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. ord_… or 8991…"
                  disabled={loading}
                  className="min-h-12 w-full min-w-0 rounded-xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-3.5 py-3 text-sm text-[var(--heading)] outline-none focus:border-[var(--accent-strong)] disabled:opacity-60"
                />
              </div>

              <IccidHelpAccordion />

              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-4 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Checking usage…" : "Check usage"}
              </button>

              {loggedIn && card ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError(null);
                  }}
                  className="text-xs font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
                >
                  Back to my eSIM
                </button>
              ) : null}
            </form>
          ) : null}

          {error ? (
            <p className="mt-4 text-sm text-[var(--danger-text)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
