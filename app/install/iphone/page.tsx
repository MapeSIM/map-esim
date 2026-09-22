import type { Metadata } from "next";
import { InstallGuidePage } from "@/app/components/install/InstallGuidePage";
import { BRAND_NAME } from "@/app/lib/brand";
import { absoluteCanonical } from "@/app/lib/seo/canonical";
import { publicPageShareMeta } from "@/app/lib/seo/socialShareMeta";

const canonical = absoluteCanonical("/install/iphone");
const title = `iPhone eSIM Install Guide | ${BRAND_NAME}`;
const description =
  "Install your MAP eSIM on iPhone using the QR code or manual SM-DP+ details from your order.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical },
  ...publicPageShareMeta({ title, description, url: canonical }),
};

export default function IphoneInstallGuidePage() {
  return <InstallGuidePage platform="iphone" />;
}
