import {
  allowanceFromDataLabel,
  calculateRetailPriceUsd,
  type RetailAllowanceInput,
} from "@/app/lib/pricing/retailPrice";

export type VesimRoamingCountry = {
  country: string;
  networks: string[];
  dataSpeeds: string[];
};

export type VesimOffer = {
  id: string;
  offerId?: string;
  code?: string;
  name: string;
  title?: string;
  country?: string;
  countryName?: string;
  countryFlag?: string;
  dataGB?: number | null;
  dataMB?: number | null;
  dataUnlimited?: boolean;
  dataFormatted: string;
  dataUnit?: string;
  durationDays?: number | null;
  validity?: number | null;
  validityUnit?: string;
  network?: string;
  networks?: string[];
  regions?: string[];
  currency?: string;
  /**
   * MAP eSIM retail USD shown/charged to customers.
   * Never equal to supplier cost once pricing is applied.
   */
  priceUSD?: number | null;
  price?: number | null;
  displayPrice?: number | null;
  /**
   * Raw VeSIM supplier USD. Server/admin only — strip before public JSON.
   */
  providerPriceUSD?: number | null;
  priceFormatted: string;
  description?: string;
  notes?: string;
  packageInfo?: string;
  dataSpeeds?: string[];
  roaming?: VesimRoamingCountry[];
  coveredCountries?: string[];
  coveredCountriesCount?: number;
  voiceMinutes?: number | null;
  smsCount?: number | null;
  hasVoiceSms?: boolean;
  apn?: string;
  isRefundable?: boolean;
  supportTopUp?: boolean;
  isPopular?: boolean;
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Extract offer arrays from all known VeSIM response shapes. */
export function extractOffers(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Record<string, unknown>;

  if (Array.isArray(root.offers)) {
    return root.offers;
  }

  if (Array.isArray(root.data)) {
    return root.data;
  }

  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;

    if (Array.isArray(nested.offers)) {
      return nested.offers;
    }

    if (Array.isArray(nested.data)) {
      return nested.data;
    }
  }

  if (Array.isArray(root.result)) {
    return root.result;
  }

  return [];
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

/**
 * Genuine unlimited detection only.
 * Never treat a fixed allowance (e.g. 50 GB) as unlimited.
 */
export function detectDataUnlimited(item: Record<string, unknown>): boolean {
  const dataGB = firstNumber(item.dataGB, item.data_gb);
  const dataMB = firstNumber(item.dataMB, item.data_mb);
  const hasFixedAllowance =
    (dataGB != null && dataGB > 0) || (dataMB != null && dataMB > 0);

  // Fixed numeric allowances are always standard packages.
  if (hasFixedAllowance) {
    return false;
  }

  if (item.dataUnlimited === true || item.unlimited === true) {
    return true;
  }

  const formatted = firstString(item.dataFormatted, item.data_formatted) || "";
  if (/\bunlimited\b/i.test(formatted)) {
    return true;
  }

  const titleText = [
    item.name,
    item.title,
    item.shortNotes,
    item.offerName,
    item.plan_name,
    item.notes,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  // Title/notes may say "unlimited", but never override a fixed GB/MB amount above.
  if (/\bunlimited\b/i.test(titleText)) {
    return true;
  }

  return false;
}

function formatDataAllowance(item: Record<string, unknown>): {
  dataFormatted: string;
  dataUnit?: string;
  dataGB: number | null;
  dataMB: number | null;
  dataUnlimited: boolean;
} {
  const unlimited = detectDataUnlimited(item);

  if (unlimited) {
    return {
      dataFormatted: "Unlimited",
      dataUnit: "unlimited",
      dataGB: null,
      dataMB: null,
      dataUnlimited: true,
    };
  }

  const existing = firstString(item.dataFormatted, item.data_formatted);
  if (existing) {
    const unitMatch = existing.match(/\b(MB|GB|TB)\b/i);
    const dataGB = firstNumber(item.dataGB, item.data_gb);
    const dataMB =
      firstNumber(item.dataMB, item.data_mb) ??
      (dataGB !== null && dataGB < 1 ? Math.round(dataGB * 1024) : null);

    return {
      dataFormatted: existing.replace(/\.0\s+GB/i, " GB").replace(/\s+/g, " "),
      dataUnit: unitMatch?.[1]?.toUpperCase(),
      dataGB,
      dataMB,
      dataUnlimited: false,
    };
  }

  const dataGB = firstNumber(item.dataGB, item.data_gb, item.data);
  const dataMB = firstNumber(item.dataMB, item.data_mb);

  if (dataGB !== null) {
    const formatted =
      dataGB >= 1
        ? `${Number.isInteger(dataGB) ? dataGB : Number(dataGB.toFixed(1))} GB`
        : `${Math.round(dataGB * 1024)} MB`;
    return {
      dataFormatted: formatted,
      dataUnit: dataGB >= 1 ? "GB" : "MB",
      dataGB,
      dataMB: dataMB ?? (dataGB < 1 ? Math.round(dataGB * 1024) : null),
      dataUnlimited: false,
    };
  }

  if (dataMB !== null) {
    return {
      dataFormatted: `${dataMB} MB`,
      dataUnit: "MB",
      dataGB: dataMB / 1024,
      dataMB,
      dataUnlimited: false,
    };
  }

  return {
    dataFormatted: "—",
    dataUnit: undefined,
    dataGB: null,
    dataMB: null,
    dataUnlimited: false,
  };
}

function parseRoaming(raw: unknown): VesimRoamingCountry[] {
  return asArray(raw)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const country = firstString(item.country, item.code, item.countryCode);
      if (!country) return null;

      const networks = asArray(item.networks)
        .map((network) => {
          if (typeof network === "string") return network;
          if (!network || typeof network !== "object") return "";
          const net = network as Record<string, unknown>;
          return firstString(net.brand, net.brandName, net.name) || "";
        })
        .filter(Boolean);

      const dataSpeeds = asArray(item.dataSpeeds).filter(
        (speed): speed is string => typeof speed === "string"
      );

      return { country, networks, dataSpeeds };
    })
    .filter((item): item is VesimRoamingCountry => item !== null);
}

export function formatOfferPrice(
  amount: number | null | undefined,
  currency = "USD"
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return "—";
  }

  const symbol = currency.toUpperCase() === "USD" ? "$" : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

/** Public JSON must never include supplier/provider cost fields. */
export function toPublicVesimOffer(offer: VesimOffer): VesimOffer {
  const { providerPriceUSD: _providerPriceUSD, ...publicOffer } = offer;
  return publicOffer;
}

export function toPublicVesimOffers(offers: VesimOffer[]): VesimOffer[] {
  return offers.map(toPublicVesimOffer);
}

/**
 * Parse already-normalized public `/api/vesim/offers` JSON for country/plan UI.
 *
 * `priceUSD` is trusted as MAP retail — do NOT re-run retail markup here.
 * Raw VeSIM payloads must continue to use `normalizeOffers` / `normalizeOffer`.
 * Accidental `providerPriceUSD` is stripped before browser use.
 */
export function parsePublicVesimOffer(raw: unknown): VesimOffer | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const item = { ...(raw as Record<string, unknown>) };
  delete item.providerPriceUSD;

  const id = firstString(item.id, item.offerId, item.offer_id, item.code);
  if (!id) {
    return null;
  }

  const priceUSD = firstNumber(item.priceUSD, item.displayPrice, item.price);
  const currency = firstString(item.currency) || "USD";
  const name = firstString(item.name, item.title) || id;
  const dataFormatted =
    typeof item.dataFormatted === "string" && item.dataFormatted.trim()
      ? item.dataFormatted
      : "—";
  const priceFormatted =
    typeof item.priceFormatted === "string" && item.priceFormatted.trim()
      ? item.priceFormatted
      : formatOfferPrice(priceUSD, currency);

  return {
    ...(item as unknown as VesimOffer),
    id,
    name,
    dataFormatted,
    currency,
    priceUSD,
    price: priceUSD,
    displayPrice: priceUSD,
    priceFormatted,
  };
}

export function parsePublicVesimOffers(payload: unknown): VesimOffer[] {
  return extractOffers(payload)
    .map(parsePublicVesimOffer)
    .filter((offer): offer is VesimOffer => offer !== null);
}

export function normalizeOffer(raw: unknown): VesimOffer | null {
  if (typeof raw === "string" && raw.trim()) {
    return {
      id: raw.trim(),
      name: raw.trim(),
      dataFormatted: "—",
      priceFormatted: "—",
    };
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const id = firstString(
    item.id,
    item.offerId,
    item.offer_id,
    item.code,
    item.offer
  );

  if (!id) {
    return null;
  }

  const data = formatDataAllowance(item);
  const durationDays = firstNumber(
    item.durationDays,
    item.duration_days,
    item.validity,
    item.validityDays,
    item.days
  );
  const providerPriceUSD = firstNumber(
    item.priceUSD,
    item.price_usd,
    item.displayPrice,
    item.price
  );
  // Customer-facing amounts are MAP retail; supplier cost stays on providerPriceUSD.
  let allowance: RetailAllowanceInput = {
    dataUnlimited: data.dataUnlimited,
    dataMB: data.dataMB,
    dataGB: data.dataGB,
  };
  // If numeric fields are missing, use structured dataFormatted (not plan titles).
  if (
    !allowance.dataUnlimited &&
    !(typeof allowance.dataMB === "number" && allowance.dataMB > 0) &&
    !(typeof allowance.dataGB === "number" && allowance.dataGB > 0)
  ) {
    const fromLabel = allowanceFromDataLabel(data.dataFormatted);
    if (fromLabel) allowance = { ...allowance, ...fromLabel };
  }
  const retailUsd =
    providerPriceUSD != null
      ? calculateRetailPriceUsd(providerPriceUSD, allowance)
      : null;
  const priceUSD = retailUsd ?? providerPriceUSD;
  const currency = firstString(item.currency) || "USD";
  const regions = asArray(item.regions)
    .map((region) => (typeof region === "string" ? region : ""))
    .filter(Boolean);

  const roaming = parseRoaming(item.roaming);
  const coveredCountries = Array.from(
    new Set(roaming.map((entry) => entry.country).filter(Boolean))
  );

  const operatorNetworks = asArray(item.operators)
    .concat(asArray(item.operatorInfo))
    .map((network) => {
      if (typeof network === "string") return network;
      if (!network || typeof network !== "object") return "";
      const net = network as Record<string, unknown>;
      return firstString(net.brand, net.brandName, net.name) || "";
    })
    .filter(Boolean);

  const roamingNetworks = roaming.flatMap((entry) => entry.networks);
  const networks = Array.from(
    new Set(
      [...operatorNetworks, ...roamingNetworks]
        .filter(Boolean)
        .filter((network) => network.toLowerCase() !== "unknown")
    )
  );

  const voiceMinutes = firstNumber(
    item.voiceMinutes,
    item.voice_minutes,
    item.voice,
    item.minutes
  );
  const smsCount = firstNumber(item.smsCount, item.sms_count, item.sms);
  const hasVoiceSms =
    item.hasSmsVoice === true ||
    item.hasVoiceSms === true ||
    (voiceMinutes !== null && voiceMinutes > 0) ||
    (smsCount !== null && smsCount > 0);

  const name =
    firstString(
      item.name,
      item.title,
      item.shortNotes,
      item.plan_name,
      item.offerName
    ) ||
    [
      data.dataFormatted !== "—" ? data.dataFormatted : null,
      durationDays !== null ? `${durationDays} Days` : null,
    ]
      .filter(Boolean)
      .join(" · ") ||
    id;

  return {
    id,
    offerId: firstString(item.offerId, item.offer_id) || id,
    code: firstString(item.code),
    name,
    title: firstString(item.title) || name,
    country: firstString(item.country, item.countryCode, item.country_code),
    countryName: firstString(item.countryName, item.country_name),
    countryFlag: firstString(item.countryFlag, item.flag),
    dataGB: data.dataGB,
    dataMB: data.dataMB,
    dataUnlimited: data.dataUnlimited,
    dataFormatted: data.dataFormatted,
    dataUnit: data.dataUnit,
    durationDays,
    validity: durationDays,
    validityUnit: durationDays !== null ? "Days" : undefined,
    network:
      firstString(item.packageInfo, item.network, item.operator) ||
      networks[0] ||
      regions.join(", ") ||
      undefined,
    networks,
    regions,
    currency,
    priceUSD,
    price: priceUSD,
    displayPrice: priceUSD,
    providerPriceUSD,
    priceFormatted: formatOfferPrice(priceUSD, currency),
    description: firstString(item.description),
    notes: firstString(item.notes, item.shortNotes),
    packageInfo: firstString(item.packageInfo),
    dataSpeeds: asArray(item.dataSpeeds).filter(
      (speed): speed is string => typeof speed === "string"
    ),
    roaming,
    coveredCountries,
    coveredCountriesCount: coveredCountries.length || undefined,
    voiceMinutes,
    smsCount,
    hasVoiceSms,
    apn: firstString(item.apn, item.APN, item.apnName),
    isRefundable: item.isRefundable === true,
    supportTopUp: item.supportTopUp === true,
    isPopular: item.isPopular === true,
  };
}

export function normalizeOffers(payload: unknown): VesimOffer[] {
  return extractOffers(payload)
    .map(normalizeOffer)
    .filter((offer): offer is VesimOffer => offer !== null);
}

export function getOfferDataMb(offer: VesimOffer): number | null {
  if (offer.dataUnlimited) return null;
  if (offer.dataMB != null && Number.isFinite(offer.dataMB)) return offer.dataMB;
  if (offer.dataGB != null && Number.isFinite(offer.dataGB)) {
    return offer.dataGB * 1024;
  }
  return null;
}
