import type { Metadata } from "next";
import Link from "next/link";
import { Mail, ShieldAlert, Smartphone } from "lucide-react";
import ContactForm from "@/app/components/contact/ContactForm";
import Breadcrumbs from "@/app/components/seo/Breadcrumbs";
import JsonLd from "@/app/components/seo/JsonLd";
import {
  BRAND_NAME,
  BRAND_SUPPORT_EMAIL,
} from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";
import {
  breadcrumbList,
  SITE_ORG_ID,
  SITE_WEBSITE_ID,
} from "@/app/lib/seo/siteGraph";

const title = `Contact Support | ${BRAND_NAME}`;
const description =
  "Contact MAP eSIM support for help with purchasing, installation, activation, connectivity, wallet activity, and orders.";
const canonical = absoluteCanonical("/contact");

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

const mailtoHref = `mailto:${BRAND_SUPPORT_EMAIL}?subject=${encodeURIComponent(
  `${BRAND_NAME} support request`
)}`;

export default function ContactPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ContactPage",
        "@id": `${canonical}#contactpage`,
        name: title,
        description,
        url: canonical,
        isPartOf: { "@id": SITE_WEBSITE_ID },
        about: { "@id": SITE_ORG_ID },
        mainEntity: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: BRAND_SUPPORT_EMAIL,
          url: canonical,
          areaServed: "Worldwide",
          availableLanguage: ["en"],
        },
      },
      breadcrumbList([
        { name: "Home", path: "/" },
        { name: "Contact", path: "/contact" },
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
              { label: "Contact" },
            ]}
          />
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            MAP eSIM CONTACT
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight text-[var(--heading)] sm:text-5xl lg:leading-[1.08]">
            Contact MAP eSIM Support
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-muted)] sm:text-lg">
            Reach the MAP eSIM team for help with purchasing, installation,
            activation, connectivity, wallet activity, and orders. Share the
            details we need to investigate — we will reply by email when we can.
          </p>
        </div>
      </section>

      <section className="border-b border-[var(--border)]">
        <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[1.1fr_0.9fr]">
          <ContactForm />

          <aside className="space-y-6">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
              <h2 className="text-xl font-bold tracking-tight text-[var(--heading)]">
                Other ways to get help
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
                Prefer email or self-serve guides? Use these options alongside the
                form.
              </p>
              <ul className="mt-5 space-y-4 text-sm">
                <li>
                  <p className="font-medium text-[var(--heading)]">Support email</p>
                  <a
                    href={mailtoHref}
                    className="mt-1 inline-flex items-center gap-2 font-semibold text-[var(--accent-strong)] underline decoration-[var(--border-strong)] underline-offset-2"
                  >
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    {BRAND_SUPPORT_EMAIL}
                  </a>
                </li>
                <li>
                  <Link
                    href="/support"
                    className="font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 transition hover:text-[var(--accent-strong)]"
                  >
                    Support Center
                  </Link>
                  <p className="mt-1 text-[var(--text-muted)]">
                    Installation tips, order guidance, and common topics.
                  </p>
                </li>
                <li className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                  <Link
                    href="/install/iphone"
                    className="inline-flex items-center gap-2 font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 transition hover:text-[var(--accent-strong)]"
                  >
                    <Smartphone className="h-4 w-4" aria-hidden="true" />
                    iPhone install guide
                  </Link>
                  <Link
                    href="/install/android"
                    className="inline-flex items-center gap-2 font-semibold text-[var(--heading)] underline decoration-[var(--border-strong)] underline-offset-2 transition hover:text-[var(--accent-strong)]"
                  >
                    <Smartphone className="h-4 w-4" aria-hidden="true" />
                    Android install guide
                  </Link>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-[var(--warning-border)] bg-[var(--warning-bg)] p-6 sm:p-8">
              <div className="flex items-start gap-3">
                <ShieldAlert
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning-text)]"
                  aria-hidden="true"
                />
                <div>
                  <h2 className="text-base font-bold text-[var(--warning-text)]">
                    Security reminder
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--warning-text)]">
                    MAP eSIM will never request passwords, full payment details,
                    QR codes, activation codes, or complete ICCID information
                    through this form or by email. Do not send those details.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
