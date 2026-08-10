import { BRAND_SITE_URL } from "@/app/lib/brand";

/**
 * Absolute public canonical URL.
 * Homepage is always `https://mapesim.com/` (trailing slash).
 * Other public paths are origin + path with no trailing slash.
 */
export function absoluteCanonical(path: string = "/"): string {
  const raw = String(path ?? "").trim();
  if (!raw || raw === "/") {
    return `${BRAND_SITE_URL}/`;
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.origin === BRAND_SITE_URL && (url.pathname === "/" || url.pathname === "")) {
        return `${BRAND_SITE_URL}/`;
      }
      const pathname =
        url.pathname !== "/" && url.pathname.endsWith("/")
          ? url.pathname.replace(/\/+$/, "")
          : url.pathname || "/";
      return pathname === "/"
        ? `${BRAND_SITE_URL}/`
        : `${url.origin}${pathname}`;
    } catch {
      return raw;
    }
  }

  const pathname = raw.startsWith("/") ? raw : `/${raw}`;
  if (pathname === "/") {
    return `${BRAND_SITE_URL}/`;
  }
  return `${BRAND_SITE_URL}${pathname.replace(/\/+$/, "")}`;
}
