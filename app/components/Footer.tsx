import Link from "next/link";
import { CreditCard, Globe } from "lucide-react";

const columns = [
  {
    title: "Company",
    links: [
      { label: "Home", href: "/" },
      { label: "Destinations", href: "/countries" },
      { label: "Plans", href: "/plans" },
    ],
  },
  {
    title: "Destinations",
    links: [
      { label: "All countries", href: "/countries?filter=Country" },
      { label: "Popular destinations", href: "/countries?filter=Popular" },
      { label: "Regional plans", href: "/countries?filter=Regional" },
      { label: "Global plans", href: "/countries?filter=Global" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help center", href: "/support" },
      { label: "FAQ", href: "/#faq" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--page-bg-soft)] text-[var(--heading)]">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--accent-soft)]">
              <Globe className="h-[18px] w-[18px]" />
            </span>
            <span className="text-xl font-semibold tracking-tight">
              MAP-eSIM
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
            Travel eSIM plans with clear destination browsing, verified offer
            checkout, and multi-currency price display.
          </p>
        </div>

        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--heading)]">
              {column.title}
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-[var(--text-muted)]">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="transition hover:text-[var(--accent-strong)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-5 text-sm text-[var(--text-soft)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© 2026 MAP-eSIM. All rights reserved.</p>
          <p className="inline-flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[var(--accent-strong)]" />
            Visa · Mastercard
          </p>
        </div>
        <div className="mx-auto max-w-[1200px] px-4 pb-5 text-xs text-[var(--text-soft)] sm:px-6">
          Display currency conversion powered in part by{" "}
          <a
            href="https://www.exchangerate-api.com"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text-muted)]"
          >
            ExchangeRate-API
          </a>
          .
        </div>
      </div>
    </footer>
  );
}
