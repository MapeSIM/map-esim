"use client";

import { useState } from "react";
import Image from "next/image";
import { Globe2, MapPinned } from "lucide-react";
import type { VesimDestination } from "@/app/lib/vesim/destinations";
import { resolveDestinationFlagVisual } from "@/app/lib/vesim/destinationPresentation";

export default function PlansListingFlag({
  destination,
  size = "hero",
}: {
  destination: VesimDestination;
  size?: "hero" | "compact";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const visual = resolveDestinationFlagVisual(destination);
  const imageSrc = visual.type === "image" ? visual.src : null;

  if (destination.kind === "regional") {
    return (
      <span className="flex h-full w-full flex-col items-center justify-center rounded-2xl bg-[var(--accent-strong)]/10 text-[var(--accent-strong)]">
        <MapPinned className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
      </span>
    );
  }

  if (destination.kind === "global") {
    return (
      <Globe2 className="h-6 w-6 text-[var(--accent-strong)] sm:h-7 sm:w-7" />
    );
  }

  if (imageSrc && !imageFailed) {
    return (
      <Image
        src={imageSrc}
        alt=""
        width={size === "hero" ? 64 : 40}
        height={size === "hero" ? 48 : 28}
        sizes={size === "hero" ? "64px" : "40px"}
        priority={size === "hero"}
        unoptimized
        onError={() => setImageFailed(true)}
        className={
          size === "hero"
            ? "h-full w-full rounded-2xl object-contain"
            : "h-7 w-10 rounded-md object-contain"
        }
      />
    );
  }

  if (visual.type === "emoji") {
    return (
      <span
        className={
          size === "hero" ? "text-2xl sm:text-3xl" : "text-2xl leading-none"
        }
        aria-hidden="true"
      >
        {visual.emoji}
      </span>
    );
  }

  return (
    <span
      className="text-xs font-bold tracking-wide text-[var(--heading)] sm:text-sm"
      aria-hidden="true"
    >
      {visual.type === "initials"
        ? visual.initials
        : destination.code.trim().toUpperCase().slice(0, 4) || "?"}
    </span>
  );
}
