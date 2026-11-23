import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { Role } from "@prisma/client";
import { apiActorHasAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import {
  executeAdminInstantOrderRefund,
  InstantOrderRefundError,
} from "@/app/lib/admin/instantOrderRefund";
import { prisma } from "@/app/lib/db";

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
} as const;

function json(
  body: Record<string, unknown>,
  status: number
): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * POST /api/admin/orders/[orderId]/refund
 * Instant admin refund (MAP Wallet / Partner wallet credit). Idempotent.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const session = await auth();
    const userId = session?.user?.id?.trim() ?? "";
    if (!userId) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const actor = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        deletedAt: true,
        adminDisabledAt: true,
      },
    });
    if (
      !actor ||
      actor.deletedAt ||
      actor.role !== Role.ADMIN ||
      actor.adminDisabledAt
    ) {
      return json({ success: false, error: "Forbidden" }, 403);
    }

    const allowed = await apiActorHasAdminPermission(actor.id, "REFUNDS_MANAGE");
    if (!allowed) {
      return json({ success: false, error: "Forbidden" }, 403);
    }

    const { orderId } = await context.params;
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    // Never trust client amounts / status.
    void body.amount;
    void body.amountCents;
    void body.refundAmount;
    void body.refundAmountCents;
    void body.status;

    const result = await executeAdminInstantOrderRefund({
      adminUserId: actor.id,
      orderId,
      reason: body.reason,
      partnerPurchaseId: body.partnerPurchaseId,
    });

    return json(
      {
        success: true,
        orderId: result.orderId,
        requestId: result.requestId,
        path: result.path,
        amountCents: result.amountCents,
        amountLabel: result.amountLabel,
        idempotent: result.idempotent,
        status: result.status,
      },
      200
    );
  } catch (error) {
    if (error instanceof InstantOrderRefundError) {
      const status =
        error.code === "ALREADY_REFUNDED"
          ? 409
          : error.code === "NOT_ELIGIBLE" ||
              error.code === "ORDER_UNAVAILABLE" ||
              error.code === "INVALID_REASON"
            ? 400
            : error.code === "EXECUTION_FAILED"
              ? 422
              : 503;
      return json(
        { success: false, error: error.message, code: error.code },
        status
      );
    }
    return json(
      {
        success: false,
        error: "Instant refund is temporarily unavailable.",
      },
      503
    );
  }
}
