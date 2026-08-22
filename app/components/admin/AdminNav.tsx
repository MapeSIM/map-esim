"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/lib/auth/actions";

const links = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/orders", label: "Orders", exact: false },
  { href: "/admin/customers", label: "Customers", exact: false },
  { href: "/admin/partners", label: "Partners", exact: false },
  { href: "/admin/wallet-topups", label: "Wallet top-ups", exact: false },
  { href: "/admin/payments/pending", label: "Pending payments", exact: false },
  { href: "/admin/payments/failed", label: "Failed payments", exact: false },
  { href: "/admin/payments/webhooks", label: "Webhook receipts", exact: false },
  { href: "/admin/refund-requests", label: "Refund requests", exact: false },
  { href: "/admin/promo-codes", label: "Promo Codes", exact: false },
  { href: "/admin/reconciliation", label: "Reconciliation", exact: false },
  { href: "/admin/operations", label: "Operations", exact: false },
  { href: "/admin/alerts", label: "Alerts", exact: false },
  { href: "/admin/audit-logs", label: "Audit logs", exact: false },
  { href: "/admin/admin-users", label: "Admin Users", exact: false },
  { href: "/admin/settings", label: "Settings", exact: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav({ adminName }: { adminName: string }) {
  const pathname = usePathname() || "/admin";

  return (
    <aside className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
        MAP eSIM Admin
      </p>
      <p className="mt-2 truncate px-2 text-sm font-semibold text-[var(--heading)]">
        {adminName}
      </p>
      <nav className="mt-4 flex flex-col gap-1" aria-label="Admin">
        {links.map((link) => {
          const active = isActive(pathname, link.href, link.exact);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-xl bg-[var(--accent-strong)]/12 px-3 py-2 text-sm font-semibold text-[var(--accent-strong)] outline-none ring-[var(--accent-strong)] focus-visible:ring-2"
                  : "rounded-xl px-3 py-2 text-sm font-medium text-[var(--text)] outline-none transition hover:bg-[var(--surface-2)] hover:text-[var(--heading)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
              }
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <form action={signOutAction} className="mt-4 px-2">
        <button
          type="submit"
          className="text-sm font-semibold text-[var(--danger-text)] outline-none focus-visible:underline"
        >
          Sign out
        </button>
      </form>
    </aside>
  );
}
