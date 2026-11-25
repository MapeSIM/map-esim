import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  sandboxError,
  sandboxJson,
} from "@/app/lib/sandbox/sandboxApi";
import { buildSandboxEsimUsageByIccidPayload } from "@/app/lib/sandbox/sandboxPartnerApiParity";

export const dynamic = "force-dynamic";

/**
 * GET /api/sandbox/v1/esims/[iccid]/usage
 * Production-path parity for usage checks by ICCID.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ iccid: string }> }
) {
  const auth = await authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;
  if (!auth.partnerId) {
    return sandboxError(401, "Unauthorized", "Sandbox partner required.");
  }
  const { iccid } = await context.params;
  const payload = await buildSandboxEsimUsageByIccidPayload(
    auth.partnerId,
    iccid
  );
  if (!payload) {
    return sandboxError(404, "Not found", "eSIM not found for this partner.");
  }
  return sandboxJson({
    success: true,
    sandbox: true,
    environment: "sandbox",
    orderId: payload.orderId,
    iccid: payload.iccid,
    usage: payload.usage,
  });
}
