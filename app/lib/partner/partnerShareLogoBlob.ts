/**
 * Pure Partner logo Blob pathname / ownership helpers.
 * No secrets. No I/O. Safe for offline QA.
 */

export const PARTNER_LOGO_BLOB_PREFIX = "partner-logos";
export const PARTNER_LOGO_MAX_BYTES = 1_048_576;
export const PARTNER_LOGO_MAX_INPUT_DIMENSION = 4096;
export const PARTNER_LOGO_MAX_OUTPUT_DIMENSION = 1024;
export const PARTNER_LOGO_BLOB_TOKEN_ENV = "BLOB_READ_WRITE_TOKEN";
export const PARTNER_LOGO_BLOB_STORE_ID_ENV = "BLOB_STORE_ID";
export const PARTNER_LOGO_BLOB_OIDC_ENV = "VERCEL_OIDC_TOKEN";

const PARTNER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FILE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
/**
 * Official public Blob host: `<store-id>.public.blob.vercel-storage.com`
 * Store id is a DNS label. Do not hardcode one store.
 */
const PUBLIC_BLOB_HOST_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.public\.blob\.vercel-storage\.com$/i;
const PATHNAME_RE = new RegExp(
  `^/${PARTNER_LOGO_BLOB_PREFIX}/([A-Za-z0-9_-]{1,64})/([^/]+)\\.webp$`
);

export type ParsedPartnerLogoBlob = {
  url: string;
  pathname: string;
  partnerId: string;
  fileId: string;
};

export function isVercelBlobPublicHost(hostname: string): boolean {
  const host = (hostname ?? "").trim().toLowerCase();
  if (!host) return false;
  return PUBLIC_BLOB_HOST_RE.test(host);
}

export function buildPartnerLogoBlobPathname(
  partnerId: string,
  fileId: string
): string {
  const id = (partnerId ?? "").trim();
  const file = (fileId ?? "").trim();
  if (!PARTNER_ID_RE.test(id) || !FILE_ID_RE.test(file)) {
    throw new Error("invalid_logo_pathname");
  }
  return `${PARTNER_LOGO_BLOB_PREFIX}/${id}/${file}.webp`;
}

export function partnerLogoPathnamePrefix(partnerId: string): string {
  const id = (partnerId ?? "").trim();
  if (!PARTNER_ID_RE.test(id)) return `${PARTNER_LOGO_BLOB_PREFIX}/`;
  return `${PARTNER_LOGO_BLOB_PREFIX}/${id}/`;
}

export function parsePartnerLogoBlobUrl(
  value: string | null | undefined
): ParsedPartnerLogoBlob | null {
  const raw = (value ?? "").trim();
  if (!raw || raw.length > 2048) return null;
  if (/^(javascript|data|blob|file|vbscript):/i.test(raw)) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password || parsed.hash) return null;
  if (parsed.port) return null;
  if (!isVercelBlobPublicHost(parsed.hostname)) return null;

  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (pathname.includes("..") || pathname.includes("//") || pathname.includes("\\")) {
    return null;
  }
  const match = PATHNAME_RE.exec(pathname);
  if (!match) return null;
  const partnerId = match[1];
  const fileId = match[2];
  if (!partnerId || !fileId || fileId.includes(".")) return null;

  return {
    url: parsed.toString(),
    pathname,
    partnerId,
    fileId,
  };
}

/** Public share pages may render MAP-owned Partner logos under partner-logos/. */
export function isPublicPartnerLogoBlobUrl(
  value: string | null | undefined
): boolean {
  return parsePartnerLogoBlobUrl(value) !== null;
}

/**
 * Remote delete is allowed only for a Blob under this Partner's prefix.
 * Arbitrary historical HTTPS URLs must not be deleted.
 */
export function isOwnedPartnerLogoBlobUrl(
  value: string | null | undefined,
  partnerId: string
): boolean {
  const id = (partnerId ?? "").trim();
  if (!PARTNER_ID_RE.test(id)) return false;
  const parsed = parsePartnerLogoBlobUrl(value);
  if (!parsed) return false;
  const prefix = `/${partnerLogoPathnamePrefix(id)}`;
  return parsed.partnerId === id && parsed.pathname.startsWith(prefix);
}
