import type { Metadata } from "next";
import { BRAND_NAME } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";

const canonical = absoluteCanonical("/plans");

export const metadata: Metadata = {
  title: `eSIM Plans | ${BRAND_NAME}`,
  description:
    "Browse MAP eSIM plans and choose travel data that fits your trip.",
  alternates: { canonical },
  openGraph: {
    title: `eSIM Plans | ${BRAND_NAME}`,
    description:
      "Browse MAP eSIM plans and choose travel data that fits your trip.",
    url: canonical,
    siteName: BRAND_NAME,
    type: "website",
  },
};

export default function PlansLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
