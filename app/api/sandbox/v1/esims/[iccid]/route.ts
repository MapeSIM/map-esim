import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  buildSandboxEsim,
  sandboxError,
  sandboxJson,
} from "@/app/lib/sandbox/sandboxApi";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/esims/[iccid] — mock eSIM + usage + activation. */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ iccid: string }> }
) {
  const auth = authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;

  const { iccid } = await context.params;
  const esim = buildSandboxEsim(decodeURIComponent(iccid || ""));
  if (!esim) {
    return sandboxError(404, "Not found", "Sandbox eSIM not found.");
  }

  return sandboxJson({ success: true, sandbox: true, esim });
}
