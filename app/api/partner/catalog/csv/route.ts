import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";
import { listPartnerApiOffers } from "@/app/lib/partnerApi/partnerApiCatalog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Partner session download: all partner-priced SKUs as CSV. */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id?.trim() || "";
  if (!userId || session?.user?.role !== "PARTNER") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  const actor = await requireActivePartnerActor(userId);
  if (!actor) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  try {
    const profile = await prisma.partnerProfile.findUnique({
      where: { id: actor.partnerId },
      select: { discountBps: true },
    });
    const discountBps = profile?.discountBps ?? 0;

    const offers = [];
    let page = 1;
    let totalPages = 1;
    do {
      const batch = await listPartnerApiOffers({
        discountBps,
        page,
        limit: 500,
        fullCatalog: true,
        snapshotOnly: true,
      });
      offers.push(...batch.offers);
      totalPages = batch.totalPages;
      page += 1;
    } while (page <= totalPages && page <= 20);

    const header = [
      "offerId",
      "name",
      "destinationCode",
      "destinationLabel",
      "kind",
      "region",
      "dataLabel",
      "validityLabel",
      "partnerPriceUsd",
      "partnerPriceCents",
      "retailPriceUsd",
      "currency",
    ];
    const lines = [header.join(",")];
    for (const row of offers) {
      lines.push(
        [
          row.offerId,
          row.name,
          row.destinationCode,
          row.destinationLabel,
          row.kind ?? "",
          row.region ?? "",
          row.dataLabel,
          row.validityLabel,
          String(row.partnerPriceUsd),
          String(row.partnerPriceCents),
          row.retailPriceUsd != null ? String(row.retailPriceUsd) : "",
          row.currency,
        ]
          .map((v) => csvEscape(String(v)))
          .join(",")
      );
    }

    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="mapesim-partner-catalog.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Catalog export unavailable" },
      { status: 503 }
    );
  }
}
