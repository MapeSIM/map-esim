"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import {
  BRAND_LOGO_ALT,
  BRAND_LOGO_DARK_PUBLIC_PATH,
  BRAND_LOGO_LIGHT_PUBLIC_PATH,
  BRAND_NAME,
} from "@/app/lib/brand";
import {
  PAKISTAN_DESTINATION_PATH,
  PAKISTAN_FLAG_PUBLIC_PATH,
} from "@/app/lib/seo/siteGraph";
import ThemeToggle from "./ThemeToggle";
import CurrencySelector from "./currency/CurrencySelector";

type NavLink = {
  href: string;
  label: string;
  flagSrc?: string;
};

/** Desktop/mobile primary order (Plans stays at /plans but is not linked here). */
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
  { href: "/affiliates-and-partnerships", label: "Affiliates & Partnerships" },
];

function NavLinkLabel({ link }: { link: NavLink }) {
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
          justify-between gap-1.5 px-3 sm:h-[72px] sm:gap-3 sm:px-6
        "
        aria-label="Primary"
      >
        <Link
          href="/"
          onClick={closeMenu}
          className="
            group flex min-w-0 shrink items-center gap-2.5 rounded-lg
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

        <div className="hidden items-center gap-0.5 lg:flex xl:gap-1">
          {navLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  relative whitespace-nowrap rounded-lg px-2 py-2 text-[13px]
                  font-medium transition-colors xl:px-2.5 xl:text-sm
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
                <NavLinkLabel link={link} />
                {active && (
                  <span
                    className="
                      absolute bottom-0 left-2 right-2 h-0.5
                      rounded-full bg-[var(--accent-strong)]/90
                    "
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}

          <div className="ml-1.5 flex items-center gap-2 xl:ml-2 xl:gap-3">
            <CurrencySelector />
            <ThemeToggle />

            <Link
              href={authHref}
              className="
                rounded-lg px-2.5 py-2 text-[13px] font-medium
                text-[var(--text-muted)] transition-colors xl:px-3 xl:text-sm
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
                rounded-[14px] bg-[var(--accent)] px-4 py-2.5
                text-[13px] font-semibold text-[var(--accent-ink)]
                shadow-[0_0_0_1px_rgba(124,255,0,0.15)]
                transition-all xl:px-5 xl:text-sm
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

      {open && (
        <div
          id="mobile-nav"
          className="
            border-b border-[var(--border)]
            bg-[var(--page-bg)]/98 backdrop-blur-md lg:hidden
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
                  <NavLinkLabel link={link} />
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
