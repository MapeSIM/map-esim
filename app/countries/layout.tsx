import type { Metadata } from "next";
import { BRAND_NAME } from "@/app/lib/brand";

export const metadata: Metadata = {
  title: `eSIM Destinations | ${BRAND_NAME}`,
  description:
    "Browse MAP eSIM destinations and choose a country, regional, or global travel data plan.",
  alternates: { canonical: "/countries" },
  openGraph: {
    title: `eSIM Destinations | ${BRAND_NAME}`,
    description:
      "Browse MAP eSIM destinations and choose a country, regional, or global travel data plan.",
    url: "/countries",
    siteName: BRAND_NAME,
    type: "website",
  },
};

export default function CountriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
