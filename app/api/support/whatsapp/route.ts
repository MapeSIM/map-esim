import { NextResponse } from "next/server";
import { getPublicWhatsAppSupportConfig } from "@/app/lib/support/whatsappSupport";

export const dynamic = "force-dynamic";

/**
 * Public WhatsApp support button config.
 * Exposes only enabled + sanitized phone/message/href — no admin metadata.
 */
export async function GET() {
  const config = await getPublicWhatsAppSupportConfig();
  return NextResponse.json(config, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
