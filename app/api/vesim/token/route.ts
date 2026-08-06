import { NextResponse } from "next/server";
import { PRIVATE_API_RESPONSE_HEADERS } from "@/app/lib/security/headers";

/**
 * Broker tokens must never be exposed to the browser.
 * Server routes obtain tokens via app/lib/vesim/server.ts instead.
 */
export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: "Not found",
    },
    { status: 404, headers: PRIVATE_API_RESPONSE_HEADERS }
  );
}

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Not found",
    },
    { status: 404, headers: PRIVATE_API_RESPONSE_HEADERS }
  );
}
