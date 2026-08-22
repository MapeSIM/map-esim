import type { Metadata } from "next";
import { InstallGuidePage } from "@/app/components/install/InstallGuidePage";
import { BRAND_NAME } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";

const canonical = absoluteCanonical("/install/android");

export const metadata: Metadata = {
  title: `Android eSIM Install Guide | ${BRAND_NAME}`,
  description:
    "Install your MAP eSIM on Android using the QR code from your order email or success page.",
  alternates: { canonical },
  openGraph: {
    title: `Android eSIM Install Guide | ${BRAND_NAME}`,
    description:
      "Install your MAP eSIM on Android using the QR code from your order email or success page.",
    url: canonical,
    siteName: BRAND_NAME,
    type: "website",
  },
};

export default function AndroidInstallGuidePage() {
  return <InstallGuidePage platform="android" />;
}
