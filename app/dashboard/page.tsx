"use client";

import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[var(--page-bg)] px-6 py-16 text-[var(--heading)]">
      <section className="mx-auto max-w-5xl">
        <h1 className="text-center text-5xl font-bold text-[var(--heading)]">
          My eSIMs
        </h1>

        <p className="mt-4 text-center text-[var(--text-muted)]">
          Manage your purchased eSIM plans
        </p>

        <div className="mt-12 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[var(--shadow)]">
          <h2 className="text-3xl font-bold text-[var(--heading)]">
            Pakistan eSIM
          </h2>

          <div className="mt-6 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6 text-[var(--text)]">
            <p>
              Data:
              <b className="text-[var(--heading)]"> 5GB</b>
            </p>

            <p>
              Validity:
              <b className="text-[var(--heading)]"> 30 Days</b>
            </p>

            <p>
              Order ID:
              <b className="text-[var(--accent-soft)]"> MAP-ESIM-58291</b>
            </p>

            <p>
              Status:
              <b className="text-[var(--accent-soft)]"> Active</b>
            </p>
          </div>

          <Link
            href="/success"
            className="
              mt-8 inline-block rounded-xl bg-[var(--accent)]
              px-8 py-3 font-bold text-[var(--accent-ink)]
            "
          >
            View QR Code →
          </Link>
        </div>
      </section>
    </main>
  );
}
