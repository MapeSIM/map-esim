"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Menu, Plus, Wallet, X } from "lucide-react";
import { signOutAction } from "@/app/lib/auth/actions";

export type PartnerNavLink = {
  href: string;
  label: string;
  exact?: boolean;
  disabled?: boolean;
};

export type PartnerMenuMode = "retail" | "b2b" | "sandbox";

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact || href === "/partner" || href === "/" || href === "/sandbox") {
    if (href === "/" || href === "/partner") {
      return pathname === "/" || pathname === "/partner";
    }
    if (href === "/sandbox") {
      return pathname === "/" || pathname === "/sandbox";
    }
    return pathname === href;
  }
  if (href === "/partner/countries" || href === "/sandbox/catalog") {
    return (
      pathname === href ||
      pathname.startsWith(`${href}/`) ||
      pathname === "/partner/catalog" ||
      pathname.startsWith("/partner/catalog/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PartnerMenu({
  userName,
  userEmail,
  companyBadge,
  walletBalanceLabel,
  links,
  mode = "retail",
  brandLabel = "MAP eSIM",
  brandSuffix = "Partner",
  homeHref = "/partner",
  walletHref = "/partner/wallet",
  accountHref = "/partner/account",
}: {
  userName: string;
  userEmail: string;
  companyBadge?: string | null;
  walletBalanceLabel?: string | null;
  links: readonly PartnerNavLink[];
  mode?: PartnerMenuMode;
  brandLabel?: string;
  brandSuffix?: string;
  homeHref?: string;
  walletHref?: string;
  accountHref?: string;
}) {
  const pathname = usePathname() || homeHref;
  const badge = (companyBadge ?? "").trim() || userName;
  const balance = (walletBalanceLabel ?? "").trim() || "—";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerTitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const isSandbox = mode === "sandbox";
  const isB2bChrome = mode === "b2b" || mode === "sandbox";

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  async function resetSandbox() {
    try {
      localStorage.removeItem("mapesim_sandbox_wallet_cents");
      localStorage.removeItem("mapesim_sandbox_demo_orders");
      localStorage.removeItem("mapesim_sandbox_api_key");
      localStorage.removeItem("mapesim_sandbox_session");
      localStorage.removeItem("mapesim_sandbox_wallet_tx");
    } catch {
      /* ignore */
    }
    try {
      await fetch("/api/sandbox/session/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      /* ignore */
    }
    window.location.href = homeHref;
  }

  const navList = (
    <ul className="flex flex-col gap-1 sm:flex-row sm:w-max sm:min-w-full sm:gap-0">
      {links.map((link) => {
        if (link.disabled) {
          return (
            <li key={link.label} className="shrink-0">
              <span className="inline-flex h-10 cursor-not-allowed items-center px-3 text-sm font-medium text-slate-600">
                {link.label}
              </span>
            </li>
          );
        }
        const active = isActive(pathname, link.href, link.exact);
        return (
          <li key={link.href} className="shrink-0">
            <Link
              href={link.href}
              prefetch
              onClick={() => setDrawerOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`relative inline-flex h-11 w-full items-center rounded-xl px-3 text-sm font-medium outline-none transition sm:h-10 sm:w-auto sm:rounded-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
                active
                  ? "bg-emerald-500/10 text-emerald-300 sm:bg-transparent"
                  : "text-slate-300 hover:bg-white/[0.04] hover:text-slate-100 sm:text-slate-400 sm:hover:bg-transparent sm:hover:text-slate-200"
              }`}
            >
              {link.label}
              {active ? (
                <span
                  className="absolute inset-x-3 bottom-0 hidden h-0.5 rounded-full bg-emerald-400 sm:block"
                  aria-hidden
                />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const signOutControl = isSandbox ? (
    <button
      type="button"
      onClick={resetSandbox}
      className="inline-flex h-9 items-center rounded-full border border-white/[0.12] px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.05] sm:text-sm"
    >
      Sign out
    </button>
  ) : (
    <form action={signOutAction}>
      <button
        type="submit"
        className="inline-flex h-9 items-center rounded-full border border-white/[0.12] px-3 text-xs font-semibold text-slate-200 transition hover:bg-white/[0.05] sm:text-sm"
      >
        Sign out
      </button>
    </form>
  );

  return (
    <div className="space-y-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-white/[0.06] px-1 pb-3 sm:gap-x-3 sm:px-0 sm:pb-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {isB2bChrome ? (
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] text-slate-200 lg:hidden"
              aria-expanded={drawerOpen}
              aria-controls={drawerTitleId}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden />
              <span className="sr-only">Open menu</span>
            </button>
          ) : null}
          <Link
            href={homeHref}
            className="flex min-w-0 items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-xs font-black text-slate-950">
              M
            </span>
            <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-slate-50">
              {brandLabel}
              <span className="ml-1 hidden font-medium text-slate-400 sm:inline">
                {brandSuffix}
              </span>
            </span>
          </Link>
          {!isSandbox ? (
            <span className="hidden max-w-[10rem] truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-slate-300 md:inline-flex lg:max-w-[14rem]">
              {badge}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <Link
            href={walletHref}
            className="inline-flex h-9 max-w-[9.5rem] items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 text-xs font-semibold text-emerald-300 outline-none transition hover:bg-emerald-500/15 focus-visible:ring-2 focus-visible:ring-emerald-400/60 sm:max-w-none sm:gap-1.5 sm:px-3 sm:text-sm"
          >
            <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate tabular-nums">{balance}</span>
          </Link>
          <Link
            href={walletHref}
            className="hidden h-9 items-center gap-1 rounded-full bg-emerald-500 px-2.5 text-xs font-bold text-slate-950 outline-none transition hover:bg-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/60 sm:inline-flex sm:px-3 sm:text-sm"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            <span>Top Up</span>
          </Link>
          {isB2bChrome ? (
            <div className="hidden sm:block">{signOutControl}</div>
          ) : (
            <Link
              href={accountHref}
              className="inline-flex h-9 max-w-[7rem] items-center truncate rounded-full border border-white/[0.1] px-2.5 text-xs font-semibold text-slate-200 sm:max-w-none sm:px-3 sm:text-sm"
            >
              {userName.split(" ")[0] || userName}
            </Link>
          )}
        </div>
      </div>

      {/* Desktop nav */}
      <nav
        aria-label="Partner navigation"
        className="-mx-1 hidden overflow-x-auto px-1 pt-3 lg:block [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {navList}
      </nav>

      {/* Mobile drawer — isolated above page chrome */}
      {isB2bChrome && drawerOpen ? (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal>
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            ref={panelRef}
            id={drawerTitleId}
            className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r border-white/[0.08] bg-[#0D1526] shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-50">
                {brandLabel} {brandSuffix}
              </p>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.1]"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="h-4 w-4" aria-hidden />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <div className="space-y-0.5 border-b border-white/[0.06] px-4 py-3">
              <p className="truncate text-sm font-semibold text-slate-100">
                {userName}
              </p>
              <p className="truncate text-xs text-slate-400">{userEmail}</p>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Menu">
              {navList}
            </nav>
            <div className="border-t border-white/[0.06] p-4">{signOutControl}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
