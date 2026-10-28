import { NextResponse } from "next/server";
import { prisma as db } from "@/app/lib/db";
import { requireActiveAdminForOperations } from "@/app/lib/admin/operationsHealth";

export async function POST(req: Request) {
  try {
    await requireActiveAdminForOperations();
    const body = await req.json();
    const { enabled } = body;

    if (typeof enabled !== "boolean") {
      return NextResponse.json({ success: false, error: "Invalid status value" }, { status: 400 });
    }

    const updated = await db.safepayConfig.upsert({
      where: { id: "default" },
      update: { enabled },
      create: { id: "default", enabled },
    });

    return NextResponse.json({ success: true, enabled: updated.enabled });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Unauthorized" }, { status: 500 });
  }
}