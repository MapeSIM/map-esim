import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildPartnerApiMarkdownGuide } from "@/app/lib/partner/partnerApiDocsContent";
import { rejectUnlessPartnerDomain } from "@/app/lib/domain/requirePartnerDomain";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const domainBlock = await rejectUnlessPartnerDomain();
  if (domainBlock) return domainBlock;

  const session = await auth();
  if (!session?.user?.id || session.user.role !== "PARTNER") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "YOUR_HOST";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const body = buildPartnerApiMarkdownGuide(`${proto}://${host}`);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="PARTNER_API.md"',
      "Cache-Control": "private, no-store",
    },
  });
}
