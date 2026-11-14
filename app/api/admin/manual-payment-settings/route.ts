import { NextResponse } from "next/server";
import { requireActiveAdminForOperations } from "@/app/lib/admin/operationsHealth";
import {
  getPublicManualPaymentConfig,
  upsertManualPaymentConfig,
} from "@/app/lib/payments/manualPaymentConfig";
import {
  parseManualPaymentConfigBody,
  toManualPaymentSettingsMap,
} from "@/app/lib/payments/manualPaymentConfigShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireActiveAdminForOperations();
    const config = await getPublicManualPaymentConfig();
    return NextResponse.json({
      success: true,
      config,
      settings: toManualPaymentSettingsMap(config),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load settings";
    return NextResponse.json({ success: false, error: message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const { admin } = await requireActiveAdminForOperations();
    const body = await req.json();
    const current = await getPublicManualPaymentConfig();
    const next = parseManualPaymentConfigBody(body, current);
    const config = await upsertManualPaymentConfig(next, admin.id);
    return NextResponse.json({
      success: true,
      config,
      settings: toManualPaymentSettingsMap(config),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save settings";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
