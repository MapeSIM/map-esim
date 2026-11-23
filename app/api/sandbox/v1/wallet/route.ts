import { NextRequest } from "next/server";
import {
  authenticateSandboxRequest,
  sandboxError,
  sandboxWalletResponse,
  sandboxWalletTopUpResponse,
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

/** POST /api/sandbox/v1/wallet — confirm sandbox top-up ({ amountUsd }). */
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
