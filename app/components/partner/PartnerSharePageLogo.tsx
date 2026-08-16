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
    <div className="mx-auto inline-flex w-fit max-h-[70px] max-w-[170px] items-center justify-center rounded-xl bg-white p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentSrc}
        alt={alt || BRAND_NAME}
        width={170}
        height={70}
        className="h-auto w-auto max-h-[54px] max-w-[154px] object-contain"
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
