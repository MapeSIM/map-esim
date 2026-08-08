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
