/**
 * Secured HTTP trigger for customer eSIM gateway stale/expired reservation release.
 * Auth: Authorization Bearer CRON_SECRET (or x-cron-secret header).
 *
 * Prefer the combined `/api/cron/gateway-stale-reservation-release` endpoint.
 * Not registered alone in vercel.json (Hobby = 1 cron/day).
 */
import { NextResponse } from "next/server";
import { runCustomerGatewayStaleReservationRecovery } from "@/app/lib/esim/esimPurchaseGatewayStaleRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function readConfiguredCronSecret(): string | null {
  const raw = (process.env.CRON_SECRET ?? "").trim();
  return raw.length >= 16 ? raw : null;
}

function extractProvidedSecret(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (bearer) return bearer;
  return (request.headers.get("x-cron-secret") ?? "").trim();
}

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function authorize(request: Request): boolean {
  const expected = readConfiguredCronSecret();
  if (!expected) return false;
  const provided = extractProvidedSecret(request);
  if (!provided) return false;
  return timingSafeEqualString(provided, expected);
}

async function handle(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dryRun =
    new URL(request.url).searchParams.get("dryRun") === "1" ||
    request.headers.get("x-cron-dry-run") === "1";

  const result = await runCustomerGatewayStaleReservationRecovery({ dryRun });
  const status = result.ok ? 200 : 500;
  return NextResponse.json(
    {
      ok: result.ok,
      counts: result.counts,
      idleMs: result.idleMs,
      maxAgeMs: result.maxAgeMs,
      errorCode: result.errorCode ?? null,
      dryRun,
    },
    { status }
  );
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
