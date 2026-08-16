import { PromoDiscountType } from "@prisma/client";

export const PROMO_CODE_MIN_LEN = 3;
export const PROMO_CODE_MAX_LEN = 30;

const NORMALIZED_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,29}$/;

export class PromoValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.field = field;
    this.name = "PromoValidationError";
  }
}

/** Trim, strip spaces, uppercase. Empty when blank. */
export function normalizePromoCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

export function isValidNormalizedPromoCode(code: string): boolean {
  return (
    code.length >= PROMO_CODE_MIN_LEN &&
    code.length <= PROMO_CODE_MAX_LEN &&
    NORMALIZED_CODE_RE.test(code)
  );
}

export function parseRequiredPromoCode(raw: unknown): string {
  const code = normalizePromoCode(raw);
  if (!code) {
    throw new PromoValidationError("code", "Code is required.");
  }
  if (!isValidNormalizedPromoCode(code)) {
    throw new PromoValidationError(
      "code",
      "Use 3–30 letters, numbers, hyphens, or underscores."
    );
  }
  return code;
}

export function parseOptionalDescription(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 240) {
    throw new PromoValidationError(
      "description",
      "Description must be 240 characters or fewer."
    );
  }
  return trimmed;
}

export function parseDiscountType(raw: unknown): PromoDiscountType {
  const value = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (value === PromoDiscountType.PERCENT) return PromoDiscountType.PERCENT;
  if (value === PromoDiscountType.FIXED_USD) return PromoDiscountType.FIXED_USD;
  throw new PromoValidationError("discountType", "Select a discount type.");
}

/** PERCENT: 1–100. FIXED_USD: cents from dollars string or integer cents. */
export function parseDiscountValue(
  type: PromoDiscountType,
  raw: unknown
): number {
  if (type === PromoDiscountType.PERCENT) {
    const n = parsePositiveInt(raw);
    if (n == null || n < 1 || n > 100) {
      throw new PromoValidationError(
        "discountValue",
        "Percentage must be between 1 and 100."
      );
    }
    return n;
  }
  const cents = parseUsdToCents(raw);
  if (cents == null || cents < 1) {
    throw new PromoValidationError(
      "discountValue",
      "Fixed discount must be greater than $0.00."
    );
  }
  return cents;
}

export function parseOptionalPositiveInt(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = parsePositiveInt(raw);
  if (n == null) {
    throw new PromoValidationError("limit", "Enter a positive whole number.");
  }
  return n;
}

export function parseOptionalMinimumOrderCents(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const cents = parseUsdToCents(raw);
  if (cents == null || cents < 0) {
    throw new PromoValidationError(
      "minimumOrderCents",
      "Minimum order must be $0.00 or more."
    );
  }
  return cents;
}

export function parseOptionalDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new PromoValidationError("date", "Enter a valid date.");
  }
  return date;
}

export function assertPromoDateRange(
  startsAt: Date | null,
  endsAt: Date | null
): void {
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new PromoValidationError(
      "endsAt",
      "End date must be after the start date."
    );
  }
}

export function assertUsageLimits(
  totalUsageLimit: number | null,
  perCustomerUsageLimit: number | null
): void {
  if (totalUsageLimit != null && totalUsageLimit < 1) {
    throw new PromoValidationError(
      "totalUsageLimit",
      "Total usage limit must be at least 1."
    );
  }
  if (perCustomerUsageLimit != null && perCustomerUsageLimit < 1) {
    throw new PromoValidationError(
      "perCustomerUsageLimit",
      "Per-customer limit must be at least 1."
    );
  }
  if (
    totalUsageLimit != null &&
    perCustomerUsageLimit != null &&
    perCustomerUsageLimit > totalUsageLimit
  ) {
    throw new PromoValidationError(
      "perCustomerUsageLimit",
      "Per-customer limit cannot exceed the total usage limit."
    );
  }
}

export function parseDestinationCodes(raw: unknown): string[] {
  const tokens = splitTokens(raw);
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const code = sanitizePromoDestinationCode(token);
    if (!code) {
      throw new PromoValidationError(
        "destinations",
        "Each destination must be a valid country or region code."
      );
    }
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

export function parseOfferIds(raw: unknown): string[] {
  const tokens = splitTokens(raw);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const id = typeof token === "string" ? token.trim() : "";
    if (!id || id.length > 128) {
      throw new PromoValidationError(
        "offers",
        "Each plan/offer id must be a valid offer identifier."
      );
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function sanitizePromoDestinationCode(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^(region-[a-z0-9-]+|global)$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

function splitTokens(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw !== "string") return [];
  return raw
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parsePositiveInt(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw)) {
    return raw > 0 ? raw : null;
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function parseUsdToCents(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
    return raw;
  }
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/^\$/, "");
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    // Whole dollars when no decimal (admin USD field).
    const dollars = Number(trimmed);
    if (!Number.isInteger(dollars) || dollars < 0) return null;
    return dollars * 100;
  }
  if (!/^\d+\.\d{1,2}$/.test(trimmed)) return null;
  const [whole, frac] = trimmed.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isInteger(cents) || cents < 0) return null;
  return cents;
}
