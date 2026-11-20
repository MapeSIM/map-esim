import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildPartnerPostmanCollection } from "@/app/lib/partner/partnerApiDocsContent";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "PARTNER") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const body = JSON.stringify(buildPartnerPostmanCollection(), null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="mapesim-partner-api.postman_collection.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
