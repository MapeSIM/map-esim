import type { MetadataRoute } from "next";
import { BRAND_SITE_URL } from "@/app/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/account",
        "/checkout",
        "/payment",
        "/success",
        "/signin",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
        "/verify-reset-code",
        "/oauth-consent",
        "/dashboard",
        "/esim",
      ],
    },
    sitemap: `${BRAND_SITE_URL}/sitemap.xml`,
    host: BRAND_SITE_URL,
  };
}
