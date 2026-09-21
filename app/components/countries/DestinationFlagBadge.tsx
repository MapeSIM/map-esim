"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { resolveDestinationFlagVisual } from "@/app/lib/vesim/destinationPresentation";

/** Small client island for flag image error fallback. */
export default function DestinationFlagBadge({
  destination,
  iconFallback,
}: {
  destination: {
    code: string;
    name: string;
    flag?: string;
    kind: "country" | "regional" | "global";
  };
  iconFallback: ReactNode;
}) {
  const visual = resolveDestinationFlagVisual(destination);
  const [imageFailed, setImageFailed] = useState(false);

  if (destination.kind !== "country") {
    return (
      <span
        className="
          flex h-8 w-11 shrink-0 items-center justify-center
          rounded-md border border-[var(--border-strong)]
          bg-[var(--surface-2)] text-[var(--accent-soft)]
        "
        aria-hidden="true"
      >
        {iconFallback}
      </span>
    );
  }

  if (visual.type === "image" && !imageFailed) {
    return (
      <Image
        src={visual.src}
        alt=""
        width={44}
        height={32}
        sizes="44px"
        onError={() => setImageFailed(true)}
        className="
          h-8 w-11 shrink-0 rounded-md
          border border-[var(--border-strong)] object-cover
        "
      />
    );
  }

  if (visual.type === "emoji") {
    return (
      <span
        className="
          flex h-8 w-11 shrink-0 items-center justify-center
          rounded-md border border-[var(--border-strong)]
          bg-[var(--surface-2)] text-xl leading-none
        "
        aria-hidden="true"
      >
        {visual.emoji}
      </span>
    );
  }

  const initials =
    visual.type === "initials"
      ? visual.initials
      : destination.code.trim().toUpperCase().slice(0, 4) || "?";

  return (
    <span
      className="
        flex h-8 w-11 shrink-0 items-center justify-center
        rounded-md border border-[var(--border-strong)]
        bg-[var(--surface-2)] text-[10px] font-bold tracking-wide
        text-[var(--heading)]
      "
      aria-hidden="true"
      title={destination.name}
    >
      {initials}
    </span>
  );
}
