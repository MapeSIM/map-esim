import Breadcrumbs from "@/app/components/seo/Breadcrumbs";
import JsonLd from "@/app/components/seo/JsonLd";
import { BRAND_NAME } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";
import { buildCountrySeoContent } from "@/app/lib/seo/countryPageContent";
import {
  breadcrumbList,
  faqPage,
  SITE_ORG_ID,
  SITE_WEBSITE_ID,
} from "@/app/lib/seo/siteGraph";
import { destinationPath, type VesimDestination } from "@/app/lib/vesim/destinations";
import { destinationDisplayName } from "@/app/lib/vesim/destinationPresentation";

export function CountrySeoContent({
  destination,
}: {
  destination: VesimDestination;
}) {
  const label = destinationDisplayName(destination);
  const path = destinationPath(destination);
  const content = buildCountrySeoContent({
    name: label,
    kind: destination.kind,
    path,
  });
  const canonical = absoluteCanonical(path);
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      faqPage(content.faqs),
      breadcrumbList(content.breadcrumbs),
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: `${label} eSIM | ${BRAND_NAME}`,
        isPartOf: { "@id": SITE_WEBSITE_ID },
        publisher: { "@id": SITE_ORG_ID },
      },
    ],
  };

  return (
    <div className="border-t border-[var(--border)] bg-[var(--page-bg-soft)]/50">
      <JsonLd data={structuredData} />

      <section
        className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16"
        aria-labelledby="country-seo-intro-heading"
      >
        <Breadcrumbs
          items={content.breadcrumbs.map((item, index) => ({
            label: item.name,
            href:
              index === content.breadcrumbs.length - 1 ? undefined : item.path,
          }))}
        />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
          Travel eSIM
        </p>
        <h2
          id="country-seo-intro-heading"
          className="mt-3 text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl"
        >
          {content.introTitle}
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
          {content.intro}
        </p>
      </section>

      <section
        className="border-t border-[var(--border)]"
        aria-labelledby="country-seo-why-heading"
      >
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <h2
            id="country-seo-why-heading"
            className="text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl"
          >
            {content.whyTitle}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {content.whyItems.map((item) => (
              <li
                key={item.title}
                className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
              >
                <h3 className="text-lg font-bold text-[var(--heading)]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {item.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="border-t border-[var(--border)]"
        aria-labelledby="country-seo-steps-heading"
      >
        <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
          <h2
            id="country-seo-steps-heading"
            className="text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl"
          >
            {content.stepsTitle}
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {content.steps.map((step, index) => (
              <li
                key={step.title}
                className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
              >
                <p className="text-sm font-semibold text-[var(--text-soft)]">
                  Step {index + 1}
                </p>
                <h3 className="mt-3 text-lg font-bold text-[var(--heading)]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        className="border-t border-[var(--border)]"
        aria-labelledby="country-seo-faq-heading"
      >
        <div className="mx-auto max-w-[900px] px-4 py-12 sm:px-6 sm:py-16">
          <h2
            id="country-seo-faq-heading"
            className="text-center text-2xl font-bold tracking-tight text-[var(--heading)] sm:text-3xl"
          >
            {label} eSIM FAQ
          </h2>
          <div className="mt-8 space-y-3">
            {content.faqs.map((faq) => (
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
    </div>
  );
}
