/**
 * Customer buy-link country hint normalization (URL query only).
 * Maps display names (e.g. Pakistan) to ISO-2 codes for checkout context.
 * Does not change Admin Copy Link generation or auth return-path builders.
 * Offline-QA safe — no Prisma, network, or secrets.
 */
import { countries as staticCountries } from "@/app/data/countries";
import { slugifyDestination } from "@/app/lib/vesim/destinations";

const MAX_DISPLAY_NAME_LEN = 80;

/** Same rules as sanitizeCountryHint / normalizePackageShareCountry for codes. */
function sanitizeCodeOrRegion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^(region-[a-z0-9-]+|global)$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

function looksLikeSafeDisplayName(value: string): boolean {
  if (!value || value.length > MAX_DISPLAY_NAME_LEN) return false;
  // Reject path/query/injection fragments; allow letters, spaces, and common name punctuation.
  if (/[\/\\?#&=<>{}[\]`|^~]/.test(value)) return false;
  if (/https?:\/\//i.test(value)) return false;
  return true;
}

function matchStaticCountryCode(raw: string): string | null {
  const lower = raw.toLowerCase();
  const slug = slugifyDestination(raw);
  const match = staticCountries.find((item) => {
    if (item.code.toUpperCase() === raw.toUpperCase()) return true;
    if (item.id === slug || item.id === lower) return true;
    if (item.name.toLowerCase() === lower) return true;
    return slugifyDestination(item.name) === slug;
  });
  const code = (match?.code ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) return code;
  return null;
}

/** Best-effort English region display-name → ISO-3166-1 alpha-2. */
function matchIntlRegionCode(raw: string): string | null {
  const target = raw.trim().toLowerCase();
  if (!target) return null;
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a += 1) {
      for (let b = 65; b <= 90; b += 1) {
        const code = String.fromCharCode(a, b);
        const label = display.of(code);
        if (!label || label === code) continue;
        if (label.toLowerCase() === target) return code;
        if (slugifyDestination(label) === slugifyDestination(raw)) return code;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Normalize a customer `/account/esim/buy?country=` hint.
 * - Valid ISO-2 / region-* / global → unchanged
 * - Known display names (e.g. Pakistan) → ISO code (PK)
 * - Invalid / unsafe → null (offer prepare may still proceed without country)
 */
export function normalizeCustomerBuyCountryHint(
  value: unknown
): string | null {
  const direct = sanitizeCodeOrRegion(value);
  if (direct) return direct;

  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!looksLikeSafeDisplayName(trimmed)) return null;

  return matchStaticCountryCode(trimmed) || matchIntlRegionCode(trimmed);
}
