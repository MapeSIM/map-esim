import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  sandboxError,
  sandboxJson,
} from "@/app/lib/sandbox/sandboxApi";
import { buildSandboxMePayload } from "@/app/lib/sandbox/sandboxPartnerApiParity";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/me — verify key, partner profile, sandbox env, wallet. */
export async function GET(req: NextRequest) {
  const auth = await authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;
  if (!auth.partnerId) {
    return sandboxError(401, "Unauthorized", "Sandbox partner required.");
  }
  const payload = await buildSandboxMePayload(auth.partnerId);
  if (!payload) {
    return sandboxError(404, "Not found", "Sandbox partner not found.");
  }
  return sandboxJson(payload);
}
