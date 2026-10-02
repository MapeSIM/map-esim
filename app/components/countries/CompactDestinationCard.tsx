import Link from "next/link";
import type { DestinationCard } from "@/app/lib/vesim/countriesListingModel";
import { resolveDestinationFlagVisual } from "@/app/lib/vesim/destinationPresentation";

/**
 * Presentational destination card — safe for Server Components.
 * Shared CSS classes keep /countries RSC flight small (no per-card Tailwind walls).
 * Prices are static USD placeholders; DestinationGridPrices upgrades them once per grid.
 */
function DestinationFlagMark({
  destination,
}: {
  destination: DestinationCard;
}) {
  if (destination.kind !== "country") {
    const label = destination.kind === "global" ? "G" : "R";
    return (
      <span className="map-dest-flag map-dest-flag--initials" aria-hidden="true">
        {label}
      </span>
    );
  }

  const visual = resolveDestinationFlagVisual(destination);

  if (visual.type === "image") {
    return (
      <span className="map-dest-flag map-dest-flag--image" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- listing payload must stay tiny; SVG flags are static. */}
        <img
          className="map-dest-flag__img"
          src={visual.src}
          alt=""
          width={45}
          height={30}
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  }

  if (visual.type === "emoji") {
    return (
      <span className="map-dest-flag map-dest-flag--emoji" aria-hidden="true">
        {visual.emoji}
      </span>
    );
  }

  return (
    <span
      className="map-dest-flag map-dest-flag--initials"
      aria-hidden="true"
      title={destination.name}
    >
      {visual.initials}
    </span>
  );
}

function usdPlaceholder(amountUsd: number | null): string {
  if (amountUsd == null || !Number.isFinite(amountUsd)) return "—";
  return `$${amountUsd.toFixed(2)}`;
}

export default function CompactDestinationCard({
  destination,
  href,
}: {
  destination: DestinationCard;
  href: string;
}) {
  const amountAttr =
    destination.minPriceUsd != null && Number.isFinite(destination.minPriceUsd)
      ? String(destination.minPriceUsd)
      : "";

  return (
    <Link href={href} className="map-dest-card">
      <div className="map-dest-card__main">
        <DestinationFlagMark destination={destination} />

        <div className="map-dest-card__text">
          <h3 className="map-dest-card__name">{destination.name}</h3>
          <p className="map-dest-card__meta">
            {destination.plans} {destination.plans === 1 ? "plan" : "plans"}
          </p>
        </div>
      </div>

      <div className="map-dest-card__price-wrap">
        <div className="map-dest-card__price">
          <p className="map-dest-card__from">From</p>
          <p
            className="map-dest-card__amount"
            data-usd={amountAttr}
          >
            {usdPlaceholder(destination.minPriceUsd)}
          </p>
        </div>
        <span className="map-dest-card__arrow" aria-hidden="true">
          →
        </span>
      </div>
    </Link>
  );
}
