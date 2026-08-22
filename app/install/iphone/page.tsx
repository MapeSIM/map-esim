import type { Metadata } from "next";
import { InstallGuidePage } from "@/app/components/install/InstallGuidePage";
import { BRAND_NAME } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";

const canonical = absoluteCanonical("/install/iphone");

export const metadata: Metadata = {
  title: `iPhone eSIM Install Guide | ${BRAND_NAME}`,
  description:
    "Install your MAP eSIM on iPhone using the QR code or manual SM-DP+ details from your order.",
  alternates: { canonical },
  openGraph: {
    title: `iPhone eSIM Install Guide | ${BRAND_NAME}`,
    description:
      "Install your MAP eSIM on iPhone using the QR code or manual SM-DP+ details from your order.",
    url: canonical,
    siteName: BRAND_NAME,
    type: "website",
  },
};

export default function IphoneInstallGuidePage() {
  return <InstallGuidePage platform="iphone" />;
}
