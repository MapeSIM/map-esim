import { NextResponse } from "next/server";
import { exchangePartnerInviteToken } from "@/app/lib/partner/partnerInvite";

export const dynamic = "force-dynamic";

/**
 * Partner invite URL entrypoint: exchange opaque invite token for setup cookie.
 * Cookie mutation must happen here (Route Handler), not in the setup page RSC.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token")?.trim() || "";
  const cleanSetup = new URL("/partner/setup-password", url.origin);

  if (!rawToken) {
    return NextResponse.redirect(cleanSetup);
  }

  await exchangePartnerInviteToken(rawToken);
  // Always land on the clean setup page (no token in browser URL).
  // Invalid/expired exchange leaves no setup cookie → page shows generic error.
  return NextResponse.redirect(cleanSetup);
}
