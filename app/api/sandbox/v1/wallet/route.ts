import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  sandboxError,
  sandboxWalletResponse,
  sandboxWalletTopUpResponse,
} from "@/app/lib/sandbox/sandboxApi";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/v1/wallet — balance + ledger (production-compatible fields). */
export async function GET(req: NextRequest) {
  const auth = await authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;
  if (!auth.partnerId) {
    return sandboxError(401, "Unauthorized", "Sandbox partner required.");
  }
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 20;
  if (limitRaw && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
    return sandboxError(
      400,
      "Validation error",
      "limit must be an integer between 1 and 50."
    );
  }
  return sandboxWalletResponse(auth.partnerId, limit);
}

/** POST /api/sandbox/v1/wallet — sandbox-only demo top-up ({ amountUsd }). */
export async function POST(req: NextRequest) {
  const auth = await authenticateSandboxRequest(req);
  if (!auth.ok) return auth.response;
  if (!auth.partnerId) {
    return sandboxError(401, "Unauthorized", "Sandbox partner required.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return sandboxError(400, "Invalid body", "Expected JSON { amountUsd }.");
  }
  const amountUsd =
    body &&
    typeof body === "object" &&
    "amountUsd" in body &&
    typeof (body as { amountUsd: unknown }).amountUsd === "number"
      ? (body as { amountUsd: number }).amountUsd
      : Number(
          body &&
            typeof body === "object" &&
            "amountUsd" in body
            ? (body as { amountUsd: unknown }).amountUsd
            : NaN
        );

  if (!Number.isFinite(amountUsd)) {
    return sandboxError(400, "Invalid amount", "amountUsd must be a number.");
  }

  return sandboxWalletTopUpResponse(auth.partnerId, amountUsd);
}
