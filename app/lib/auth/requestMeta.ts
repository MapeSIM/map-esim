import { headers } from "next/headers";

export async function getRequestIpKey(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for") || "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first.slice(0, 64);
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}
