/**
 * Client-only cookie helpers for public-shell rehydration.
 * Keeps root layout free of cookies()/auth() so marketing pages can cache.
 */

export function readBrowserCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  for (const part of parts) {
    if (!part.startsWith(prefix) && !part.startsWith(`${name}=`)) continue;
    const raw = part.includes("=") ? part.slice(part.indexOf("=") + 1) : "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
