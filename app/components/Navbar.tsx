"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import {
  BRAND_LOGO_ALT,
  BRAND_LOGO_PUBLIC_PATH,
  BRAND_NAME,
} from "@/app/lib/brand";
import ThemeToggle from "./ThemeToggle";
import CurrencySelector from "./currency/CurrencySelector";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/countries", label: "Destinations" },
  { href: "/plans", label: "Plans" },
  { href: "/support", label: "Support" },
];

type NavbarProps = {
  authHref?: string;
  authLabel?: string;
};

export default function Navbar({
  authHref = "/signin",
  authLabel = "Sign in",
}: NavbarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function closeMenu() {
    setOpen(false);
  }

  return (
    <header
      className="
        sticky top-0 z-50
        border-b border-[var(--border)]
        bg-[var(--nav-bg)] backdrop-blur-md
        text-[var(--heading)]
      "
    >
      <nav
        className="
          mx-auto flex h-[72px] max-w-[1200px] items-center
          justify-between px-4 sm:px-6
        "
        aria-label="Primary"
      >
        <Link
          href="/"
          onClick={closeMenu}
          className="
            group flex items-center gap-2.5 rounded-lg
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-[var(--accent-strong)]/60
            focus-visible:ring-offset-2
            focus-visible:ring-offset-[var(--page-bg)]
          "
        >
          <Image
            src={BRAND_LOGO_PUBLIC_PATH}
            alt={BRAND_LOGO_ALT}
            width={160}
            height={40}
            className="h-9 w-auto max-w-[160px] object-contain sm:h-10 sm:max-w-[180px]"
            priority
          />
          <span className="sr-only">{BRAND_NAME}</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex lg:gap-2">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  relative rounded-lg px-3 py-2 text-sm font-medium transition-colors
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-[var(--accent-strong)]/60
                  focus-visible:ring-offset-2
                  focus-visible:ring-offset-[var(--page-bg)]
                  ${
                    active
                      ? "text-[var(--heading)]"
                      : "text-[var(--text-muted)] hover:text-[var(--heading)]"
                  }
                `}
              >
                {link.label}
                {active && (
                  <span
                    className="
                      absolute bottom-0 left-3 right-3 h-0.5
                      rounded-full bg-[var(--accent-strong)]/90
                    "
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}

          <div className="ml-2 flex items-center gap-3">
            <CurrencySelector />
            <ThemeToggle />

            <Link
              href={authHref}
              className="
                rounded-lg px-3 py-2 text-sm font-medium
                text-[var(--text-muted)] transition-colors
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
                inline-flex items-center justify-center
                rounded-[14px] bg-[var(--accent)] px-5 py-2.5
                text-sm font-semibold text-[var(--accent-ink)]
                shadow-[0_0_0_1px_rgba(124,255,0,0.15)]
                transition-all
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

        <div className="flex items-center gap-2 md:hidden">
          <CurrencySelector />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="
              inline-flex h-10 w-10 items-center justify-center
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

      {open && (
        <div
          id="mobile-nav"
          className="
            border-b border-[var(--border)]
            bg-[var(--page-bg)]/98 backdrop-blur-md md:hidden
          "
        >
          <div className="mx-auto flex max-w-[1200px] flex-col gap-1 px-4 py-4 sm:px-6">
            {navLinks.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMenu}
                  className={`
                    rounded-[14px] px-4 py-3 text-base font-medium
                    transition-colors
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-[var(--accent-strong)]/60
                    ${
                      active
                        ? "bg-[var(--surface)] text-[var(--heading)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--heading)]"
                    }
                  `}
                >
                  {link.label}
                </Link>
              );
            })}

            <div className="mt-2 px-1">
              <CurrencySelector compact />
            </div>

            <Link
              href={authHref}
              onClick={closeMenu}
              className="
                rounded-[14px] px-4 py-3 text-base font-medium
                text-[var(--text-muted)] transition-colors
                hover:bg-[var(--surface-2)] hover:text-[var(--heading)]
              "
            >
              {authLabel}
            </Link>

            <Link
              href="/countries"
              onClick={closeMenu}
              className="
                mt-2 inline-flex items-center justify-center
                rounded-[14px] bg-[var(--accent)] px-5 py-3
                text-sm font-semibold text-[var(--accent-ink)]
                transition-colors hover:bg-[var(--accent-strong)]
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-[var(--accent-strong)]/60
              "
            >
              Get eSIM
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
