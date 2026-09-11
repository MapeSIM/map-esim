import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildPartnerSalesExportCsv } from "@/app/lib/partner/partnerGrowth";
import { parsePartnerGrowthPeriod } from "@/app/lib/partner/partnerGrowthShared";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

/**
 * Optional Partner sales CSV export.
 * Auth: PARTNER session + active partner actor.
 * Never includes provider cost fields.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const sessionUserId = session?.user?.id?.trim() || "";
    const sessionRole = session?.user?.role;
    if (!sessionUserId || sessionRole !== "PARTNER") {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404, headers: NO_STORE }
      );
    }

    const period = parsePartnerGrowthPeriod(
      req.nextUrl.searchParams.get("period")
    );
    const exported = await buildPartnerSalesExportCsv({
      userId: sessionUserId,
      period,
    });
    if (!exported) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404, headers: NO_STORE }
      );
    }

    return new NextResponse(exported.csv, {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Temporarily unavailable" },
      { status: 503, headers: NO_STORE }
    );
  }
}
