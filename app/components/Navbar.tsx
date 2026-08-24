"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, Smartphone, Wallet, X } from "lucide-react";
import {
  BRAND_LOGO_ALT,
  BRAND_LOGO_DARK_PUBLIC_PATH,
  BRAND_LOGO_LIGHT_PUBLIC_PATH,
  BRAND_NAME,
  BRAND_SUPPORT_EMAIL,
} from "@/app/lib/brand";
import { signOutAction } from "@/app/lib/auth/actions";
import {
  PAKISTAN_DESTINATION_PATH,
  PAKISTAN_FLAG_PUBLIC_PATH,
} from "@/app/lib/seo/siteGraph";
import ThemeToggle from "./ThemeToggle";
import CurrencySelector from "./currency/CurrencySelector";

type NavLink = {
  href: string;
  label: string;
  /** Optional desktop-only two-line label (route/label string unchanged). */
  labelLines?: readonly [string, string];
  flagSrc?: string;
};

/** Desktop/mobile primary order (legacy /plans permanently redirects to /countries). */
const navLinks: NavLink[] = [
  { href: "/", label: "Home" },
  {
    href: PAKISTAN_DESTINATION_PATH,
    label: "Pakistan",
    flagSrc: PAKISTAN_FLAG_PUBLIC_PATH,
  },
  { href: "/countries", label: "Destinations" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/support", label: "Support" },
  { href: "/contact", label: "Contact" },
  {
    href: "/affiliates-and-partnerships",
    label: "Affiliates & Partnerships",
    labelLines: ["Affiliates &", "Partnerships"],
  },
];

export type NavbarCustomerSummary = {
  name: string;
  email: string;
  walletBalanceLabel: string | null;
  walletCurrency: string;
};

function NavLinkLabel({
  link,
  variant = "mobile",
}: {
  link: NavLink;
  variant?: "desktop" | "mobile";
}) {
  if (variant === "desktop" && link.labelLines) {
    return (
      <span className="inline-flex flex-col items-center justify-center text-center leading-[1.05]">
        <span>{link.labelLines[0]}</span>
        <span>{link.labelLines[1]}</span>
      </span>
    );
  }

  if (!link.flagSrc) return <>{link.label}</>;

  return (
    <span className="inline-flex items-center gap-1.5">
      <Image
        src={link.flagSrc}
        alt=""
        width={18}
        height={12}
        className="h-3 w-[18px] shrink-0 rounded-[2px] object-cover ring-1 ring-[var(--border-strong)]"
        unoptimized
        aria-hidden="true"
      />
      <span>{link.label}</span>
    </span>
  );
}

type NavbarProps = {
  authHref?: string;
  authLabel?: string;
  /** Logged-in CUSTOMER summary for the mobile drawer only. */
  customer?: NavbarCustomerSummary | null;
  /** Logged-in PARTNER summary for the mobile drawer only. */
  partner?: NavbarCustomerSummary | null;
};

export default function Navbar({
  authHref = "/signin",
  authLabel = "Sign in",
  customer = null,
  partner = null,
}: NavbarProps) {
  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isCustomer = Boolean(customer);
  const isPartner = Boolean(partner);
  const isLoggedOut = authHref === "/signin";

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/countries") {
      return (
        pathname === "/countries" ||
        (pathname.startsWith("/countries/") &&
          pathname !== PAKISTAN_DESTINATION_PATH)
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function closeMenu() {
    setOpen(false);
  }

  function mobileNavClass(active: boolean, emphasize = false) {
    if (active) {
      return "border border-[var(--accent-strong)]/45 bg-[var(--accent-strong)]/12 text-[var(--heading)]";
    }
    if (emphasize) {
      return "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--heading)] hover:border-[var(--accent-strong)]/40";
    }
    return "border border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--heading)]";
  }

  return (
    <header
      className="
        sticky top-0 z-50 w-full max-w-full
        border-b border-[var(--border)]
        bg-[var(--nav-bg)] backdrop-blur-md
        text-[var(--heading)]
      "
    >
      <nav
        className="
          mx-auto flex h-16 w-full min-w-0 max-w-[1200px] items-center
          justify-between gap-3 px-3 sm:h-[72px] sm:gap-4 sm:px-6
          2xl:max-w-[1280px]
        "
        aria-label="Primary"
      >
        <Link
          href="/"
          onClick={closeMenu}
          className="
            group mr-2 flex shrink-0 items-center gap-2.5 rounded-lg
            lg:mr-5 xl:mr-6
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-[var(--accent-strong)]/60
            focus-visible:ring-offset-2
            focus-visible:ring-offset-[var(--page-bg)]
          "
        >
          <Image
            src={BRAND_LOGO_LIGHT_PUBLIC_PATH}
            alt={BRAND_LOGO_ALT}
            width={184}
            height={48}
            sizes="168px"
            className="h-8 w-[128px] max-w-[128px] object-contain object-left dark:hidden sm:h-9 sm:w-[150px] sm:max-w-[150px] md:h-10 md:w-[168px] md:max-w-[168px]"
            priority
            unoptimized
          />
          <Image
            src={BRAND_LOGO_DARK_PUBLIC_PATH}
            alt=""
            width={184}
            height={48}
            sizes="168px"
            className="hidden h-8 w-[128px] max-w-[128px] object-contain object-left dark:block sm:h-9 sm:w-[150px] sm:max-w-[150px] md:h-10 md:w-[168px] md:max-w-[168px]"
            unoptimized
            aria-hidden="true"
          />
          <span className="sr-only">{BRAND_NAME}</span>
        </Link>

        <div className="hidden min-w-0 flex-1 items-center justify-end gap-0.5 lg:flex lg:justify-start lg:pl-4 xl:gap-1">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            const stacked = Boolean(link.labelLines);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  relative inline-flex shrink-0 items-center justify-center
                  rounded-lg px-1.5 py-1.5 text-center text-xs font-medium
                  transition-colors
                  xl:px-2.5 xl:text-[13px] 2xl:px-3 2xl:text-sm
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-[var(--accent-strong)]/60
                  focus-visible:ring-offset-2
                  focus-visible:ring-offset-[var(--page-bg)]
                  ${stacked ? "leading-none" : "whitespace-nowrap py-2"}
                  ${
                    active
                      ? "text-[var(--heading)]"
                      : "text-[var(--text-muted)] hover:text-[var(--heading)]"
                  }
                `}
              >
                <NavLinkLabel link={link} variant="desktop" />
                {active && (
                  <span
                    className="
                      absolute bottom-0 left-1.5 right-1.5 h-0.5
                      rounded-full bg-[var(--accent-strong)]/90
                      xl:left-2 xl:right-2
                    "
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}

          <div className="ml-auto flex shrink-0 items-center gap-2 pl-2 xl:gap-3 xl:pl-3">
            <CurrencySelector />
            <ThemeToggle />

            <Link
              href={authHref}
              className="
                shrink-0 whitespace-nowrap rounded-lg px-2 py-2 text-xs
                font-medium text-[var(--text-muted)] transition-colors
                xl:px-3 xl:text-[13px] 2xl:text-sm
                hover:text-[var(--heading)]
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-[var(--accent-strong)]/60
              "
            >
              {authLabel}
            </Link>

            <Link
              href="/countries"
              className="
                inline-flex shrink-0 items-center justify-center
                whitespace-nowrap rounded-[14px] bg-[var(--accent)]
                px-3.5 py-2.5 text-xs font-semibold text-[var(--accent-ink)]
                shadow-[0_0_0_1px_rgba(124,255,0,0.15)]
                transition-all xl:px-5 xl:text-[13px] 2xl:text-sm
                hover:bg-[var(--accent-strong)]
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-[var(--accent-strong)]/60
                focus-visible:ring-offset-2
                focus-visible:ring-offset-[var(--page-bg)]
              "
            >
              Get eSIM
            </Link>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2 lg:hidden">
          <CurrencySelector />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="
              inline-flex h-10 w-10 shrink-0 items-center justify-center
              rounded-[14px] border border-[var(--border-strong)]
              bg-[var(--surface)] text-[var(--heading)]
              transition-colors hover:border-[var(--border-hover)]
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-[var(--accent-strong)]/60
              focus-visible:ring-offset-2
              focus-visible:ring-offset-[var(--page-bg)]
            "
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {portalReady && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] lg:hidden"
              role="presentation"
            >
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px]"
                onClick={closeMenu}
              />
              <div
                id="mobile-nav"
                role="dialog"
                aria-modal="true"
                aria-label={BRAND_NAME}
                className="
                  fixed top-0 right-0 z-[110] flex h-[100dvh] w-[min(92vw,24rem)]
                  max-w-[24rem] flex-col overflow-hidden
                  rounded-l-[1.75rem] border-l border-[var(--border)]
                  bg-[var(--surface)] text-[var(--heading)]
                  pt-[env(safe-area-inset-top)]
                  shadow-[-24px_0_64px_rgba(0,0,0,0.5)]
                "
              >
                <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)]/70 bg-[var(--surface)] px-5 py-4">
                  <Image
                    src={BRAND_LOGO_LIGHT_PUBLIC_PATH}
                    alt={BRAND_LOGO_ALT}
                    width={160}
                    height={40}
                    className="h-8 w-[128px] max-w-[128px] object-contain object-left dark:hidden"
                    unoptimized
                  />
                  <Image
                    src={BRAND_LOGO_DARK_PUBLIC_PATH}
                    alt=""
                    width={160}
                    height={40}
                    className="hidden h-8 w-[128px] max-w-[128px] object-contain object-left dark:block"
                    unoptimized
                    aria-hidden="true"
                  />
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={closeMenu}
                    aria-label="Close menu"
                    className="
                      ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center
                      rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)]
                      text-[var(--heading)]
                      transition-colors hover:border-[var(--border-hover)]
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-[var(--accent-strong)]/60
                    "
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--surface)] px-5 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                  <nav className="flex flex-col gap-2.5" aria-label="Primary mobile">
                    {navLinks
                      .filter((link) => link.href !== "/support")
                      .map((link) => {
                        const active = isActive(link.href);
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={closeMenu}
                            aria-current={active ? "page" : undefined}
                            className={`flex min-h-12 items-center rounded-2xl px-4 text-[15px] font-semibold tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 ${mobileNavClass(active)}`}
                          >
                            <NavLinkLabel link={link} variant="mobile" />
                          </Link>
                        );
                      })}
                  </nav>

                  <div className="mt-8">
                    <p className="mb-2.5 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                      Currency
                    </p>
                    <CurrencySelector compact />
                  </div>

                  {isCustomer && customer ? (
                    <div className="mt-8 space-y-3">
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                        <p className="truncate text-base font-bold text-[var(--heading)]">
                          {customer.name}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">
                          {customer.email}
                        </p>
                        <Link
                          href="/account/wallet"
                          onClick={closeMenu}
                          className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                        >
                          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--heading)]">
                            <Wallet className="h-4 w-4 text-[var(--accent-strong)]" />
                            Wallet
                          </span>
                          <span className="text-sm font-bold tabular-nums text-[var(--heading)]">
                            {customer.walletBalanceLabel ?? "—"}{" "}
                            <span className="text-xs font-semibold text-[var(--text-soft)]">
                              {customer.walletCurrency}
                            </span>
                          </span>
                        </Link>
                      </div>

                      <nav className="flex flex-col gap-2" aria-label="Account">
                        <Link
                          href="/account/orders"
                          onClick={closeMenu}
                          className={`inline-flex items-center gap-2 rounded-[14px] px-4 py-3.5 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 ${mobileNavClass(isActive("/account/orders"), true)}`}
                        >
                          <Smartphone className="h-4 w-4 text-[var(--accent-strong)]" />
                          My eSIMs
                        </Link>
                        <Link
                          href="/account"
                          onClick={closeMenu}
                          className={`rounded-[14px] px-4 py-3 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 ${mobileNavClass(pathname === "/account")}`}
                        >
                          My Account
                        </Link>
                      </nav>

                      <form action={signOutAction}>
                        <button
                          type="submit"
                          className="inline-flex h-12 w-full items-center justify-center rounded-[14px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 text-sm font-bold text-[var(--danger-text)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-border)]"
                        >
                          Sign out
                        </button>
                      </form>
                    </div>
                  ) : isPartner && partner ? (
                    <div className="mt-8 space-y-3">
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                        <p className="truncate text-base font-bold text-[var(--heading)]">
                          {partner.name}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">
                          {partner.email}
                        </p>
                        <Link
                          href="/partner/wallet"
                          onClick={closeMenu}
                          className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition hover:border-[var(--accent-strong)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                        >
                          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--heading)]">
                            <Wallet className="h-4 w-4 text-[var(--accent-strong)]" />
                            Wallet
                          </span>
                          <span className="text-sm font-bold tabular-nums text-[var(--heading)]">
                            {partner.walletBalanceLabel ?? "—"}{" "}
                            <span className="text-xs font-semibold text-[var(--text-soft)]">
                              {partner.walletCurrency}
                            </span>
                          </span>
                        </Link>
                      </div>

                      <nav className="flex flex-col gap-2" aria-label="Partner account">
                        <Link
                          href="/partner/orders"
                          onClick={closeMenu}
                          className={`inline-flex items-center gap-2 rounded-[14px] px-4 py-3.5 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 ${mobileNavClass(isActive("/partner/orders"), true)}`}
                        >
                          <Smartphone className="h-4 w-4 text-[var(--accent-strong)]" />
                          My eSIMs
                        </Link>
                        <Link
                          href="/partner"
                          onClick={closeMenu}
                          className={`rounded-[14px] px-4 py-3 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 ${mobileNavClass(pathname === "/partner")}`}
                        >
                          My Account
                        </Link>
                      </nav>

                      <form action={signOutAction}>
                        <button
                          type="submit"
                          className="inline-flex h-12 w-full items-center justify-center rounded-[14px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-4 text-sm font-bold text-[var(--danger-text)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger-border)]"
                        >
                          Sign out
                        </button>
                      </form>
                    </div>
                  ) : isLoggedOut ? (
                    <div className="mt-8 flex gap-3">
                      <Link
                        href={authHref}
                        onClick={closeMenu}
                        className="
                          inline-flex h-12 min-h-12 flex-1 items-center justify-center
                          rounded-2xl border border-[var(--border-strong)]
                          bg-[var(--surface-2)] px-3 text-sm font-semibold
                          text-[var(--heading)] transition-colors
                          hover:border-[var(--accent-strong)]/40
                          focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-[var(--accent-strong)]/60
                        "
                      >
                        Sign In
                      </Link>
                      <Link
                        href="/signup"
                        onClick={closeMenu}
                        className="
                          inline-flex h-12 min-h-12 flex-1 items-center justify-center
                          rounded-2xl border border-[var(--border-strong)]
                          bg-[var(--surface-2)] px-3 text-sm font-semibold
                          text-[var(--heading)] transition-colors
                          hover:border-[var(--accent-strong)]/40
                          focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-[var(--accent-strong)]/60
                        "
                      >
                        Register
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-8">
                      <Link
                        href={authHref}
                        onClick={closeMenu}
                        className="
                          inline-flex h-12 min-h-12 w-full items-center justify-center
                          rounded-2xl border border-[var(--border-strong)]
                          bg-[var(--surface-2)] px-3 text-sm font-semibold
                          text-[var(--heading)] transition-colors
                          hover:border-[var(--accent-strong)]/40
                          focus-visible:outline-none focus-visible:ring-2
                          focus-visible:ring-[var(--accent-strong)]/60
                        "
                      >
                        {authLabel}
                      </Link>
                    </div>
                  )}

                  <Link
                    href="/countries"
                    onClick={closeMenu}
                    className="
                      mt-3 inline-flex h-12 min-h-12 w-full items-center justify-center
                      whitespace-nowrap rounded-2xl bg-[var(--accent)] px-5
                      text-sm font-semibold text-[var(--accent-ink)]
                      shadow-[0_8px_24px_rgba(124,255,0,0.18)]
                      transition-colors hover:bg-[var(--accent-strong)]
                      focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-[var(--accent-strong)]/60
                    "
                  >
                    Get eSIM
                  </Link>

                  <div className="mt-8 border-t border-[var(--border)]/80 px-0.5 pt-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-soft)]">
                      Need help?
                    </p>
                    <a
                      href={`mailto:${BRAND_SUPPORT_EMAIL}`}
                      className="mt-1.5 inline-block text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                    >
                      {BRAND_SUPPORT_EMAIL}
                    </a>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </header>
  );
}
