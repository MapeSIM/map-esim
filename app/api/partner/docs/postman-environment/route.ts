import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildPartnerPostmanEnvironment } from "@/app/lib/partner/partnerApiDocsContent";
import { rejectUnlessPartnerDomain } from "@/app/lib/domain/requirePartnerDomain";

export const dynamic = "force-dynamic";

export async function GET() {
  const domainBlock = await rejectUnlessPartnerDomain();
  if (domainBlock) return domainBlock;

  const session = await auth();
  if (!session?.user?.id || session.user.role !== "PARTNER") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const body = JSON.stringify(buildPartnerPostmanEnvironment(), null, 2);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="mapesim-partner.postman_environment.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
