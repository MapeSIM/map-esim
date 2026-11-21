"use client";

import BrandSpinner from "@/app/components/loading/BrandSpinner";

/** Compact pending label for primary buttons / CTAs. */
export default function BrandPendingLabel({
  label = "Please wait…",
}: {
  label?: string;
}) {
  return <BrandSpinner variant="button" label={label} />;
}
