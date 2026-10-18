/**
 * Secured HTTP trigger for abandoned checkout recovery emails.
 * Auth: Authorization Bearer CRON_SECRET (or x-cron-secret header).
 *
 * Recovery window (defaults): unpaid READY / AWAITING_GATEWAY_PAYMENT
 * purchases with createdAt between 30 and 90 minutes ago, and
 * abandonedCheckoutEmailNotificationStatus not yet sent/skipped/sending.
 *
 * Not registered in vercel.json by default (Vercel Hobby = 1 cron/day;
 * lifecycle already owns that slot). Call this endpoint every 15–30 minutes
 * from an external scheduler (cron-job.org, EasyCron, GitHub Actions, etc.):
 *
 *   GET https://mapesim.com/api/cron/abandoned-checkout-recovery
 *   Authorization: Bearer $CRON_SECRET
 *
 * Optional: ?dryRun=1 or header x-cron-dry-run: 1
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

  try {
    const result = await runAbandonedCheckoutRecovery({ dryRun });
    // Best-effort recovery emails: soft ok:false (DB blip, empty scan race,
    // runner_error) must NOT page Sentry. Surface errorCode in JSON + logs.
    if (!result.ok) {
      console.error("abandoned_checkout_recovery_failed", {
        errorCode: result.errorCode ?? "recovery_failed",
        counts: result.counts,
        idleMs: result.idleMs,
        maxAgeMs: result.maxAgeMs,
        dryRun,
      });
    }
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
  } catch (error) {
    // Isolate unhandled throws — never throw / report to Sentry from this cron.
    console.error("abandoned_checkout_recovery", "unhandled", error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
