"use client";

import { usePathname } from "next/navigation";
import { isShareSurfacePath } from "@/app/lib/share/shareSurface";

/** Hides site chrome (nav/footer/JSON-LD) on the tokenized share surface. */
export default function HideOnShare({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  if (isShareSurfacePath(pathname)) return null;
  return <>{children}</>;
}
