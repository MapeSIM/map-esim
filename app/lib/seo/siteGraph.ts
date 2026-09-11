import {
  BRAND_NAME,
  BRAND_SITE_URL,
  BRAND_SOCIAL_LINKS,
  BRAND_SUPPORT_EMAIL,
  BRAND_TAGLINE,
} from "@/app/lib/brand";

/** Stable JSON-LD node IDs — reuse across pages; do not invent duplicate orgs. */
export const SITE_ORG_ID = `${BRAND_SITE_URL}/#organization`;
export const SITE_WEBSITE_ID = `${BRAND_SITE_URL}/#website`;

export const PAKISTAN_DESTINATION_PATH = "/countries/pakistan";

/** Local Pakistan flag used by Navbar and the Pakistan country page hero. */
export const PAKISTAN_FLAG_PUBLIC_PATH = "/flags/pk.svg";

export function organizationNode() {
  return {
    "@type": "Organization",
    "@id": SITE_ORG_ID,
    name: BRAND_NAME,
    url: BRAND_SITE_URL,
    email: BRAND_SUPPORT_EMAIL,
    description: BRAND_TAGLINE,
    sameAs: BRAND_SOCIAL_LINKS.map((link) => link.href),
  };
}

export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": SITE_WEBSITE_ID,
    name: BRAND_NAME,
    url: BRAND_SITE_URL,
    description: BRAND_TAGLINE,
    publisher: { "@id": SITE_ORG_ID },
  };
}

export function breadcrumbList(
  items: Array<{ name: string; path: string }>
) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${BRAND_SITE_URL}${item.path === "/" ? "" : item.path}`,
    })),
  };
}

export function faqPage(
  items: Array<{ question: string; answer: string }>
) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

/**
 * Destination plan commerce node from real SSR offer retail prices only.
 * Returns null when no valid positive USD prices exist (never invents prices).
 */
export function destinationPlanProductNode(options: {
  name: string;
  description: string;
  url: string;
  offers: Array<{
    id?: string;
    name?: string;
    priceUSD?: number | null;
    currency?: string;
  }>;
}) {
  const priced = options.offers
    .map((offer) => {
      const price = offer.priceUSD;
      if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
        return null;
      }
      return {
        id: (offer.id ?? "").trim(),
        name: (offer.name ?? "").trim() || options.name,
        priceUSD: price,
        currency:
          typeof offer.currency === "string" && offer.currency.trim()
            ? offer.currency.trim().toUpperCase()
            : "USD",
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (priced.length === 0) {
    return null;
  }

  const prices = priced.map((row) => row.priceUSD);
  const lowPrice = Math.min(...prices);
  const highPrice = Math.max(...prices);
  const currency = priced.every((row) => row.currency === priced[0].currency)
    ? priced[0].currency
    : "USD";

  return {
    "@type": "Product",
    name: options.name,
    description: options.description,
    url: options.url,
    brand: { "@id": SITE_ORG_ID },
    offers: {
      "@type": "AggregateOffer",
      url: options.url,
      priceCurrency: currency,
      lowPrice: Number(lowPrice.toFixed(2)),
      highPrice: Number(highPrice.toFixed(2)),
      offerCount: priced.length,
      availability: "https://schema.org/InStock",
    },
  };
}
