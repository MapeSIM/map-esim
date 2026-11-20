"use client";

import { usePathname } from "next/navigation";
import { shouldHidePublicSiteChrome } from "@/app/lib/partner/partnerSiteChrome";

/**
 * Hides public site chrome (nav/footer/JSON-LD/WhatsApp) on share, partner,
 * and admin surfaces so those workspaces are distraction-free.
 */
export default function HideOnShare({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  if (shouldHidePublicSiteChrome(pathname)) return null;
  return <>{children}</>;
}
