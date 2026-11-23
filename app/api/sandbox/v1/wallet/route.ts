import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  sandboxError,
  sandboxWalletResponse,
} from "@/app/lib/sandbox/sandboxApi";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/wallet — Neon SandboxPartner balance. */
export async function GET(req: NextRequest) {
  const auth = await authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;
  if (!auth.partnerId) {
    return sandboxError(401, "Unauthorized", "Sandbox partner required.");
  }
  return sandboxWalletResponse(auth.partnerId);
}
