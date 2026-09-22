import type { Metadata } from "next";
import { BRAND_NAME } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";
import { publicPageShareMeta } from "@/app/lib/seo/socialShareMeta";

const canonical = absoluteCanonical("/countries");
const title = `eSIM Destinations | ${BRAND_NAME}`;
const description =
  "Browse MAP eSIM destinations and choose a country, regional, or global travel data plan.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  ...publicPageShareMeta({ title, description, url: canonical }),
};

export default function CountriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
