import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Earth,
  Globe2,
  MapPinned,
  QrCode,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";

const categories = [
  {
    title: "Countries",
    description: "Browse local eSIM plans for individual destinations.",
    href: "/countries",
    icon: Globe2,
    label: "Explore countries",
  },
  {
    title: "Popular",
    description: "Start with frequently chosen travel destinations.",
    href: "/countries?filter=Popular",
    icon: Sparkles,
    label: "View popular",
  },
  {
    title: "Global & Regional",
    description: "Multi-country coverage for broader travel itineraries.",
    href: "/countries?filter=Regional",
    icon: Earth,
    label: "Browse coverage",
  },
];

const steps = [
  {
    title: "Choose a destination",
    description: "Select a country, regional, or global eSIM plan that fits your trip.",
    icon: MapPinned,
  },
  {
    title: "Complete checkout",
    description: "Confirm your plan details and purchase with your preferred currency display.",
    icon: ShieldCheck,
  },
  {
    title: "Install and connect",
    description: "Use your order details to install the eSIM and get online abroad.",
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
      {/* Announcement */}
      <div className="border-b border-[var(--border)]/60 bg-[var(--surface-2)]">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-center gap-2 px-4 py-2.5 text-center text-xs text-[var(--text)] sm:flex-row sm:gap-4 sm:px-6 sm:text-sm">
          <span className="inline-flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-[var(--accent-strong)]" />
            Instant digital delivery
          </span>
          <span className="hidden h-1 w-1 rounded-full bg-[var(--accent-strong)]/70 sm:inline-block" />
          <span className="inline-flex items-center gap-2">
            <Wifi className="h-3.5 w-3.5 text-[var(--accent-strong)]" />
            No physical SIM required
          </span>
          <span className="hidden h-1 w-1 rounded-full bg-[var(--accent-strong)]/70 sm:inline-block" />
          <span className="inline-flex items-center gap-2">
            <Globe2 className="h-3.5 w-3.5 text-[var(--accent-strong)]" />
            Country, regional and global plans
          </span>
        </div>
      </div>

      {/* Hero */}
      <section className="border-b border-[var(--border)] bg-[radial-gradient(ellipse_at_top_left,var(--hero-glow)_0%,_transparent_45%),linear-gradient(180deg,var(--page-bg-soft)_0%,var(--page-bg)_100%)]">
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
              MAP eSIM travel connectivity
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-[var(--heading)] sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              Stay connected abroad with travel eSIM plans
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
              Browse destination plans, compare data options, and checkout with
              verified offer pricing — built for clear travel connectivity.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/countries"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
              >
                Browse destinations
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/countries/region-asia"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-6 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)]"
              >
                View regional plans
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[28px] border border-[var(--border-strong)] bg-[var(--surface)] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.35)] sm:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(124,255,0,0.12),_transparent_45%)]" />
            <div className="relative space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-soft)]">
                <Smartphone className="h-3.5 w-3.5" />
                Designed for travelers
              </div>
              <h2 className="text-2xl font-bold text-[var(--heading)] sm:text-3xl">
                Find the right plan before you land
              </h2>
              <ul className="space-y-3 text-sm text-[var(--text)]">
                {[
                  "Live destination and offer catalog",
                  "Clear data, validity and coverage details",
                  "Currency display for USD, PKR and more",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <Wifi className="h-5 w-5 text-[var(--accent-strong)]" />
                  <p className="mt-3 text-sm font-semibold text-[var(--heading)]">
                    Data-focused plans
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <Settings2 className="h-5 w-5 text-[var(--accent-strong)]" />
                  <p className="mt-3 text-sm font-semibold text-[var(--heading)]">
                    Easy plan comparison
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
            Explore
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl">
            Choose how you want to browse plans
          </h2>
          <p className="mt-3 text-[var(--text-muted)]">
            Jump into country plans, popular destinations, or broader regional
            and global coverage.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Link
                key={category.title}
                href={category.href}
                className="
                  group rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6
                  shadow-[0_12px_30px_rgba(0,0,0,0.2)] transition
                  hover:-translate-y-1 hover:border-[var(--border-hover)]
                "
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--accent-strong)]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-xl font-bold text-[var(--heading)]">
                  {category.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {category.description}
                </p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]">
                  {category.label}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-[var(--border)] bg-[var(--page-bg-soft)]/70">
        <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl">
              Three clear steps to get online
            </h2>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--accent-strong)]">
                      <Icon className="h-5 w-5" />
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
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Compatible devices */}
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid items-center gap-8 rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
              Device readiness
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl">
              Compatible devices
            </h2>
            <p className="mt-4 max-w-xl text-[var(--text-muted)]">
              MAP eSIM plans require an unlocked phone that supports eSIM. We
              do not list unverified model claims — check your device settings
              or manufacturer documentation before purchase.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-[var(--text)]">
              {[
                "Look for Cellular / Mobile Service settings that mention eSIM or Add eSIM",
                "Confirm your device is carrier-unlocked",
                "Keep a stable internet connection for installation",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface-2)] p-6">
            <Smartphone className="h-8 w-8 text-[var(--accent-strong)]" />
            <h3 className="mt-4 text-xl font-bold text-[var(--heading)]">
              Quick compatibility check
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              Open your phone settings, search for “eSIM”, and verify that your
              device can add a cellular plan digitally. If that option is
              missing, a physical SIM may still be required.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-[var(--border)] bg-[var(--page-bg-soft)]/50">
        <div className="mx-auto max-w-[900px] px-4 py-16 sm:px-6 sm:py-20">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
              FAQ
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl">
              Common questions
            </h2>
          </div>

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
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20">
        <div className="theme-cta overflow-hidden rounded-[28px] border border-[var(--accent-strong)]/25 px-6 py-10 text-center sm:px-10">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl">
            Ready to get your travel eSIM?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--text)]">
            Compare real destination plans and continue to checkout with
            verified offer pricing.
          </p>
          <Link
            href="/countries"
            className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-7 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)]"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}
