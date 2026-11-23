import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SANDBOX_SESSION_COOKIE } from "@/app/lib/sandbox/sandboxPartnerDb";

export const dynamic = "force-dynamic";

/** POST /api/sandbox/session/logout — clear sandbox partner cookie. */
export async function POST() {
  const jar = await cookies();
  jar.delete(SANDBOX_SESSION_COOKIE);
  return NextResponse.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Sandbox": "true",
      },
    }
  );
}
