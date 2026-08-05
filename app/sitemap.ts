import type { MetadataRoute } from "next";
import { BRAND_SITE_URL } from "@/app/lib/brand";
import { PAKISTAN_DESTINATION_PATH } from "@/app/lib/seo/siteGraph";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: BRAND_SITE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BRAND_SITE_URL}/countries`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BRAND_SITE_URL}${PAKISTAN_DESTINATION_PATH}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${BRAND_SITE_URL}/plans`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.85,
    },
    {
      url: `${BRAND_SITE_URL}/how-it-works`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BRAND_SITE_URL}/contact`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BRAND_SITE_URL}/support`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${BRAND_SITE_URL}/install/iphone`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BRAND_SITE_URL}/install/android`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${BRAND_SITE_URL}/privacy-policy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BRAND_SITE_URL}/terms-and-conditions`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BRAND_SITE_URL}/cookie-policy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
