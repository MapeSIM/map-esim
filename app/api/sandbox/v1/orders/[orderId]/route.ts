import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  sandboxError,
  sandboxJson,
} from "@/app/lib/sandbox/sandboxApi";
import { buildSandboxOrderDetailPayload } from "@/app/lib/sandbox/sandboxPartnerApiParity";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/orders/[orderId] — full order + ICCID / LPA / QR / share. */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  const auth = await authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;
  if (!auth.partnerId) {
    return sandboxError(401, "Unauthorized", "Sandbox partner required.");
  }
  const { orderId } = await context.params;
  const payload = await buildSandboxOrderDetailPayload(
    auth.partnerId,
    orderId
  );
  if (!payload) {
    return sandboxError(404, "Not found", "Order not found.");
  }
  return sandboxJson(payload);
}
