import type { Metadata } from "next";
import { InstallGuidePage } from "@/app/components/install/InstallGuidePage";
import { BRAND_NAME } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";
import { publicPageShareMeta } from "@/app/lib/seo/socialShareMeta";

const canonical = absoluteCanonical("/install/android");
const title = `Android eSIM Install Guide | ${BRAND_NAME}`;
const description =
  "Install your MAP eSIM on Android using the QR code from your order email or success page.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  ...publicPageShareMeta({ title, description, url: canonical }),
};

export default function AndroidInstallGuidePage() {
  return <InstallGuidePage platform="android" />;
}
