import { NextResponse } from "next/server";
import { getPublicManualPaymentConfig } from "@/app/lib/payments/manualPaymentConfig";
import {
  EMPTY_MANUAL_PAYMENT_CONFIG,
  toManualPaymentSettingsMap,
} from "@/app/lib/payments/manualPaymentConfigShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public checkout read for admin-configured manual payment details.
 * When disabled, fields are omitted so numbers are not leaked.
 */
export async function GET() {
  const config = await getPublicManualPaymentConfig();
  const exposed = config.enabled ? config : EMPTY_MANUAL_PAYMENT_CONFIG;
  return NextResponse.json(
    {
      success: true,
      config: exposed,
      settings: toManualPaymentSettingsMap(exposed),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
