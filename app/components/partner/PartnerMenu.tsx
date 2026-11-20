"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Wallet } from "lucide-react";
import { signOutAction } from "@/app/lib/auth/actions";

export type PartnerNavLink = {
  href: string;
  label: string;
  exact?: boolean;
  disabled?: boolean;
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact || href === "/partner") {
    return pathname === href;
  }
  // Catalog lives at /partner/countries; legacy /partner/catalog* still counts.
  if (href === "/partner/countries") {
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
}: {
  userName: string;
  userEmail: string;
  companyBadge?: string | null;
  walletBalanceLabel?: string | null;
  links: readonly PartnerNavLink[];
}) {
  const pathname = usePathname() || "/partner";
  const badge = (companyBadge ?? "").trim() || userName;
  const balance = (walletBalanceLabel ?? "").trim() || "—";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="space-y-0">
      {/* Top bar */}
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.06] px-1 pb-4 sm:px-0">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/partner"
            className="flex shrink-0 items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-xs font-black text-slate-950">
              M
            </span>
            <span className="hidden text-sm font-semibold tracking-tight text-slate-50 sm:inline">
              MAP eSIM{" "}
              <span className="font-medium text-slate-400">Partner</span>
            </span>
          </Link>
          <span className="hidden max-w-[10rem] truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-slate-300 md:inline-flex lg:max-w-[14rem]">
            {badge}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/partner/wallet"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-300 outline-none transition hover:bg-emerald-500/15 focus-visible:ring-2 focus-visible:ring-emerald-400/60 sm:px-3 sm:text-sm"
          >
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            <span className="tabular-nums">{balance}</span>
          </Link>
          <Link
            href="/partner/wallet"
            className="inline-flex h-9 items-center gap-1 rounded-full bg-emerald-500 px-2.5 text-xs font-bold text-slate-950 outline-none transition hover:bg-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/60 sm:px-3 sm:text-sm"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Top Up</span>
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex h-9 max-w-[9rem] items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.03] px-2.5 text-xs font-semibold text-slate-200 outline-none transition hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-emerald-400/60 sm:max-w-[12rem] sm:px-3 sm:text-sm"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <span className="truncate">{userName.split(" ")[0] || userName}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/[0.1] bg-[#0D1526] py-1 shadow-2xl shadow-black/50"
              >
                <div className="border-b border-white/[0.06] px-3 py-2">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {userName}
                  </p>
                  <p className="truncate text-xs text-slate-400">{userEmail}</p>
                </div>
                <Link
                  href="/partner/account"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2.5 text-sm text-slate-200 hover:bg-white/[0.04]"
                >
                  Account settings
                </Link>
                <form action={signOutAction}>
                  <button
                    type="submit"
                    role="menuitem"
                    className="w-full px-3 py-2.5 text-left text-sm text-rose-300 hover:bg-white/[0.04]"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Horizontal sub-nav — single-row scroll on mobile */}
      <nav
        aria-label="Partner navigation"
        className="-mx-1 overflow-x-auto px-1 pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex w-max min-w-full gap-1 sm:gap-0">
          {links.map((link) => {
            if (link.disabled) {
              return (
                <li key={link.label} className="shrink-0">
                  <span
                    className="inline-flex h-10 cursor-not-allowed items-center px-3 text-sm font-medium text-slate-600"
                    aria-disabled="true"
                  >
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
                  aria-current={active ? "page" : undefined}
                  className={`relative inline-flex h-10 items-center px-3 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
                    active
                      ? "text-emerald-300"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {link.label}
                  {active ? (
                    <span
                      className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-emerald-400"
                      aria-hidden
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
