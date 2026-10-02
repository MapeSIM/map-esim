import DestinationGridPrices from "@/app/components/countries/DestinationGridPrices";
import {
  type DestinationCard,
  type LetterGroup,
} from "@/app/lib/vesim/countriesListingModel";
import { resolveDestinationFlagVisual } from "@/app/lib/vesim/destinationPresentation";
import { buildDestinationPlansHref } from "@/app/lib/vesim/countriesListingReturn";

/** Escape text/attribute values before any HTML string interpolation. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeLetter(letter: string): string {
  const trimmed = letter.trim().toUpperCase();
  return /^[A-Z]$/.test(trimmed) ? trimmed : "#";
}

/**
 * Only relative /countries/{slug} hrefs — never javascript: or external schemes.
 */
export function safeDestinationCardHref(destinationId: string): string {
  const href = buildDestinationPlansHref(destinationId, {
    filter: "Country",
    q: "",
  });
  // Absolute schemes, javascript:, or any non-allowlisted path → hard fallback.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(href) || /javascript:/i.test(href)) {
    return "/countries";
  }
  if (
    !/^\/countries\/[A-Za-z0-9][A-Za-z0-9_-]*(?:\?[A-Za-z0-9_=&.-]*)?$/.test(
      href
    )
  ) {
    return "/countries";
  }
  return href;
}

/** Allow only known flag asset URLs from our presentation helper. */
export function safeFlagImageSrc(src: string): string | null {
  if (/^\/flags\/[a-z0-9-]+\.svg$/i.test(src)) return src;
  if (/^https:\/\/flagcdn\.com\/[a-z0-9-]+\.svg$/i.test(src)) return src;
  return null;
}

function usdPlaceholder(amountUsd: number | null): string {
  if (amountUsd == null || !Number.isFinite(amountUsd)) return "—";
  return `$${amountUsd.toFixed(2)}`;
}

function safePlansCount(plans: number): number {
  if (!Number.isFinite(plans)) return 0;
  return Math.max(0, Math.floor(plans));
}

function flagHtml(destination: DestinationCard): string {
  if (destination.kind !== "country") {
    const label = destination.kind === "global" ? "G" : "R";
    return `<span class="map-dest-flag map-dest-flag--initials" aria-hidden="true">${label}</span>`;
  }

  const visual = resolveDestinationFlagVisual(destination);
  if (visual.type === "image") {
    const src = safeFlagImageSrc(visual.src);
    if (!src) {
      const initials = escapeHtml(
        destination.code.trim().toUpperCase().slice(0, 4) || "?"
      );
      return `<span class="map-dest-flag map-dest-flag--initials" aria-hidden="true" title="${escapeHtml(destination.name)}">${initials}</span>`;
    }
    return `<span class="map-dest-flag map-dest-flag--image" aria-hidden="true"><img class="map-dest-flag__img" src="${escapeHtml(src)}" alt="" width="45" height="30" loading="lazy" decoding="async"/></span>`;
  }
  if (visual.type === "emoji") {
    return `<span class="map-dest-flag map-dest-flag--emoji" aria-hidden="true">${escapeHtml(visual.emoji)}</span>`;
  }
  return `<span class="map-dest-flag map-dest-flag--initials" aria-hidden="true" title="${escapeHtml(destination.name)}">${escapeHtml(visual.initials)}</span>`;
}

function cardHtml(destination: DestinationCard): string {
  const href = escapeHtml(safeDestinationCardHref(destination.id));
  const name = escapeHtml(destination.name);
  const plans = safePlansCount(destination.plans);
  const plansLabel = `${plans} ${plans === 1 ? "plan" : "plans"}`;
  const amountAttr =
    destination.minPriceUsd != null && Number.isFinite(destination.minPriceUsd)
      ? escapeHtml(String(destination.minPriceUsd))
      : "";
  const amountText = escapeHtml(usdPlaceholder(destination.minPriceUsd));

  return `<a href="${href}" class="map-dest-card"><div class="map-dest-card__main">${flagHtml(destination)}<div class="map-dest-card__text"><h3 class="map-dest-card__name">${name}</h3><p class="map-dest-card__meta">${plansLabel}</p></div></div><div class="map-dest-card__price-wrap"><div class="map-dest-card__price"><p class="map-dest-card__from">From</p><p class="map-dest-card__amount" data-usd="${amountAttr}">${amountText}</p></div><span class="map-dest-card__arrow" aria-hidden="true">→</span></div></a>`;
}

function groupsHtml(groups: LetterGroup[]): string {
  return groups
    .map((group) => {
      const letter = safeLetter(group.letter);
      const letterAttr = escapeHtml(letter);
      const countLabel = `${group.items.length} ${
        group.items.length === 1 ? "destination" : "destinations"
      }`;
      const cards = group.items.map(cardHtml).join("");
      return `<section aria-labelledby="letter-${letterAttr}"><div class="mb-3 flex items-center gap-3 border-b border-[var(--border)] pb-2"><h3 id="letter-${letterAttr}" class="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-strong)]/15 text-sm font-bold text-[var(--accent-strong)]">${letterAttr}</h3><p class="text-xs font-medium text-[var(--text-soft)]">${countLabel}</p></div><div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">${cards}</div></section>`;
    })
    .join("");
}

/**
 * Inner HTML for the default Country A–Z grid.
 * Callers must only pass this string into dangerouslySetInnerHTML.
 */
export function buildCountriesDefaultGridBodyHtml(options: {
  alphabeticalGroups: LetterGroup[];
  destinationsCount: number;
  filteredCount: number;
}): string {
  const { alphabeticalGroups, destinationsCount, filteredCount } = options;
  if (destinationsCount === 0) {
    return `<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" aria-label="Loading destinations"></div>`;
  }
  if (filteredCount === 0) {
    return `<div class="flex flex-col items-center justify-center rounded-[18px] border border-[var(--border)] bg-[var(--surface-2)] px-6 py-16 text-center"><h3 class="text-lg font-semibold text-[var(--heading)]">No destinations found</h3><p class="mt-2 max-w-sm text-sm text-[var(--text-muted)]">Try searching with another country or region.</p></div>`;
  }
  return `<div class="space-y-8">${groupsHtml(alphabeticalGroups)}</div>`;
}

/**
 * Default Country A–Z grid as one escaped HTML string.
 * Avoids serializing ~200 React card trees into the /countries RSC flight.
 * Visual classes match CompactDestinationCard; filtered views still use React cards.
 */
export default function CountriesDefaultCountryGridHtml({
  alphabeticalGroups,
  destinationsCount,
  filteredCount,
}: {
  alphabeticalGroups: LetterGroup[];
  destinationsCount: number;
  filteredCount: number;
}) {
  const body = buildCountriesDefaultGridBodyHtml({
    alphabeticalGroups,
    destinationsCount,
    filteredCount,
  });

  return (
    <DestinationGridPrices>
      <section className="mx-auto max-w-[1200px] px-4 pb-16 pt-4 sm:px-6 sm:pb-20 sm:pt-8">
        <div className="mb-4 flex flex-col gap-2 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--heading)] sm:text-[1.75rem]">
              All countries
            </h2>
            <p className="mt-1.5 text-sm text-[var(--text-muted)] sm:text-[15px]">
              Browse destinations in alphabetical order.
            </p>
          </div>
          <p className="text-sm text-[var(--text-soft)]">
            {filteredCount}{" "}
            {filteredCount === 1 ? "destination" : "destinations"}
          </p>
        </div>
        <div dangerouslySetInnerHTML={{ __html: body }} />
      </section>
    </DestinationGridPrices>
  );
}
