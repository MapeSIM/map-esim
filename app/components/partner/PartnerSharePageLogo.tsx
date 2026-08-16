"use client";

import { useEffect, useState } from "react";
import {
  BRAND_LOGO_LIGHT_PUBLIC_PATH,
  BRAND_NAME,
} from "@/app/lib/brand";

/**
 * Public share-page logo presentation only.
 * Image-load fallback is display-only and never persists branding.
 */
export default function PartnerSharePageLogo({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  const fallback = BRAND_LOGO_LIGHT_PUBLIC_PATH;
  const partnerSrc = (src ?? "").trim();
  const resolved = partnerSrc || fallback;
  const [currentSrc, setCurrentSrc] = useState(resolved);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCurrentSrc(resolved);
    setFailed(false);
  }, [resolved]);

  if (failed) {
    return null;
  }

  return (
    <div className="mx-auto flex h-16 w-full min-w-0 max-w-[160px] items-center justify-center rounded-xl bg-white px-3 py-1.5 sm:h-[4.5rem] sm:max-w-[180px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentSrc}
        alt={alt || BRAND_NAME}
        width={180}
        height={72}
        className="h-auto max-h-14 w-auto max-w-full object-contain sm:max-h-16"
        referrerPolicy="no-referrer"
        onError={() => {
          if (currentSrc !== fallback) {
            setCurrentSrc(fallback);
            return;
          }
          setFailed(true);
        }}
      />
    </div>
  );
}
