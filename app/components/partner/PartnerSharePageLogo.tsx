"use client";

import { useEffect, useState } from "react";
import {
  BRAND_LOGO_DARK_PUBLIC_PATH,
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
  const fallback = BRAND_LOGO_DARK_PUBLIC_PATH;
  const lightFallback = BRAND_LOGO_LIGHT_PUBLIC_PATH;
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
    <div className="mx-auto inline-flex w-fit max-h-[70px] max-w-[170px] items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentSrc}
        alt={alt || BRAND_NAME}
        width={170}
        height={70}
        className="h-auto w-auto max-h-[70px] max-w-[170px] object-contain bg-transparent"
        referrerPolicy="no-referrer"
        onError={() => {
          if (currentSrc !== fallback && currentSrc !== lightFallback) {
            setCurrentSrc(fallback);
            return;
          }
          if (currentSrc === fallback) {
            setCurrentSrc(lightFallback);
            return;
          }
          setFailed(true);
        }}
      />
    </div>
  );
}
