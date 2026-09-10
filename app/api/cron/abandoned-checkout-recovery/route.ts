/**
 * Secured HTTP trigger for abandoned checkout recovery emails.
 * Auth: Authorization Bearer CRON_SECRET (or x-cron-secret header).
 *
 * Not registered in vercel.json by default (Vercel Hobby = 1 cron/day;
 * lifecycle already owns that slot). Hit this endpoint from an approved
 * external scheduler or after a plan upgrade adds a second cron entry.
 */
import { NextResponse } from "next/server";
import { runAbandonedCheckoutRecovery } from "@/app/lib/esim/abandonedCheckoutRecoveryRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Small DB scan + fire-and-forget email schedules. */
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

  const result = await runAbandonedCheckoutRecovery({ dryRun });
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
