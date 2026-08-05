import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  MapPin,
  QrCode,
  Smartphone,
  Wifi,
} from "lucide-react";
import Breadcrumbs from "@/app/components/seo/Breadcrumbs";
import JsonLd from "@/app/components/seo/JsonLd";
import { BRAND_NAME, BRAND_SITE_URL } from "@/app/lib/brand";
import {
  breadcrumbList,
  PAKISTAN_DESTINATION_PATH,
  SITE_ORG_ID,
  SITE_WEBSITE_ID,
} from "@/app/lib/seo/siteGraph";

const title = `How It Works | ${BRAND_NAME}`;
const description =
  "Learn how MAP eSIM works: choose a destination plan, complete checkout, then install and activate your travel eSIM on iPhone or Android.";
const canonical = `${BRAND_SITE_URL}/how-it-works`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/how-it-works" },
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

const steps = [
  {
    title: "Choose a destination and plan",
    description:
      "Browse countries and regional coverage, then review data amount, validity, and price before you buy.",
    icon: MapPin,
  },
  {
    title: "Complete checkout",
    description:
      "Confirm the verified offer and complete checkout. Order details appear in your account and email when delivery succeeds.",
    icon: CreditCard,
  },
  {
    title: "Install and activate the eSIM",
    description:
      "Install with the QR code or manual details from your order, then enable the line and data roaming at your destination when required.",
    icon: Smartphone,
  },
] as const;

const faqs = [
  {
    question: "Do I need an unlocked phone?",
    answer:
      "Yes in most cases. Your device must support eSIM and is normally carrier-unlocked so it can join partner networks abroad.",
  },
  {
    question: "When should I install the eSIM?",
    answer:
      "You can usually install before travel over Wi-Fi. Keep the line ready, then enable mobile data and roaming after you arrive if your plan requires it.",
  },
  {
    question: "Will my home number keep working?",
    answer:
      "Many devices can keep your primary line for calls and texts while using the travel eSIM for data. Exact behavior depends on your phone and carrier settings.",
  },
  {
    question: "What if I need help after purchase?",
    answer:
      "Use the Support Center or Contact page with your order reference and destination. Do not share passwords, payment card numbers, QR images, or activation codes.",
  },
] as const;

export default function HowItWorksPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "HowTo",
        "@id": `${canonical}#howto`,
        name: `How ${BRAND_NAME} works`,
        description,
        url: canonical,
        isPartOf: { "@id": SITE_WEBSITE_ID },
        publisher: { "@id": SITE_ORG_ID },
        step: steps.map((step, index) => ({
          "@type": "HowToStep",
          position: index + 1,
          name: step.title,
          text: step.description,
          url: `${canonical}#step-${index + 1}`,
        })),
      },
      breadcrumbList([
        { name: "Home", path: "/" },
        { name: "How It Works", path: "/how-it-works" },
      ]),
    ],
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--heading)]">
      <JsonLd data={structuredData} />

      <section className="border-b border-[var(--border)] bg-[radial-gradient(ellipse_at_top_left,var(--hero-glow)_0%,_transparent_45%),linear-gradient(180deg,var(--page-bg-soft)_0%,var(--page-bg)_100%)]">
        <div className="mx-auto max-w-[1200px] px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8 lg:pb-14 lg:pt-10">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "How It Works" },
            ]}
          />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            MAP eSIM GUIDE
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-[var(--heading)] sm:text-5xl lg:leading-[1.08]">
            How MAP eSIM works
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
            From destination browsing to installation, MAP eSIM is built around
            clear plan details and a straightforward setup path for travel data.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/countries"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Browse destinations
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={PAKISTAN_DESTINATION_PATH}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-6 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Pakistan eSIM plans
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl">
            Three clear steps
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
            Choose coverage, complete checkout, then install when you are ready
            to connect.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article
                  key={step.title}
                  id={`step-${index + 1}`}
                  className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--accent-strong)]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-semibold text-[var(--text-soft)]">
                      Step {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-[var(--heading)]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                    {step.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/50">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl">
              Review data, validity, and coverage
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
              Before checkout, confirm the destination list, data allowance, and
              validity window for the plan you selected. Regional and global
              options may cover multiple countries under one package.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-[var(--text)]">
              {[
                "Match the plan to where you will travel",
                "Check data volume and days of validity",
                "Compare country, regional, and global options when available",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            <Wifi className="h-7 w-7 text-[var(--accent-strong)]" aria-hidden="true" />
            <h3 className="mt-4 text-xl font-bold text-[var(--heading)]">
              Device and roaming notes
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              Your phone must support eSIM and is normally carrier-unlocked. At
              your destination, enable the travel eSIM line and turn on data
              roaming for that line when the plan requires it. Network
              registration can take a short time after arrival.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl">
              QR and manual installation
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
              Installation details appear in your verified order after a
              successful purchase. Prefer a stable Wi-Fi connection while adding
              the eSIM.
            </p>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6">
              <QrCode className="h-6 w-6 text-[var(--accent-strong)]" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-bold text-[var(--heading)]">
                QR code install
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                Open the camera or cellular settings on your phone and scan the
                QR image from your order email or account order page.
              </p>
            </div>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6">
              <Smartphone className="h-6 w-6 text-[var(--accent-strong)]" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-bold text-[var(--heading)]">
                Manual install
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                If scanning is unavailable, enter the SM-DP+ address and
                activation code from your order details. Keep those values
                private.
              </p>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/install/iphone"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-6 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)]"
            >
              iPhone installation guide
            </Link>
            <Link
              href="/install/android"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-6 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)]"
            >
              Android installation guide
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/50">
        <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl">
            Quick FAQ
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-[var(--text-muted)]">
            Clear answers about eSIM setup, installation, activation, and
            support.
          </p>
          <div className="mt-10 space-y-3">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4 open:border-[var(--border-hover)]"
              >
                <summary className="cursor-pointer list-none text-base font-semibold text-[var(--heading)] marker:content-none">
                  <span className="flex items-center justify-between gap-4">
                    {faq.question}
                    <span className="text-[var(--accent-strong)] transition group-open:rotate-45">
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/support"
              className="text-sm font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-strong)]"
            >
              Support Center
            </Link>
            <span className="hidden text-[var(--text-soft)] sm:inline" aria-hidden="true">
              ·
            </span>
            <Link
              href="/contact"
              className="text-sm font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-strong)]"
            >
              Contact support
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
