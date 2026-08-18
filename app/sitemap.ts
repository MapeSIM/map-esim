import type { MetadataRoute } from "next";
import { BRAND_SITE_URL } from "@/app/lib/brand";
import { getCanonicalDestinationPathsForSitemap } from "@/app/lib/seo/destinationCatalog";

type StaticRoute = {
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
};

const staticRoutes: StaticRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/countries", changeFrequency: "daily", priority: 0.9 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.8 },
  {
    path: "/affiliates-and-partnerships",
    changeFrequency: "monthly",
    priority: 0.75,
  },
  { path: "/support", changeFrequency: "monthly", priority: 0.75 },
  {
    path: "/device-compatibility",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  { path: "/install/iphone", changeFrequency: "monthly", priority: 0.7 },
  { path: "/install/android", changeFrequency: "monthly", priority: 0.7 },
  { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms-and-conditions", changeFrequency: "yearly", priority: 0.3 },
  { path: "/cookie-policy", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const marketingPages: MetadataRoute.Sitemap = staticRoutes.map((route) => ({
    url: route.path === "/" ? BRAND_SITE_URL : `${BRAND_SITE_URL}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const destinationPaths = await getCanonicalDestinationPathsForSitemap();
  const destinationPages: MetadataRoute.Sitemap = destinationPaths.map(
    (path) => ({
      url: `${BRAND_SITE_URL}${path}`,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })
  );

  return [...marketingPages, ...destinationPages];
}
