import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  buildSandboxOrder,
  sandboxError,
  sandboxJson,
} from "@/app/lib/sandbox/sandboxApi";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/orders — canned recent mock orders. */
export async function GET(req: NextRequest) {
  const auth = authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;

  return sandboxJson({
    success: true,
    sandbox: true,
    orders: [
      {
        orderId: "sandbox_ord_demo_001",
        status: "COMPLETED",
        offerId: "sandbox_eu_1gb_7d",
        region: "Europe",
        planName: "1 GB · 7 days",
        totalCents: 450,
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
      {
        orderId: "sandbox_ord_demo_002",
        status: "COMPLETED",
        offerId: "sandbox_asia_10gb_30d",
        region: "Asia",
        planName: "10 GB · 30 days",
        totalCents: 1800,
        createdAt: new Date(Date.now() - 3600_000).toISOString(),
      },
    ],
    note: "List is fixture data. POST creates a fresh mock order (not persisted).",
  });
}

/** POST /api/sandbox/v1/orders — create a mock eSIM order + QR payload. */
export async function POST(req: NextRequest) {
  const auth = authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return sandboxError(400, "Validation error", "Invalid JSON body.");
  }

  const offerId = String(body.offerId ?? "").trim();
  if (!offerId) {
    return sandboxError(400, "Validation error", "offerId is required.");
  }

  const quantityRaw = body.quantity;
  const quantity =
    quantityRaw === undefined || quantityRaw === null
      ? 1
      : Number(quantityRaw);

  const built = buildSandboxOrder({
    offerId,
    quantity,
    apiKey: auth.apiKey,
  });
  if (!built.ok) return built.response;

  return sandboxJson({ success: true, sandbox: true, order: built.order }, 201);
}
