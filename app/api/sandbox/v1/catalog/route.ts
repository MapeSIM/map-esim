import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  SANDBOX_CATALOG,
  sandboxJson,
} from "@/app/lib/sandbox/sandboxApi";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/catalog — mock wholesale catalog. */
export async function GET(req: NextRequest) {
  const auth = authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;

  return sandboxJson({
    success: true,
    sandbox: true,
    items: SANDBOX_CATALOG,
    count: SANDBOX_CATALOG.length,
  });
}
