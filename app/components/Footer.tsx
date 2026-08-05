import Image from "next/image";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import CookiePreferencesLink from "@/app/components/cookies/CookiePreferencesLink";
import SocialIcons from "@/app/components/footer/SocialIcons";
import {
  BRAND_LOGO_ALT,
  BRAND_LOGO_DARK_PUBLIC_PATH,
  BRAND_LOGO_LIGHT_PUBLIC_PATH,
  BRAND_NAME,
  SHOW_FOOTER_PAYMENT_METHODS,
} from "@/app/lib/brand";
import { PAKISTAN_DESTINATION_PATH } from "@/app/lib/seo/siteGraph";

const columns = [
  {
    title: "Company",
    links: [
      { label: "Home", href: "/" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "Plans", href: "/plans" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Destinations",
    links: [
      { label: "All Countries", href: "/countries?filter=Country" },
      { label: "Pakistan", href: PAKISTAN_DESTINATION_PATH },
      { label: "Regional Plans", href: "/countries?filter=Regional" },
      { label: "Global Plans", href: "/countries?filter=Global" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Support Center", href: "/support" },
      { label: "iPhone Installation", href: "/install/iphone" },
      { label: "Android Installation", href: "/install/android" },
      { label: "Account Orders", href: "/account/orders" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms & Conditions", href: "/terms-and-conditions" },
      { label: "Cookie Policy", href: "/cookie-policy" },
    ],
  },
] as const;

const footerLinkClass =
  "rounded-sm transition hover:text-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60";

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--page-bg-soft)] text-[var(--heading)]">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-5">
        <div className="min-w-0">
          <Link
            href="/"
            className="
              inline-flex rounded-lg
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-[var(--accent-strong)]/60
              focus-visible:ring-offset-2
              focus-visible:ring-offset-[var(--page-bg-soft)]
            "
          >
            <Image
              src={BRAND_LOGO_LIGHT_PUBLIC_PATH}
              alt={BRAND_LOGO_ALT}
              width={184}
              height={48}
              className="h-9 w-[150px] max-w-[150px] object-contain object-left dark:hidden"
              unoptimized
            />
            <Image
              src={BRAND_LOGO_DARK_PUBLIC_PATH}
              alt=""
              width={184}
              height={48}
              className="hidden h-9 w-[150px] max-w-[150px] object-contain object-left dark:block"
              unoptimized
              aria-hidden="true"
            />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
            Travel eSIM plans with clear destination browsing, verified offer
            checkout, and multi-currency price display.
          </p>
          <SocialIcons />
        </div>

        {columns.map((column) => (
          <div key={column.title} className="min-w-0">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--heading)]">
              {column.title}
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-[var(--text-muted)]">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className={footerLinkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
              {column.title === "Legal" ? (
                <li>
                  <CookiePreferencesLink className={footerLinkClass} />
                </li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-5 text-sm text-[var(--text-soft)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© 2026 {BRAND_NAME}. All rights reserved.</p>
          {/* Restorable after payment-gateway approval — see SHOW_FOOTER_PAYMENT_METHODS. */}
          {SHOW_FOOTER_PAYMENT_METHODS ? (
            <p className="inline-flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-[var(--accent-strong)]" />
              Visa · Mastercard
            </p>
          ) : null}
        </div>
        <div className="mx-auto max-w-[1200px] px-4 pb-5 text-xs text-[var(--text-soft)] sm:px-6">
          Display currency conversion powered in part by{" "}
          <a
            href="https://www.exchangerate-api.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text-muted)] focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            ExchangeRate-API
          </a>
          .
        </div>
      </div>
    </footer>
  );
}
