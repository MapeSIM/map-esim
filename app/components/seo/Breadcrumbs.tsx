import Link from "next/link";
import JsonLd from "@/app/components/seo/JsonLd";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  // Generate Schema.org BreadcrumbList JSON-LD
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.label,
      ...(item.href ? { "item": item.href.startsWith("http") ? item.href : `https://mapesim.com${item.href}` } : {}),
    })),
  };

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      <nav aria-label="Breadcrumb" className="text-sm text-[var(--text-muted)]">
        <ol className="flex flex-wrap items-center gap-1.5">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-[var(--text-soft)]">
                    /
                  </span>
                ) : null}
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="transition hover:text-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className={isLast ? "font-medium text-[var(--heading)]" : undefined}
                    aria-current={isLast ? "page" : undefined}
                  >
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}