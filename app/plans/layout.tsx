import type { Metadata } from "next";
import { BRAND_NAME } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";
import { publicPageShareMeta } from "@/app/lib/seo/socialShareMeta";

const canonical = absoluteCanonical("/plans");
const title = `eSIM Plans | ${BRAND_NAME}`;
const description =
  "Browse MAP eSIM plans and choose travel data that fits your trip.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  ...publicPageShareMeta({ title, description, url: canonical }),
};

export default function PlansLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
