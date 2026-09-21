"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { countriesListingHrefFromPlanParams } from "@/app/lib/vesim/countriesListingReturn";

function PlansListingBackLinkInner() {
  const searchParams = useSearchParams();
  const href = countriesListingHrefFromPlanParams((key) =>
    searchParams.get(key)
  );

  return (
    <Link
      href={href}
      className="
        mb-3 inline-flex max-w-full items-center gap-2 text-sm font-medium
        text-[var(--text-muted)] transition hover:text-[var(--accent-strong)]
        sm:mb-5
      "
    >
      <ArrowLeft className="h-4 w-4 shrink-0" />
      <span className="truncate">All Destinations</span>
    </Link>
  );
}

/** Keeps /countries return filter+q URLs without making the whole listing client. */
export default function PlansListingBackLink() {
  return (
    <Suspense
      fallback={
        <Link
          href="/countries"
          className="
            mb-3 inline-flex max-w-full items-center gap-2 text-sm font-medium
            text-[var(--text-muted)] transition hover:text-[var(--accent-strong)]
            sm:mb-5
          "
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="truncate">All Destinations</span>
        </Link>
      }
    >
      <PlansListingBackLinkInner />
    </Suspense>
  );
}
