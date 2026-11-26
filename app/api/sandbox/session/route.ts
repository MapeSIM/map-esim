import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  canSandboxPartnerUseApiUi,
  getGlobalSandboxApiEnabled,
} from "@/app/lib/sandbox/sandboxApiControls";
import {
  SANDBOX_SESSION_COOKIE,
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
  const apiUi = await canSandboxPartnerUseApiUi(partnerId);
  return NextResponse.json(
    {
      ok: true,
      partner: {
        id: partner.id,
        name: partner.name,
        email: partner.email,
        balanceCents: partner.balanceCents,
        apiKeyPrefix: partner.apiKeyPrefix,
        apiEnabled: partner.apiEnabled,
      },
      globalSandboxApiEnabled: apiUi.globalSandboxApiEnabled,
      showApiUi: apiUi.showApiUi,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Sandbox": "true",
      },
    }
  );
}
