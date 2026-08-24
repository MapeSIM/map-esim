import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/app/lib/auth/session";

/**
 * Legacy public /dashboard used hardcoded demo eSIM data.
 * Authenticated customers are sent to real /account/orders.
 * Guests see an empty state — never a fake order.
 */
export default async function DashboardPage() {
  const user = await getSessionUser();

  if (user?.role === "CUSTOMER") {
    redirect("/account/orders");
  }
  if (user?.role === "PARTNER") {
    redirect("/partner/orders");
  }
  if (user?.role === "ADMIN") {
    redirect("/admin/orders");
  }

  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-6 py-16 text-[var(--heading)]">
      <section className="mx-auto max-w-xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">My eSIMs</h1>
        <p className="mt-4 text-[var(--text-muted)]">
          No eSIMs to show. Sign in to view purchased plans, or browse
          destinations to get started.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/signin?callbackUrl=%2Faccount%2Forders"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--accent-strong)] px-5 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95"
          >
            Sign in
          </Link>
          <Link
            href="/countries"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--accent-strong)]/40"
          >
            Browse destinations
          </Link>
        </div>
      </section>
    </main>
  );
}
