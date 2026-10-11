import DestinationPlansSkeleton from "@/app/components/plans/DestinationPlansSkeleton";

/** Segment-level fallback while the destination page Suspense boundary resolves. */
export default function CountryDestinationLoading() {
  return <DestinationPlansSkeleton />;
}
