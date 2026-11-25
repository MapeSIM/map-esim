import { NextRequest } from "next/server";
import {
  authenticatePartnerApiRequest,
  partnerApiAuthError,
  partnerApiError,
  partnerApiJson,
} from "@/app/lib/partnerApiAuth";
import { creditPartnerApiCheckout } from "@/app/lib/partnerApi/partnerApiCheckout";
import { listPartnerApiOrders } from "@/app/lib/partnerApi/partnerApiOrders";
import { PARTNER_SITE_ORIGIN } from "@/app/lib/domain/appDomain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/v1/orders — alias of GET /api/v1/partner/orders */
export async function GET(req: NextRequest) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  const sp = req.nextUrl.searchParams;
  const page = Number(sp.get("page") ?? "1");
  const limit = Number(sp.get("limit") ?? "25");

  if (!Number.isInteger(page) || page < 1) {
    return partnerApiError(400, "Validation error", "page must be a positive integer.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return partnerApiError(
      400,
      "Validation error",
      "limit must be an integer between 1 and 100."
    );
  }

  try {
    const result = await listPartnerApiOrders({
      actor: auth.actor,
      page,
      limit,
    });
    const orders = result.orders.map((o) => ({
      ...o,
      qrCodeUrl: o.qrUrl,
      shareUrl: `${PARTNER_SITE_ORIGIN}/partner/orders/${encodeURIComponent(o.orderId)}`,
    }));
    return partnerApiJson({
      success: true,
      environment: "production",
      ...result,
      orders,
    });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Orders are temporarily unavailable."
    );
  }
}

/**
 * POST /api/v1/orders — alias of POST /api/v1/partner/checkout/credit
 * Uses 402 for insufficient wallet balance (sandbox/production parity).
 */
export async function POST(req: NextRequest) {
  const auth = await authenticatePartnerApiRequest(req);
  if (!auth.ok) return partnerApiAuthError(auth);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return partnerApiError(400, "Validation error", "Invalid JSON body.");
  }

  void body.amount;
  void body.amountCents;
  void body.price;
  void body.total;
  void body.discount;

  const headerKey =
    req.headers.get("idempotency-key") ??
    req.headers.get("Idempotency-Key");
  const idempotencyKey = headerKey || body.idempotencyKey;

  try {
    const result = await creditPartnerApiCheckout({
      actor: auth.actor,
      offerId: body.offerId,
      quantity: body.quantity,
      idempotencyKey,
      countryHint: body.countryHint ?? body.country,
    });
    if (!result.ok) {
      if (result.code === "INSUFFICIENT_FUNDS") {
        return partnerApiError(402, "Insufficient funds", result.error);
      }
      const status =
        result.code === "NOT_FOUND"
          ? 404
          : result.code === "INVALID" ||
              result.code === "IDEMPOTENCY_REQUIRED"
            ? 400
            : 503;
      return partnerApiError(status, result.error);
    }
    return partnerApiJson({
      success: true,
      environment: "production",
      order: {
        orderId: result.orderId,
        purchaseId: result.purchaseId,
        offerId: result.offerId,
        amountCents: result.amountCents,
        amountLabel: result.amountLabel,
        remainingBalanceCents: result.remainingBalanceCents,
        remainingBalanceLabel: result.remainingBalanceLabel,
        iccid: result.iccid,
        lpa: result.lpa,
        qrUrl: result.qrUrl,
        qrCodeUrl: result.qrUrl,
        shareUrl: `${PARTNER_SITE_ORIGIN}/partner/orders/${encodeURIComponent(result.orderId)}`,
        status: "COMPLETED",
        duplicate: result.duplicate,
      },
    });
  } catch {
    return partnerApiError(
      503,
      "Unavailable",
      "Checkout is temporarily unavailable."
    );
  }
}
