import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EsimCompatibilityChecker } from "@/app/components/esim/EsimCompatibilityChecker";
import { BRAND_NAME } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";
import { publicPageShareMeta } from "@/app/lib/seo/socialShareMeta";

const title = `Check Device Compatibility | ${BRAND_NAME}`;
const description =
  "Before buying a MAP eSIM, confirm your phone supports eSIM and is carrier-unlocked. Search your model or verify with *#06# — guidance only, not a guarantee.";
const canonical = absoluteCanonical("/device-compatibility");

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  ...publicPageShareMeta({ title, description, url: canonical }),
  robots: { index: true, follow: true },
};

export default function DeviceCompatibilityPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--heading)]">
      <section className="border-b border-[var(--border)] bg-[radial-gradient(ellipse_at_top_left,var(--hero-glow)_0%,_transparent_45%),linear-gradient(180deg,var(--page-bg-soft)_0%,var(--page-bg)_100%)]">
        <div className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            Before you buy
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Check Device Compatibility
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
            Search your phone model or dial *#06# to confirm eSIM support.
            Guidance only — {BRAND_NAME} does not require IMEI, EID, or TAC, and
            does not guarantee compatibility for every device.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-lg space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        <section
          className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-4 sm:p-5"
          aria-label="Interactive eSIM compatibility checker"
        >
          <EsimCompatibilityChecker modelListMaxClassName="max-h-52 sm:max-h-64" />
        </section>

        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
          <Link
            href="/countries"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent-strong)] px-5 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            Browse eSIM Plans
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </Link>
          <Link
            href="/support"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            Need Help?
          </Link>
        </div>

        <p className="text-sm text-[var(--text-muted)]">
          After purchase, see the{" "}
          <Link
            href="/install/iphone"
            className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            iPhone
          </Link>{" "}
          or{" "}
          <Link
            href="/install/android"
            className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            Android
          </Link>{" "}
          install guides, or{" "}
          <Link
            href="/contact"
            className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            contact us
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
