import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LockKeyhole, Smartphone } from "lucide-react";
import { BRAND_NAME } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";

const title = `Check Device Compatibility | ${BRAND_NAME}`;
const description =
  "Before buying a MAP eSIM, confirm your phone supports eSIM and is carrier-unlocked. Quick settings checks for iPhone and Android — guidance only, not a guarantee.";
const canonical = absoluteCanonical("/device-compatibility");

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  openGraph: {
    title,
    description,
    url: canonical,
    siteName: BRAND_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: { index: true, follow: true },
};

const sectionCardClass =
  "rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-5 sm:p-6";

export default function DeviceCompatibilityPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--heading)]">
      <section className="border-b border-[var(--border)] bg-[radial-gradient(ellipse_at_top_left,var(--hero-glow)_0%,_transparent_45%),linear-gradient(180deg,var(--page-bg-soft)_0%,var(--page-bg)_100%)]">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            Before you buy
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Check Device Compatibility
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
            Before purchasing, make sure your phone supports eSIM and is
            carrier-unlocked. This page is guidance only — {BRAND_NAME} does not
            guarantee compatibility for every device.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-2xl space-y-5 px-4 py-10 sm:px-6 sm:py-12">
        <section className={sectionCardClass} aria-labelledby="esim-support-heading">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10">
              <Smartphone
                className="h-5 w-5 text-[var(--accent-strong)]"
                aria-hidden
              />
            </div>
            <div className="min-w-0">
              <h2
                id="esim-support-heading"
                className="text-lg font-semibold tracking-tight"
              >
                Does my phone support eSIM?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                Use your phone settings. Menu names differ by model and software
                version — these steps do not work identically on every device.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                iPhone quick check
              </h3>
              <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-relaxed text-[var(--text)]">
                <li>Open Settings</li>
                <li>Go to Cellular / Mobile Data / Mobile Service</li>
                <li>Look for “Add eSIM” or “Add Cellular Plan”</li>
              </ol>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <h3 className="text-sm font-semibold text-[var(--heading)]">
                Android quick check
              </h3>
              <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-relaxed text-[var(--text)]">
                <li>Open Settings</li>
                <li>Search for “eSIM”, “SIM Manager”, or “Add eSIM”</li>
                <li>Wording varies by manufacturer and device</li>
              </ol>
            </div>
          </div>
        </section>

        <section className={sectionCardClass} aria-labelledby="unlocked-heading">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10">
              <LockKeyhole
                className="h-5 w-5 text-[var(--accent-strong)]"
                aria-hidden
              />
            </div>
            <div className="min-w-0">
              <h2
                id="unlocked-heading"
                className="text-lg font-semibold tracking-tight"
              >
                Is my phone unlocked?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                A carrier-locked phone may support eSIM technically but may not
                accept another provider’s eSIM. Check Settings for carrier lock
                status where available, or contact your mobile carrier before you
                buy.
              </p>
            </div>
          </div>
        </section>

        <section
          className="rounded-2xl border border-[var(--border)] bg-[var(--page-bg-soft)] p-5 sm:p-6"
          aria-labelledby="important-heading"
        >
          <h2
            id="important-heading"
            className="text-lg font-semibold tracking-tight"
          >
            Important
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--text-muted)]">
            <li>
              eSIM support varies by model, region, and carrier — some versions of
              the same phone differ.
            </li>
            <li>Verify your device before purchase.</li>
            <li>
              {BRAND_NAME} does not require IMEI, EID, or TAC for this
              compatibility check, and does not guarantee that every device will
              install or connect successfully.
            </li>
          </ul>
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
