"use client";

import BrandSpinner, {
  type BrandSpinnerVariant,
} from "@/app/components/loading/BrandSpinner";

/**
 * Segment `loading.tsx` / Suspense fallback using the brand spinner.
 * Safe to import from Server Components (client boundary).
 */
export default function BrandLoadingState({
  label = "Loading…",
  variant = "page",
  slowNote,
  className,
}: {
  label?: string;
  variant?: Extract<BrandSpinnerVariant, "page" | "card" | "overlay">;
  slowNote?: string;
  className?: string;
}) {
  return (
    <BrandSpinner
      variant={variant}
      label={label}
      slowNote={slowNote}
      className={className}
    />
  );
}
