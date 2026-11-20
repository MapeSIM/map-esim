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
  companyBadge,
  links,
}: {
  userName: string;
  userEmail: string;
  companyBadge?: string | null;
  links: readonly PartnerNavLink[];
}) {
  const pathname = usePathname() || "/partner";
  const badge = (companyBadge ?? "").trim() || userName;

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex max-w-full items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-300">
            <span className="truncate">{badge}</span>
          </p>
          <p className="mt-2 truncate text-sm font-semibold text-slate-100">
            {userName}
          </p>
          <p className="truncate text-xs text-slate-400">{userEmail}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-200 outline-none transition hover:border-emerald-500/40 hover:text-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            Sign out
          </button>
        </form>
      </div>

      <nav aria-label="Partner navigation">
        <ul className="flex flex-wrap gap-2">
          {links.map((link) => {
            if (link.disabled) {
              return (
                <li key={link.label}>
                  <span
                    className="inline-flex h-9 cursor-not-allowed items-center rounded-xl border border-slate-800 px-3 text-sm font-semibold text-slate-500 opacity-60"
                    aria-disabled="true"
                    title="Coming soon"
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
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                    active
                      ? "bg-emerald-400 text-slate-950"
                      : "border border-slate-700 text-slate-200 hover:border-emerald-500/40 hover:bg-slate-900"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
