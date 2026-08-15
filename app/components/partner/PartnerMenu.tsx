"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PartnerMenu({
  userName,
  userEmail,
  links,
}: {
  userName: string;
  userEmail: string;
  links: readonly PartnerNavLink[];
}) {
  const pathname = usePathname() || "/partner";

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--heading)]">
          {userName}
        </p>
        <p className="truncate text-xs text-[var(--text-muted)]">{userEmail}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          Partner portal
        </p>
      </div>

      <nav aria-label="Partner navigation">
        <ul className="flex flex-wrap gap-2">
          {links.map((link) => {
            if (link.disabled) {
              return (
                <li key={link.label}>
                  <span
                    className="inline-flex h-9 cursor-not-allowed items-center rounded-xl border border-[var(--border)] px-3 text-sm font-semibold text-[var(--text-soft)] opacity-60"
                    aria-disabled="true"
                    title="Coming in a future phase"
                  >
                    {link.label}
                  </span>
                </li>
              );
            }

            const active = isActive(pathname, link.href, link.exact);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] ${
                    active
                      ? "bg-[var(--accent-strong)] text-[var(--accent-ink)]"
                      : "border border-[var(--border-strong)] text-[var(--heading)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <form action={signOutAction}>
        <button
          type="submit"
          className="text-sm font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
