import { BRAND_SITE_URL } from "@/app/lib/brand";

/**
 * Absolute default Open Graph / Twitter share image.
 * Served by app/opengraph-image.tsx (and app/twitter-image.tsx).
 * Keep this module free of next/og so client-safe SEO helpers can import it.
 */
export const DEFAULT_SOCIAL_SHARE_IMAGE = {
  url: `${BRAND_SITE_URL}/opengraph-image`,
  width: 1200,
  height: 630,
  alt: "MAP eSIM – Stay connected. Anywhere.",
} as const;
