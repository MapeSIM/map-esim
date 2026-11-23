import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  SANDBOX_DEFAULT_BALANCE_CENTS,
  sandboxJson,
} from "@/app/lib/sandbox/sandboxApi";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/wallet — mock prepaid balance (not Neon). */
export async function GET(req: NextRequest) {
  const auth = authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;

  return sandboxJson({
    success: true,
    sandbox: true,
    wallet: {
      balanceCents: SANDBOX_DEFAULT_BALANCE_CENTS,
      currency: "USD",
      balanceLabel: "$1,250.00",
      note: "Fixture balance for demos. Demo storefront may track a local copy in localStorage.",
    },
  });
}
