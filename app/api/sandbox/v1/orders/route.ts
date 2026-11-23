import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  persistSandboxOrderFromApi,
  sandboxError,
  sandboxJson,
  sandboxOrdersListResponse,
} from "@/app/lib/sandbox/sandboxApi";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/orders — Neon SandboxOrder list for this API key. */
export async function GET(req: NextRequest) {
  const auth = await authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;
  if (!auth.partnerId) {
    return sandboxError(401, "Unauthorized", "Sandbox partner required.");
  }
  return sandboxOrdersListResponse(auth.partnerId);
}

/** POST /api/sandbox/v1/orders — create + persist mock eSIM order in Neon. */
export async function POST(req: NextRequest) {
  const auth = await authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;
  if (!auth.partnerId) {
    return sandboxError(401, "Unauthorized", "Sandbox partner required.");
  }

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

  const result = await persistSandboxOrderFromApi({
    partnerId: auth.partnerId,
    offerId,
    quantity: Number.isFinite(quantity) ? quantity : 1,
    apiKey: auth.apiKey,
  });
  if (!result.ok) return result.response;

  return sandboxJson(
    { success: true, sandbox: true, order: result.order },
    201
  );
}
