import type { Metadata } from "next";
import Link from "next/link";
import {
  BriefcaseBusiness,
  Building2,
  Globe2,
  GraduationCap,
  Handshake,
  Plane,
  Sparkles,
  Users,
} from "lucide-react";
import PartnershipApplicationForm from "@/app/components/partnerships/PartnershipApplicationForm";
import Breadcrumbs from "@/app/components/seo/Breadcrumbs";
import JsonLd from "@/app/components/seo/JsonLd";
import { BRAND_NAME, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";
import {
  breadcrumbList,
  SITE_ORG_ID,
  SITE_WEBSITE_ID,
} from "@/app/lib/seo/siteGraph";

const ROUTE = "/affiliates-and-partnerships";
const title = `Affiliates & Partnerships | ${BRAND_NAME}`;
const description =
  "Apply to partner with MAP eSIM. Travel agencies, creators, consultants, and tourism businesses can explore affiliate and distribution opportunities.";
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

const benefits = [
  {
    title: "Competitive travel eSIM plans",
    body: "Offer customers destination connectivity built around MAP eSIM’s public plan catalog and clear retail pricing.",
  },
  {
    title: "Reliable partner support",
    body: "Work with a team that can help you understand destinations, installation guidance, and customer handoff basics.",
  },
  {
    title: "Simple referral opportunities",
    body: "Introduce travelers to MAP eSIM through your existing channels — websites, storefronts, content, or advisory services.",
  },
  {
    title: "Global destination coverage",
    body: "Point customers to country, regional, and global options across the MAP eSIM destination directory.",
  },
  {
    title: "Built for travel-led businesses",
    body: "A fit for travel sellers, creators, study-abroad consultants, corporate travel teams, and similar audiences.",
  },
] as const;

const partnerTypes = [
  {
    title: "Travel agencies",
    body: "Help clients stay connected before and during trips with destination eSIM options.",
    icon: Plane,
  },
  {
    title: "Content creators / influencers",
    body: "Share travel connectivity with audiences who plan international trips.",
    icon: Sparkles,
  },
  {
    title: "Study abroad consultants",
    body: "Support students and families with practical connectivity for overseas study.",
    icon: GraduationCap,
  },
  {
    title: "Corporate travel",
    body: "Explore options for teams and travelers who need predictable destination data.",
    icon: BriefcaseBusiness,
  },
  {
    title: "Tourism businesses",
    body: "Hotels, tour operators, and local hosts can guide guests to ready-to-install eSIMs.",
    icon: Building2,
  },
  {
    title: "Resellers / distribution partners",
    body: "Discuss distribution-style collaboration after MAP eSIM reviews your application.",
    icon: Handshake,
  },
] as const;

const steps = [
  {
    step: "1",
    title: "Apply",
    body: "Submit the partnership form with your business details and expected volume.",
  },
  {
    step: "2",
    title: "MAP eSIM reviews",
    body: "Our team reviews your application. Approval is not automatic and may take time.",
  },
  {
    step: "3",
    title: "Onboarding if approved",
    body: "Approved partners receive follow-up instructions and next steps by email.",
  },
] as const;

const faqs = [
  {
    q: "Who can apply?",
    a: "Travel agencies, creators, consultants, tourism businesses, corporate travel contacts, and other partners who introduce travelers to eSIM connectivity.",
  },
  {
    q: "Is approval automatic?",
    a: "No. Every application is reviewed by MAP eSIM. Submitting a form does not create a partnership agreement.",
  },
  {
    q: "Do you publish commission rates on this page?",
    a: "No. Commercial terms are shared only after review when a partnership is appropriate. This page does not list commission percentages.",
  },
  {
    q: "How will you contact me?",
    a: `We reply by email using the business email you provide. You can also reach ${BRAND_SUPPORT_EMAIL} for partnership questions.`,
  },
] as const;

export default function AffiliatesAndPartnershipsPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        name: title,
        description,
        url: canonical,
        isPartOf: { "@id": SITE_WEBSITE_ID },
        about: { "@id": SITE_ORG_ID },
      },
      breadcrumbList([
        { name: "Home", path: "/" },
        { name: "Affiliates & Partnerships", path: ROUTE },
      ]),
    ],
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--page-bg)] text-[var(--heading)]">
      <JsonLd data={structuredData} />

      <section className="border-b border-[var(--border)] bg-[radial-gradient(ellipse_at_top_left,var(--hero-glow)_0%,_transparent_45%),linear-gradient(180deg,var(--page-bg-soft)_0%,var(--page-bg)_100%)]">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Affiliates & Partnerships" },
            ]}
          />
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            MAP eSIM PARTNERSHIPS
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-[var(--heading)] sm:text-5xl lg:leading-[1.08]">
            Affiliates &amp; Partnerships
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
            Travel businesses, creators, agencies, consultants, and other
            partners can apply to work with {BRAND_NAME}. Share how you reach
            travelers — our team will review your application and follow up by
            email when we can.
          </p>
        </div>
      </section>

      <section className="border-b border-[var(--border)]">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12">
          <PartnershipApplicationForm />
          <div className="space-y-6">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--accent-soft)]">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--heading)]">
                Why partner with MAP eSIM
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                Practical benefits for partners who help travelers discover
                destination eSIM plans — without contractual promises on this
                page.
              </p>
              <ul className="mt-6 space-y-4">
                {benefits.map((item) => (
                  <li key={item.title}>
                    <p className="text-sm font-semibold text-[var(--heading)]">
                      {item.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                      {item.body}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
              <p className="text-sm font-semibold text-[var(--heading)]">
                Prefer email first?
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                Write to{" "}
                <a
                  href={`mailto:${BRAND_SUPPORT_EMAIL}?subject=${encodeURIComponent(
                    "MAP eSIM partnership inquiry"
                  )}`}
                  className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
                >
                  {BRAND_SUPPORT_EMAIL}
                </a>{" "}
                with a short note about your business.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight text-[var(--heading)]">
            Partner types we welcome
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
            Applications are reviewed individually. Fit depends on your audience,
            channels, and how you introduce travelers to {BRAND_NAME}.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {partnerTypes.map(({ title: cardTitle, body, icon: Icon }) => (
              <div
                key={cardTitle}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--accent-soft)]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--heading)]">
                  {cardTitle}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--border)] bg-[var(--page-bg-soft)]">
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight text-[var(--heading)]">
            How it works
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-[var(--text-muted)]">
            A simple review process — no automatic approval.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center"
              >
                <p className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-strong)] text-sm font-bold text-[var(--accent-ink)]">
                  {item.step}
                </p>
                <h3 className="mt-4 text-lg font-semibold text-[var(--heading)]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[var(--heading)]">
                Partnership FAQ
              </h2>
              <div className="mt-6 space-y-4">
                {faqs.map((item) => (
                  <div
                    key={item.q}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
                  >
                    <h3 className="text-base font-semibold text-[var(--heading)]">
                      {item.q}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--accent-soft)]">
                <Globe2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-[var(--heading)]">
                Ready to talk?
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                Submit the application form above, or contact support if you
                have a partnership question before applying.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <a
                  href={`mailto:${BRAND_SUPPORT_EMAIL}?subject=${encodeURIComponent(
                    "MAP eSIM partnership inquiry"
                  )}`}
                  className="
                    inline-flex h-12 items-center justify-center rounded-2xl
                    bg-[var(--accent-strong)] px-5 text-sm font-bold text-[var(--accent-ink)]
                    hover:opacity-95 focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-[var(--accent-strong)]/60
                  "
                >
                  Email partnerships
                </a>
                <Link
                  href="/contact"
                  className="
                    inline-flex h-12 items-center justify-center rounded-2xl
                    border border-[var(--border-strong)] bg-[var(--surface-2)]
                    px-5 text-sm font-semibold text-[var(--heading)]
                    hover:border-[var(--border-hover)]
                    focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-[var(--accent-strong)]/60
                  "
                >
                  Contact support
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
