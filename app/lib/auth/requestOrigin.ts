import "server-only";

import { headers } from "next/headers";

/**
 * Best-effort current request origin for same-site callbackUrl allowlisting.
 * Uses forwarded host/proto when present (Cloudflare tunnel / reverse proxy).
 */
export async function readRequestOrigin(): Promise<string | null> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") || h.get("host") || "")
    .split(",")[0]
    .trim();
  if (
    !host ||
    host.includes("://") ||
    host.includes("\\") ||
    host.includes("/") ||
    host.includes(" ")
  ) {
    return null;
  }
  const proto = (h.get("x-forwarded-proto") || "http")
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (proto !== "http" && proto !== "https") return null;
  return `${proto}://${host}`;
}
