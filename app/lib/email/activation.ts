/**
 * Server-side activation link helpers.
 * Never log activation URLs, LPA values, or activation codes.
 */

const MAX_URL_LEN = 2048;

const APPLE_ESIM_HOSTS = new Set([
  "esimsetup.apple.com",
  "esimsetup.apple.com.cn",
]);

/** Hosts allowed for provider-supplied Android / carrier activation URLs. */
const ANDROID_ACTIVATION_HOST_SUFFIXES = [
  "android.com",
  "google.com",
  "googleapis.com",
  "vesim.xyz",
  "vesim.com",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function dig(record: Record<string, unknown> | null, ...keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    if (key in record && record[key] != null && record[key] !== "") {
      return record[key];
    }
  }
  return undefined;
}

function collectContainers(root: Record<string, unknown>): Record<string, unknown>[] {
  const containers: Record<string, unknown>[] = [root];
  const nestedKeys = [
    "order",
    "data",
    "esim",
    "eSim",
    "profile",
    "profiles",
    "installation",
    "install",
    "sim",
    "result",
    "links",
    "activation",
  ];

  for (const key of nestedKeys) {
    const value = root[key];
    const asObj = asRecord(value);
    if (asObj) containers.push(asObj);
    if (Array.isArray(value)) {
      for (const item of value) {
        const itemObj = asRecord(item);
        if (itemObj) containers.push(itemObj);
      }
    }
  }

  return containers;
}

function extractFromContainers(
  containers: Record<string, unknown>[],
  keys: string[]
): string | undefined {
  for (const container of containers) {
    const value = firstString(...keys.map((key) => dig(container, key)));
    if (value) return value;
  }
  return undefined;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Validates a provider-supplied activation URL before rendering/redirect.
 * Rejects non-HTTPS, credentials-in-URL, and unknown dangerous schemes.
 */
export function isValidProviderActivationUrl(value: string): boolean {
  const raw = value.trim();
  if (!raw || raw.length > MAX_URL_LEN) return false;
  if (/\s/.test(raw)) return false;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (!parsed.hostname || parsed.hostname.includes("..")) return false;

  return true;
}

export function isOfficialAppleEsimActivationUrl(value: string): boolean {
  if (!isValidProviderActivationUrl(value)) return false;
  try {
    const parsed = new URL(value.trim());
    if (APPLE_ESIM_HOSTS.has(parsed.hostname.toLowerCase())) return true;
    // Accept other apple.com HTTPS paths that clearly target eSIM setup.
    if (
      parsed.hostname.toLowerCase().endsWith(".apple.com") &&
      /esim/i.test(`${parsed.pathname}${parsed.search}`)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function isOfficialAndroidActivationUrl(value: string): boolean {
  if (!isValidProviderActivationUrl(value)) return false;
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase();
    const haystack = `${host}${parsed.pathname}${parsed.search}`.toLowerCase();

    if (!/android|lpa|esim|carrier/i.test(haystack)) return false;

    return ANDROID_ACTIVATION_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

export type OfficialActivationLinks = {
  /** Exact provider-supplied official iPhone / Apple carrier activation URL. */
  iphoneActivationUrl?: string;
  /** Exact provider-supplied official Android activation URL (rare). */
  androidActivationUrl?: string;
};

/**
 * Extract official activation links from a verified VeSIM order payload.
 * Does not invent links from LPA strings.
 */
export function extractOfficialActivationLinks(
  orderPayload: Record<string, unknown>
): OfficialActivationLinks {
  const containers = collectContainers(orderPayload);

  const candidates = [
    extractFromContainers(containers, [
      "appleInstallUrl",
      "apple_install_url",
      "iosActivationUrl",
      "ios_activation_url",
      "iphoneActivationUrl",
      "iphone_activation_url",
      "universalLink",
      "universal_link",
      "esimUniversalLink",
      "esim_universal_link",
    ]),
    extractFromContainers(containers, [
      "androidActivationUrl",
      "android_activation_url",
      "androidInstallUrl",
      "android_install_url",
      "androidLpaUrl",
      "android_lpa_url",
    ]),
    extractFromContainers(containers, [
      "activationUrl",
      "activation_url",
      "installationUrl",
      "installation_url",
      "installUrl",
      "install_url",
      "carrierActivationUrl",
      "carrier_activation_url",
      "esim_activation_url",
      "esimActivationUrl",
    ]),
  ].filter((value): value is string => Boolean(value));

  let iphoneActivationUrl: string | undefined;
  let androidActivationUrl: string | undefined;

  for (const candidate of candidates) {
    if (!isHttpUrl(candidate)) continue;
    if (!isValidProviderActivationUrl(candidate)) continue;

    if (!iphoneActivationUrl && isOfficialAppleEsimActivationUrl(candidate)) {
      iphoneActivationUrl = candidate.trim();
      continue;
    }

    if (!androidActivationUrl && isOfficialAndroidActivationUrl(candidate)) {
      androidActivationUrl = candidate.trim();
    }
  }

  return { iphoneActivationUrl, androidActivationUrl };
}

/** Public site base URL for email deep-links to installation guides. */
export function getPublicAppBaseUrl(): string {
  const raw = (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://mapesim.com"
  ).trim();

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "https://mapesim.com";
    }
    return parsed.origin;
  } catch {
    return "https://mapesim.com";
  }
}

export function getAndroidInstallGuideUrl(): string {
  return `${getPublicAppBaseUrl()}/install/android`;
}

export function getIphoneInstallGuideUrl(): string {
  return `${getPublicAppBaseUrl()}/install/iphone`;
}
