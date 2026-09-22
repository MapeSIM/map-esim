import type { Metadata } from "next";
import { BRAND_NAME, BRAND_SITE_URL } from "@/app/lib/brand";

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

/**
 * Default share images for public routes.
 * Next.js replaces parent openGraph/twitter when a child sets those objects;
 * omitting images drops the root defaults — always include these.
 */
export function defaultSocialShareImages() {
  return {
    openGraphImages: [DEFAULT_SOCIAL_SHARE_IMAGE] as [
      typeof DEFAULT_SOCIAL_SHARE_IMAGE,
    ],
    twitterImages: [DEFAULT_SOCIAL_SHARE_IMAGE.url] as [
      typeof DEFAULT_SOCIAL_SHARE_IMAGE.url,
    ],
  };
}

/**
 * Standard public-page Open Graph + Twitter block with default share images.
 */
export function publicPageShareMeta(input: {
  title: string;
  description: string;
  url: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const { openGraphImages, twitterImages } = defaultSocialShareImages();
  return {
    openGraph: {
      title: input.title,
      description: input.description,
      url: input.url,
      siteName: BRAND_NAME,
      type: "website",
      images: openGraphImages,
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: twitterImages,
    },
  };
}
