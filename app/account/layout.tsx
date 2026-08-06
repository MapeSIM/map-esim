import Link from "next/link";
import { requireSession } from "@/app/lib/auth/session";
import { signOutAction } from "@/app/lib/auth/actions";

export const dynamic = "force-dynamic";

const links = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "My eSIMs" },
  { href: "/account/wallet", label: "Wallet" },
  { href: "/account/wallet/top-up", label: "Add funds" },
  { href: "/account/esim/buy", label: "Buy with wallet" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/security", label: "Security" },
];

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireSession();

  return (
    <main className="min-h-screen w-full max-w-full bg-[var(--page-bg)] px-3 py-10 text-[var(--heading)] sm:px-6">
      <div className="mx-auto grid w-full min-w-0 max-w-5xl gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="min-w-0 max-w-full rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
            Account
          </p>
          <p className="mt-2 truncate px-2 text-sm font-semibold">{user.name}</p>
          <p className="truncate px-2 text-xs text-[var(--text-muted)]">
            {user.email}
          </p>
          <nav className="mt-4 flex flex-col gap-1" aria-label="Account">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface-2)] hover:text-[var(--heading)]"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <form action={signOutAction} className="mt-4 px-2">
            <button
              type="submit"
              className="text-sm font-semibold text-[var(--danger-text)]"
            >
              Sign out
            </button>
          </form>
        </aside>
        <section className="min-w-0 w-full max-w-full rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}
