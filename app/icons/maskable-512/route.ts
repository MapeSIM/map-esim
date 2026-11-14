import { createPwaIconResponse } from "@/app/lib/pwa/pwaIconResponse";

export const runtime = "edge";
export const dynamic = "force-static";

export function GET() {
  return createPwaIconResponse({ size: 512, maskable: true });
}
