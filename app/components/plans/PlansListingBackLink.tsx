"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  countriesListingHrefFromPlanParams,
  normalizeCountriesBasePath,
} from "@/app/lib/vesim/countriesListingReturn";

function PlansListingBackLinkInner({
  listingBasePath,
}: {
  listingBasePath: string;
}) {
  const searchParams = useSearchParams();
  const href = countriesListingHrefFromPlanParams(
    (key) => searchParams.get(key),
    listingBasePath
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

/** Keeps destinations return filter+q URLs without making the whole listing client. */
export default function PlansListingBackLink({
  listingBasePath = "/countries",
}: {
  listingBasePath?: string;
}) {
  const base = normalizeCountriesBasePath(listingBasePath);
  return (
    <Suspense
      fallback={
        <Link
          href={base}
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
      <PlansListingBackLinkInner listingBasePath={base} />
    </Suspense>
  );
}
