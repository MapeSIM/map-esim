"use client";

import { Suspense } from "react";
import NavigationProgressBar from "@/app/components/loading/NavigationProgressBar";

/** Suspense boundary so useSearchParams does not bail out the root layout. */
export default function NavigationProgressBarHost() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  );
}
