import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  sandboxEsimResponse,
  sandboxError,
} from "@/app/lib/sandbox/sandboxApi";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/esims/[iccid] — sandbox eSIM + usage + activation. */
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
  return sandboxEsimResponse(auth.partnerId, decodeURIComponent(iccid || ""));
}
