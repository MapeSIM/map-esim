"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { signOutAction } from "@/app/lib/auth/actions";

export type AccountNavLink = {
  href: string;
  label: string;
  exact?: boolean;
};

type Props = {
  userName: string;
  userEmail: string;
  links: readonly AccountNavLink[];
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact || href === "/account") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AccountMenu({ userName, userEmail, links }: Props) {
  const pathname = usePathname() || "/account";
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus first link when opened.
    const firstLink = panelRef.current?.querySelector<HTMLElement>(
      "a[href], button[type='submit']"
    );
    firstLink?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <div className="relative flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--heading)]">
          {userName}
        </p>
        <p className="truncate text-xs text-[var(--text-muted)]">{userEmail}</p>
      </div>

      {/* Mobile uses the global Navbar drawer — hide this duplicate Account control below lg. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "Close account menu" : "Open account menu"}
        aria-expanded={open}
        aria-controls={panelId}
        className="hidden h-10 shrink-0 items-center gap-2 rounded-[14px] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] lg:inline-flex"
      >
        {open ? (
          <X className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Menu className="h-4 w-4" aria-hidden="true" />
        )}
        <span>Account</span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close account menu"
            className="fixed inset-0 z-40 bg-black/45"
            onClick={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
          />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Account menu"
            className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(100vw-1.5rem,18rem)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
          >
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
              Account
            </p>
            <nav className="flex flex-col gap-1" aria-label="Account">
              {links.map((link) => {
                const active = isActive(pathname, link.href, link.exact);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={
                      active
                        ? "rounded-xl bg-[var(--accent-strong)]/12 px-3 py-2 text-sm font-semibold text-[var(--accent-strong)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                        : "rounded-xl px-3 py-2 text-sm font-medium text-[var(--text)] outline-none transition hover:bg-[var(--surface-2)] hover:text-[var(--heading)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
                    }
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 border-t border-[var(--border)] px-2 pt-3">
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-sm font-semibold text-[var(--danger-text)] outline-none focus-visible:underline"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
