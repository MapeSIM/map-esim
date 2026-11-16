import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  MapPinned,
  QrCode,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { HomeTrustSection } from "@/app/components/home/HomeTrustSection";
import { HomePopularDestinations } from "@/app/components/home/HomePopularDestinations";
import { HomeFinalCta } from "@/app/components/home/HomeFinalCta";
import DeferredHomeEsimUsageWidget from "@/app/components/home/DeferredHomeEsimUsageWidget";
import DeferredEsimCompatibilityInlineTrigger from "@/app/components/esim/DeferredEsimCompatibilityInlineTrigger";
import { FaqAccordion } from "@/app/components/faq/FaqAccordion";
import { BRAND_NAME } from "@/app/lib/brand";
import {
  HOME_DISCOVERY_CTA_HREF,
  HOME_DISCOVERY_CTA_LABEL,
} from "@/app/lib/home/homeConversionSections";
import { absoluteCanonical } from "@/app/lib/seo/canonical";
import { publicPageShareMeta } from "@/app/lib/seo/socialShareMeta";

const homeCanonical = absoluteCanonical("/");
const homeTitle = `Buy Travel eSIM Online | ${BRAND_NAME}`;
const homeDescription = `Get travel data eSIM plans for destinations worldwide. Compare coverage, buy online, and install instantly with QR — stay connected abroad with ${BRAND_NAME}.`;

export const metadata: Metadata = {
  title: homeTitle,
  description: homeDescription,
  alternates: { canonical: homeCanonical },
  ...publicPageShareMeta({
    title: homeTitle,
    description: homeDescription,
    url: homeCanonical,
  }),
};

const steps = [
  {
    title: "Choose a destination",
    description:
      "Select a country, regional, or global eSIM plan that fits your trip.",
    icon: MapPinned,
  },
  {
    title: "Complete checkout",
    description:
      "Confirm your plan details and purchase with your preferred currency display.",
    icon: ShieldCheck,
  },
  {
    title: "Install and connect",
    description:
      "Use your order details to install the eSIM and get online abroad.",
    icon: QrCode,
  },
];

const faqs = [
  {
    question: "How quickly can I use my eSIM?",
    answer:
      "After purchase, your eSIM order details are available for installation. Activation timing depends on the plan and your device setup.",
  },
  {
    question: "How do I know if my phone supports eSIM?",
    answer:
      "Check your phone settings for an eSIM or cellular plan option, or confirm with your device manufacturer. MAP eSIM plans require an eSIM-capable unlocked device.",
  },
  {
    question: "Can I buy a plan before I travel?",
    answer:
      "Yes. You can purchase in advance and install when you are ready, based on the plan instructions provided with your order.",
  },
  {
    question: "Do prices change with the currency selector?",
    answer:
      "Displayed prices convert from the provider USD base for convenience. Checkout still verifies the real offer by offer ID before creating an order.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--heading)]">
      {/* Hero */}
      <section className="border-b border-[var(--border)] bg-[radial-gradient(ellipse_at_top_left,var(--hero-glow)_0%,_transparent_45%),linear-gradient(180deg,var(--page-bg-soft)_0%,var(--page-bg)_100%)]">
        <div className="mx-auto grid max-w-[1200px] items-center gap-6 px-4 py-8 sm:gap-8 sm:px-6 sm:py-10 lg:grid-cols-2 lg:gap-12 lg:py-14">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
              MAP eSIM travel connectivity
            </p>
            <h1 className="mt-2.5 text-[2rem] font-bold leading-tight tracking-tight text-[var(--heading)] sm:mt-3 sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              Stay connected wherever you travel
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--text-muted)] sm:mt-4 sm:text-lg">
              Browse eSIM plans by destination, compare data options, and get
              connected before your trip.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:mt-6 sm:flex-row">
              <Link
                href={HOME_DISCOVERY_CTA_HREF}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 sm:w-auto"
              >
                {HOME_DISCOVERY_CTA_LABEL}
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
              <Link
                href="#home-popular-heading"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-6 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60 sm:w-auto"
              >
                Browse popular
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[28px] border border-[var(--border-strong)] bg-[var(--surface)] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:p-7">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(124,255,0,0.12),_transparent_45%)]" />
            <div className="relative space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-soft)]">
                <Smartphone className="h-3.5 w-3.5" />
                Designed for travelers
              </div>
              <h2 className="text-xl font-bold text-[var(--heading)] sm:text-3xl">
                Your travel internet, ready before takeoff
              </h2>
              <p className="text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
                Digital delivery after purchase — no physical SIM swap required.
              </p>
            </div>
          </div>
        </div>
      </section>

      <HomeTrustSection />

      <HomePopularDestinations />

      <DeferredHomeEsimUsageWidget />

      {/* How it works */}
      <section className="border-y border-[var(--border)] bg-[var(--page-bg-soft)]/70">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <div className="flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:max-w-none">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
                How it works
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--heading)] sm:mt-3 sm:text-4xl">
                Three clear steps to get online
              </h2>
            </div>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-strong)] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Full guide
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3 sm:mt-10 sm:gap-5">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--accent-strong)] sm:h-12 sm:w-12">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-semibold text-[var(--text-soft)]">
                      Step {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-[var(--heading)] sm:mt-5 sm:text-xl">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="mt-6 text-center text-sm text-[var(--text-muted)] sm:mt-8">
            Not sure your phone supports eSIM?{" "}
            <DeferredEsimCompatibilityInlineTrigger
              label="Check eSIM compatibility (?)"
              footerAction="explore"
              className="inline font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            />
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className="border-t border-[var(--border)] bg-[var(--page-bg-soft)]/50"
      >
        <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 sm:py-16">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
              FAQ
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl">
              Common questions
            </h2>
          </div>

          <div className="mt-8 sm:mt-10">
            <FaqAccordion items={faqs} />
          </div>
          <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
            Need more help?{" "}
            <Link
              href="/support"
              className="font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-strong)]"
            >
              Support Center
            </Link>
            {" · "}
            <Link
              href="/contact"
              className="font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-strong)]"
            >
              Contact
            </Link>
            {" · "}
            <Link
              href="/how-it-works"
              className="font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-strong)]"
            >
              How It Works
            </Link>
          </p>
        </div>
      </section>

      <HomeFinalCta />
    </main>
  );
}
