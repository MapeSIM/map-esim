import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  HelpCircle,
  Mail,
  Package,
  QrCode,
  Smartphone,
  Wallet,
  Wifi,
} from "lucide-react";
import { BRAND_NAME, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";

export const metadata: Metadata = {
  title: `Support Center | ${BRAND_NAME}`,
  description:
    "Get help with MAP eSIM installation, activation, orders, wallet balance and travel connectivity.",
  alternates: { canonical: "/support" },
  openGraph: {
    title: `Support Center | ${BRAND_NAME}`,
    description:
      "Get help with MAP eSIM installation, activation, orders, wallet balance and travel connectivity.",
    url: "/support",
    siteName: BRAND_NAME,
    type: "website",
  },
};

const quickHelp = [
  {
    title: "How MAP eSIM works",
    description: "Choose a plan, check out securely, then install and activate.",
    href: "/how-it-works",
    icon: HelpCircle,
  },
  {
    title: "Device compatibility",
    description:
      "Check whether your phone is likely eSIM-compatible before you buy.",
    href: "/device-compatibility",
    icon: Smartphone,
  },
  {
    title: "Install on iPhone",
    description: "Step-by-step guide for adding your eSIM on iOS.",
    href: "/install/iphone",
    icon: Smartphone,
  },
  {
    title: "Install on Android",
    description: "Install using the QR code from your order details.",
    href: "/install/android",
    icon: Smartphone,
  },
  {
    title: "Contact support",
    description: "Send a message or email the MAP eSIM support team.",
    href: "/contact",
    icon: Mail,
  },
  {
    title: "View your orders",
    description: "Open your account orders for installation details.",
    href: "/account/orders",
    icon: Package,
  },
  {
    title: "Browse FAQs",
    description: "Answers to common purchase and setup questions.",
    href: "/#faq",
    icon: HelpCircle,
  },
] as const;

const topics = [
  {
    title: "Device compatibility",
    icon: Smartphone,
    body: "MAP eSIM plans require an unlocked phone that supports eSIM. Use the device compatibility checker before purchase, or confirm Add eSIM in Settings / manufacturer docs.",
    href: "/device-compatibility",
    linkLabel: "Open compatibility checker",
  },
  {
    title: "QR code and manual installation",
    icon: QrCode,
    body: "Install from the QR image in your order email or account order page. If scanning is unavailable, use the SM-DP+ address and activation code from your verified order details. Prefer Wi-Fi during installation.",
  },
  {
    title: "Activation and data roaming",
    icon: Wifi,
    body: "After arrival, enable the eSIM line and turn on data roaming for that line when your plan requires it. Select the travel eSIM for mobile data, then wait briefly for the network to register.",
  },
  {
    title: "Order and payment status",
    icon: CreditCard,
    body: "Successful purchases show order details in your account. Checkout verifies the real offer before an order is created. For status questions, contact support with your order reference and destination only.",
  },
  {
    title: "Wallet balance and reversals",
    icon: Wallet,
    body: "Wallet activity appears in your account wallet history. If a purchase fails after funds were reserved, confirmed failures are reversed according to the wallet purchase flow. Do not share full payment card details by email.",
  },
  {
    title: "Connectivity troubleshooting",
    icon: Wifi,
    body: "Confirm the eSIM is enabled, data roaming is on where needed, and the correct line is selected for mobile data. Toggle airplane mode or restart the device if the network does not attach after arrival.",
  },
] as const;

const checklist = [
  "Confirm your device supports eSIM",
  "Confirm your device is carrier-unlocked",
  "Install while connected to stable Wi-Fi",
  "Enable the eSIM line after installation",
  "Enable data roaming after arrival when required",
  "Select the correct eSIM for mobile data",
  "Restart the device if the network does not connect",
] as const;

const mailtoHref = `mailto:${BRAND_SUPPORT_EMAIL}?subject=${encodeURIComponent(
  `${BRAND_NAME} support request`
)}`;

export default function SupportPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--heading)]">
      {/* Hero */}
      <section className="border-b border-[var(--border)] bg-[radial-gradient(ellipse_at_top_left,var(--hero-glow)_0%,_transparent_45%),linear-gradient(180deg,var(--page-bg-soft)_0%,var(--page-bg)_100%)]">
        <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 sm:py-16 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            MAP eSIM Support
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight text-[var(--heading)] sm:text-5xl lg:leading-[1.08]">
            How can we help?
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
            Find guidance for purchasing, installation, activation, connectivity,
            wallet activity and orders. Start with the quick links below, or
            contact support if you still need help.
          </p>
        </div>
      </section>

      {/* Quick help */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-14">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl">
            Quick help
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
            Jump to installation guides, your orders, or common questions.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickHelp.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--accent-strong)]/35 bg-[var(--accent-strong)]/10 text-[var(--accent-strong)]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="mt-4 text-base font-semibold text-[var(--heading)]">
                    {item.title}
                  </span>
                  <span className="mt-1.5 flex-1 text-sm leading-relaxed text-[var(--text-muted)]">
                    {item.description}
                  </span>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-strong)]">
                    Open
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Topics */}
      <section className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/50">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-14">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl">
            Common support topics
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
            Short guidance for the issues customers ask about most often.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {topics.map((topic) => {
              const Icon = topic.icon;
              return (
                <article
                  key={topic.title}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--accent-strong)]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-[var(--heading)] sm:text-lg">
                        {topic.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                        {topic.body}
                      </p>
                      {"href" in topic && topic.href ? (
                        <Link
                          href={topic.href}
                          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                        >
                          {"linkLabel" in topic ? topic.linkLabel : "Learn more"}
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact + order help */}
      <section className="border-b border-[var(--border)]">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--heading)]">
              Contact support
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              Email{" "}
              <a
                href={mailtoHref}
                className="font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-strong)]"
              >
                {BRAND_SUPPORT_EMAIL}
              </a>{" "}
              with the details needed to investigate your request.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-[var(--text)]">
              {[
                "Order reference",
                "Destination",
                "Device model",
                "Brief description of the issue",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm leading-relaxed text-[var(--warning-text)]">
              Do not email passwords, full payment details, activation codes, QR
              images, ICCIDs, or other sensitive installation secrets.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/contact"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
              >
                Contact form
              </Link>
              <a
                href={mailtoHref}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-6 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                Email support
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--heading)]">
              Order help
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              Signed-in customers can review purchase and installation details in
              their account. We do not offer public order lookup by email or
              query parameters.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/account/orders"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
              >
                View orders
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/account/wallet"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--page-bg)] px-6 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
              >
                Wallet history
              </Link>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-[var(--text-muted)]">
              Need an account first?{" "}
              <Link
                href="/signin"
                className="font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-strong)]"
              >
                Sign in
              </Link>{" "}
              or{" "}
              <Link
                href="/signup"
                className="font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-strong)]"
              >
                create an account
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Checklist */}
      <section className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/50">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-14">
          <h2 className="text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl">
            Emergency troubleshooting checklist
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
            Work through these steps before contacting support about connectivity
            issues after arrival.
          </p>
          <ol className="mt-8 grid gap-3 md:grid-cols-2">
            {checklist.map((item, index) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-sm text-[var(--text)]"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-strong)]/15 text-xs font-bold text-[var(--heading)]">
                  {index + 1}
                </span>
                <span className="pt-1 leading-relaxed">{item}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 sm:py-16">
        <div className="theme-cta overflow-hidden rounded-[28px] border border-[var(--accent-strong)]/25 px-6 py-10 text-center sm:px-10">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl">
            Still need help?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--text)]">
            Contact support with your order reference and issue details, or
            browse destinations if you are ready to choose a plan.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={mailtoHref}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-7 text-sm font-bold text-[var(--accent-ink)] transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              <Mail className="h-4 w-4" aria-hidden="true" />
              Contact support
            </a>
            <Link
              href="/countries"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-7 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Browse destinations
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
