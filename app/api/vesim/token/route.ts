import { NextResponse } from "next/server";

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
    { status: 404 }
  );
}

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Not found",
    },
    { status: 404 }
  );
}
