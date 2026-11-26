import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  sandboxJson,
} from "@/app/lib/sandbox/sandboxApi";
import { buildSandboxCatalogPayload } from "@/app/lib/sandbox/sandboxPartnerApiParity";
import { getSandboxPartnerById } from "@/app/lib/sandbox/sandboxPartnerDb";
import { SANDBOX_DEFAULT_DISCOUNT_PERCENT } from "@/app/lib/sandbox/sandboxPricing";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/catalog — packages with partner pricing (offers alias). */
export async function GET(req: NextRequest) {
  const auth = await authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;
  const partner = auth.partnerId
    ? await getSandboxPartnerById(auth.partnerId)
    : null;
  return sandboxJson(
    buildSandboxCatalogPayload(
      partner?.discountPercent ?? SANDBOX_DEFAULT_DISCOUNT_PERCENT
    )
  );
}
