import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  sandboxJson,
} from "@/app/lib/sandbox/sandboxApi";
import { buildSandboxCatalogPayload } from "@/app/lib/sandbox/sandboxPartnerApiParity";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/catalog — packages with partner pricing (offers alias). */
export async function GET(req: NextRequest) {
  const auth = await authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;
  return sandboxJson(buildSandboxCatalogPayload());
}
