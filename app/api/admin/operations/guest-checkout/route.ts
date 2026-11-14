import { NextResponse } from "next/server";
import { prisma as db } from "@/app/lib/db";
import { requireActiveAdminForOperations } from "@/app/lib/admin/operationsHealth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Admin toggle for public guest checkout (GuestCheckoutConfig.enabled).
 * Does not affect signed-in account or partner purchase paths.
 */
export async function POST(req: Request) {
  try {
    const { admin } = await requireActiveAdminForOperations();
    const body = await req.json();
    const { enabled } = body;

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Invalid status value" },
        { status: 400 }
      );
    }

    const updated = await db.guestCheckoutConfig.upsert({
      where: { id: "default" },
      update: {
        enabled,
        updatedByAdminId: admin.id,
        version: { increment: 1 },
      },
      create: {
        id: "default",
        enabled,
        updatedByAdminId: admin.id,
      },
      select: { enabled: true, updatedAt: true },
    });

    return NextResponse.json({
      success: true,
      enabled: updated.enabled,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
