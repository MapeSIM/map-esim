import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  canSandboxPartnerUseApiUi,
  getGlobalSandboxApiEnabled,
} from "@/app/lib/sandbox/sandboxApiControls";
import {
  SANDBOX_SESSION_COOKIE,
  ensureSandboxPartnerHasApiKey,
  getSandboxPartnerById,
  verifySandboxSession,
} from "@/app/lib/sandbox/sandboxPartnerDb";

export const dynamic = "force-dynamic";

/** GET /api/sandbox/session — current Neon sandbox partner from httpOnly cookie. */
export async function GET() {
  const jar = await cookies();
  const token = jar.get(SANDBOX_SESSION_COOKIE)?.value;
  const partnerId = verifySandboxSession(token);
  if (!partnerId) {
    return NextResponse.json(
      { ok: false, globalSandboxApiEnabled: await getGlobalSandboxApiEnabled() },
      {
        status: 401,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Sandbox": "true",
        },
      }
    );
  }
  const partner = await getSandboxPartnerById(partnerId);
  if (!partner || partner.disabledAt) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Mint a key if the partner has none (raw returned once for optional client cache).
  const ensured = await ensureSandboxPartnerHasApiKey(partnerId);
  const resolvedPartner =
    ensured.ok && ensured.partner ? ensured.partner : partner;
  const rawApiKey =
    ensured.ok && ensured.rawApiKey ? ensured.rawApiKey : null;

  const apiUi = await canSandboxPartnerUseApiUi(partnerId);
  return NextResponse.json(
    {
      ok: true,
      partner: {
        id: resolvedPartner.id,
        name: resolvedPartner.name,
        email: resolvedPartner.email,
        balanceCents: resolvedPartner.balanceCents,
        apiKeyPrefix: resolvedPartner.apiKeyPrefix,
        apiEnabled: resolvedPartner.apiEnabled,
        discountPercent: resolvedPartner.discountPercent,
      },
      /** Present only when a new key was just minted — never for existing hashed keys. */
      apiKey: rawApiKey,
      globalSandboxApiEnabled: apiUi.globalSandboxApiEnabled,
      showApiUi: apiUi.showApiUi,
      discountPercent: resolvedPartner.discountPercent,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Sandbox": "true",
      },
    }
  );
}
