"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type EsimCompatibilityInlineTriggerType from "@/app/components/esim/EsimCompatibilityInlineTrigger";

type Props = ComponentProps<typeof EsimCompatibilityInlineTriggerType>;

const EsimCompatibilityInlineTrigger = dynamic(
  () => import("@/app/components/esim/EsimCompatibilityInlineTrigger"),
  {
    ssr: false,
    loading: () => (
      <span className="inline font-semibold text-[var(--accent-strong)]">
        Check eSIM compatibility (?)
      </span>
    ),
  }
);

/** Lazy inline trigger — keeps catalog/modal off the initial home/plans chunk. */
export default function DeferredEsimCompatibilityInlineTrigger(props: Props) {
  return <EsimCompatibilityInlineTrigger {...props} />;
}
