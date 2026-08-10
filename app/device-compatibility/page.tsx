import type { Metadata } from "next";
import Link from "next/link";
import DeviceCompatibilityChecker from "@/app/components/deviceCompatibility/DeviceCompatibilityChecker";
import { BRAND_NAME } from "@/app/lib/brand";
import { COMPATIBILITY_DISCLAIMER } from "@/app/lib/deviceCompatibility/catalog";
import { absoluteCanonical } from "@/app/lib/seo/canonical";

const title = `eSIM Device Compatibility Checker | ${BRAND_NAME}`;
const description =
  "Check whether your Apple, Samsung, or Google Pixel phone is likely eSIM-compatible before buying a MAP eSIM. Guidance only — not a guarantee.";
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

export default function DeviceCompatibilityPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--heading)]">
      <section className="border-b border-[var(--border)] bg-[radial-gradient(ellipse_at_top_left,var(--hero-glow)_0%,_transparent_45%),linear-gradient(180deg,var(--page-bg-soft)_0%,var(--page-bg)_100%)]">
        <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            Before you buy
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            eSIM device compatibility checker
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
            Use this quick guide to see whether your phone is{" "}
            <strong className="font-semibold text-[var(--heading)]">
              likely
            </strong>{" "}
            able to use an eSIM. Results are not a guarantee — support can differ
            by model, region, and carrier lock.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.2)] sm:p-8">
          <DeviceCompatibilityChecker />
        </div>

        <aside
          className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--page-bg-soft)] p-4 text-sm leading-relaxed text-[var(--text-muted)]"
          aria-label="Compatibility disclaimer"
        >
          {COMPATIBILITY_DISCLAIMER}
        </aside>

        <p className="mt-6 text-sm text-[var(--text-muted)]">
          Need setup steps after purchase? See the{" "}
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
          install guides, or visit{" "}
          <Link
            href="/support"
            className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          >
            Support
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
