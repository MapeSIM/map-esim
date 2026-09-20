"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/lib/auth/actions";
import { canAccessAdminPath } from "@/app/lib/admin/adminPageAccess";

type AdminNavLink = {
  href: string;
  label: string;
  exact: boolean;
};

type AdminNavSection = {
  id: string;
  title: string;
  links: readonly AdminNavLink[];
};

/**
 * Grouped admin sidebar. URLs and permission checks unchanged —
 * structure/labels/order only.
 */
const navSections: readonly AdminNavSection[] = [
  {
    id: "home",
    title: "Home",
    links: [
      { href: "/admin", label: "Overview", exact: true },
      { href: "/admin/revenue", label: "Revenue", exact: false },
    ],
  },
  {
    id: "commerce",
    title: "Commerce",
    links: [
      { href: "/admin/orders", label: "Orders", exact: false },
      { href: "/admin/customers", label: "Customers", exact: false },
      { href: "/admin/countries", label: "Countries", exact: false },
      { href: "/admin/partners", label: "Partners", exact: false },
      { href: "/admin/promo-codes", label: "Promo Codes", exact: false },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    links: [
      { href: "/admin/payments", label: "Payments", exact: true },
      { href: "/admin/payments/pending", label: "Pending Payments", exact: false },
      { href: "/admin/payments/failed", label: "Failed Payments", exact: false },
      {
        href: "/admin/payments/recovery",
        label: "Payment Recovery",
        exact: false,
      },
      {
        href: "/admin/payments/webhooks",
        label: "Webhook Receipts",
        exact: false,
      },
      { href: "/admin/wallet-topups", label: "Wallet Top-ups", exact: false },
      { href: "/admin/refund-requests", label: "Refund Requests", exact: false },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    links: [
      { href: "/admin/reconciliation", label: "Reconciliation", exact: false },
      { href: "/admin/operations", label: "Operations", exact: true },
      {
        href: "/admin/operations/wallet-reservations",
        label: "Wallet Reservations",
        exact: false,
      },
      { href: "/admin/alerts", label: "Alerts", exact: false },
    ],
  },
  {
    id: "communication",
    title: "Communication",
    links: [
      { href: "/admin/emails", label: "Email Center", exact: false },
      { href: "/admin/email-campaigns", label: "Email Campaigns", exact: false },
    ],
  },
  {
    id: "admin-security",
    title: "Admin & Security",
    links: [
      { href: "/admin/audit-logs", label: "Audit Logs", exact: false },
      { href: "/admin/admin-users", label: "Admin Users", exact: false },
      {
        href: "/admin/test-data-cleanup",
        label: "Test Data Cleanup",
        exact: false,
      },
      { href: "/admin/settings", label: "Settings", exact: false },
    ],
  },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (href === "/admin/payments") {
    if (pathname === "/admin/payments") return true;
    // Canonical detail: /admin/payments/[attemptId] — not pending/failed/webhooks.
    if (
      pathname.startsWith("/admin/payments/") &&
      !pathname.startsWith("/admin/payments/pending") &&
      !pathname.startsWith("/admin/payments/failed") &&
      !pathname.startsWith("/admin/payments/recovery") &&
      !pathname.startsWith("/admin/payments/webhooks")
    ) {
      return true;
    }
    return false;
  }
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminNav({
  adminName,
  permissions,
}: {
  adminName: string;
  permissions: string[];
}) {
  const pathname = usePathname() || "/admin";
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      links: section.links.filter((link) =>
        canAccessAdminPath(permissions, link.href)
      ),
    }))
    .filter((section) => section.links.length > 0);

  return (
    <aside className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
        MAP eSIM Admin
      </p>
      <p className="mt-2 truncate px-2 text-sm font-semibold text-[var(--heading)]">
        {adminName}
      </p>
      <nav className="mt-4 flex flex-col gap-4" aria-label="Admin">
        {visibleSections.map((section) => (
          <div key={section.id}>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
              {section.title}
            </p>
            <div className="flex flex-col gap-1">
              {section.links.map((link) => {
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
            </div>
          </div>
        ))}
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
