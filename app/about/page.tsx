import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Globe2,
  Handshake,
  Headphones,
  LockKeyhole,
  MapPinned,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import Breadcrumbs from "@/app/components/seo/Breadcrumbs";
import JsonLd from "@/app/components/seo/JsonLd";
import { BRAND_NAME, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";
import {
  breadcrumbList,
  SITE_ORG_ID,
  SITE_WEBSITE_ID,
} from "@/app/lib/seo/siteGraph";

const ROUTE = "/about";
const title = "About MAP eSIM | Travel eSIM Connectivity";
const description =
  "Learn how MAP eSIM helps travelers browse, purchase and securely install country, regional and global travel eSIM plans.";
const canonical = absoluteCanonical(ROUTE);

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

const offers = [
  {
    title: "Country, regional, and global plans",
    body: "Browse local destination plans, regional coverage, and global options from the MAP eSIM destination directory.",
    icon: Globe2,
  },
  {
    title: "Clear plan details before you buy",
    body: "Compare data allowance, validity, and displayed price. Checkout still verifies the real offer by offer ID before an order is created.",
    icon: MapPinned,
  },
  {
    title: "Digital delivery and installation",
    body: "No physical SIM is required. After a successful purchase, install from QR code or manual details in your order.",
    icon: Smartphone,
  },
] as const;

const steps = [
  {
    title: "Choose a destination",
    body: "Select a country, regional, or global eSIM plan that fits your trip.",
  },
  {
    title: "Complete checkout",
    body: "Confirm the verified offer and purchase. Order details appear in your account and email when delivery succeeds.",
  },
  {
    title: "Install and connect",
    body: "Use your order details to install the eSIM, then enable the line and data roaming at your destination when required.",
  },
] as const;

const privacyPoints = [
  "Account passwords are stored as secure hashes, not in plain text.",
  "Installation details such as QR codes and activation data are treated as sensitive and shown only through protected order channels.",
  "MAP eSIM does not ask for passwords, full payment details, QR images, activation codes, or complete ICCID information by email or contact form.",
  "Essential cookies support login, sessions, and security. Optional cookies stay off unless you enable them.",
] as const;

export default function AboutPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": `${canonical}#webpage`,
        name: title,
        description,
        url: canonical,
        isPartOf: { "@id": SITE_WEBSITE_ID },
        about: { "@id": SITE_ORG_ID },
      },
      breadcrumbList([
        { name: "Home", path: "/" },
        { name: "About MAP eSIM", path: ROUTE },
      ]),
    ],
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--heading)]">
      <JsonLd data={structuredData} />

      <section className="border-b border-[var(--border)] bg-[radial-gradient(ellipse_at_top_left,var(--hero-glow)_0%,_transparent_45%),linear-gradient(180deg,var(--page-bg-soft)_0%,var(--page-bg)_100%)]">
        <div className="mx-auto max-w-[1200px] px-4 pb-10 pt-6 sm:px-6 sm:pb-12 sm:pt-8 lg:pb-14 lg:pt-10">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "About MAP eSIM" }]}
          />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            ABOUT MAP eSIM
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-[var(--heading)] sm:text-5xl lg:leading-[1.08]">
            About MAP eSIM
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
            MAP eSIM helps travelers browse destination plans, compare data
            options, and checkout with verified offer pricing — then install a
            digital eSIM for travel connectivity abroad.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/countries"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Browse Destinations
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-6 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </section>

      <section
        id="what-we-offer"
        className="border-b border-[var(--border)]"
        aria-labelledby="what-we-offer-heading"
      >
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <h2
            id="what-we-offer-heading"
            className="text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl"
          >
            What we offer
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
            Country, regional, and global travel eSIM plans with digital
            delivery. Displayed prices can convert from a USD base for
            convenience; checkout still verifies the live offer.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {offers.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--accent-strong)]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-[var(--heading)]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                    {item.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section
        id="how-the-service-works"
        className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/50"
        aria-labelledby="how-service-works-heading"
      >
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <h2
            id="how-service-works-heading"
            className="text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl"
          >
            How the service works
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
            You can purchase in advance and install when you are ready. Plans
            require an unlocked phone that supports eSIM.
          </p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <article
                key={step.title}
                className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6"
              >
                <span className="text-sm font-semibold text-[var(--text-soft)]">
                  Step {index + 1}
                </span>
                <h3 className="mt-3 text-xl font-bold text-[var(--heading)]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {step.body}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-8">
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Full how-it-works guide
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section
        id="safety-and-privacy"
        className="border-b border-[var(--border)]"
        aria-labelledby="safety-privacy-heading"
      >
        <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2">
          <div>
            <h2
              id="safety-privacy-heading"
              className="text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl"
            >
              Our safety and privacy approach
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
              MAP eSIM processes account, order, and support information to
              fulfil travel eSIM purchases. Necessary order details are shared
              with a third-party eSIM provider so the plan can be provisioned.
              Payments, when used, are handled by an external payment provider
              under that provider’s own terms.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-[var(--text)]">
              {privacyPoints.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-strong)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/privacy-policy"
                className="text-sm font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-strong)]"
              >
                Privacy Policy
              </Link>
              <Link
                href="/cookie-policy"
                className="text-sm font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-strong)]"
              >
                Cookie Policy
              </Link>
              <Link
                href="/device-compatibility"
                className="text-sm font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-strong)]"
              >
                Device compatibility
              </Link>
            </div>
          </div>
          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            <ShieldCheck
              className="h-7 w-7 text-[var(--accent-strong)]"
              aria-hidden="true"
            />
            <h3 className="mt-4 text-xl font-bold text-[var(--heading)]">
              Guidance, not a coverage guarantee
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              Device compatibility checks are guidance only. MAP eSIM does not
              list unverified device claims or guarantee network speeds. Confirm
              eSIM support and carrier unlock in your phone settings or
              manufacturer documentation before you buy.
            </p>
          </div>
        </div>
      </section>

      <section
        id="customer-support"
        className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]/50"
        aria-labelledby="customer-support-heading"
      >
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
              <Headphones
                className="h-7 w-7 text-[var(--accent-strong)]"
                aria-hidden="true"
              />
              <h2
                id="customer-support-heading"
                className="mt-4 text-2xl font-bold tracking-tight text-[var(--heading)]"
              >
                Customer support
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                Use the Support Center for installation, activation, orders, and
                common questions. Signed-in customers can also open account
                orders for installation details. We do not offer public order
                lookup by email.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-[var(--text-muted)]">
                Email{" "}
                <a
                  href={`mailto:${BRAND_SUPPORT_EMAIL}?subject=${encodeURIComponent(
                    `${BRAND_NAME} support request`
                  )}`}
                  className="font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--accent-strong)]"
                >
                  {BRAND_SUPPORT_EMAIL}
                </a>{" "}
                with your order reference, destination, device model, and a
                brief description of the issue.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/support"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-6 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                >
                  Support Center
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-[var(--accent-strong)] px-6 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                >
                  Contact Support
                </Link>
              </div>
            </div>

            <div
              id="partner-program"
              className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8"
            >
              <Handshake
                className="h-7 w-7 text-[var(--accent-strong)]"
                aria-hidden="true"
              />
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-[var(--heading)]">
                Partner and reseller program
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                Travel agencies, creators, consultants, tourism businesses, and
                resellers can apply to work with MAP eSIM. Applications are
                reviewed individually. Submitting a form does not create a
                partnership, and this site does not publish commission rates.
              </p>
              <Link
                href="/affiliates-and-partnerships"
                className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-6 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
              >
                Affiliates &amp; Partnerships
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 sm:py-16">
        <div className="theme-cta overflow-hidden rounded-[28px] border border-[var(--accent-strong)]/25 px-6 py-10 text-center sm:px-10">
          <h2 className="text-3xl font-bold tracking-tight text-[var(--heading)] sm:text-4xl">
            Ready to browse travel eSIM plans?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[var(--text)]">
            Compare destination plans and continue with verified offer pricing,
            or contact support if you need help first.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/countries"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent-strong)] px-7 text-sm font-bold text-[var(--accent-ink)] transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Browse Destinations
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-7 text-sm font-semibold text-[var(--heading)] transition hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
