/**
 * Secured HTTP trigger for customer + partner gateway stale reservation release.
 * Auth: Authorization Bearer CRON_SECRET (or x-cron-secret header).
 *
 * Also invoked best-effort from the daily lifecycle cron (Hobby = 1 cron/day)
 * so unpaid wallet holds are auto-released without a second Vercel cron slot.
 * Hit this endpoint from an external scheduler for more frequent runs.
 *
 * Never funds purchases and never calls VeSIM.
 */
import { NextResponse } from "next/server";
import { reportServerErrorAsync } from "@/app/lib/monitoring/serverErrorMonitoring";
import { runGatewayStaleReservationRecovery } from "@/app/lib/payments/gatewayStaleReservationRecovery";

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

  try {
    const result = await runGatewayStaleReservationRecovery({ dryRun });
    if (!result.ok) {
      await reportServerErrorAsync(
        new Error("gateway_stale_reservation_recovery_failed"),
        {
          operation: "cron_gateway_stale_reservation_release",
          cronJob: "gateway-stale-reservation-release",
          errorCode:
            result.customer.errorCode ??
            result.partner.errorCode ??
            result.fullWallet.errorCode ??
            result.partnerFullWallet.errorCode ??
            "recovery_failed",
        }
      );
    }
    const status = result.ok ? 200 : 500;
    return NextResponse.json(
      {
        ok: result.ok,
        customer: {
          ok: result.customer.ok,
          counts: result.customer.counts,
          idleMs: result.customer.idleMs,
          maxAgeMs: result.customer.maxAgeMs,
          errorCode: result.customer.errorCode ?? null,
        },
        partner: {
          ok: result.partner.ok,
          counts: result.partner.counts,
          idleMs: result.partner.idleMs,
          maxAgeMs: result.partner.maxAgeMs,
          errorCode: result.partner.errorCode ?? null,
        },
        fullWallet: {
          ok: result.fullWallet.ok,
          counts: result.fullWallet.counts,
          idleMs: result.fullWallet.idleMs,
          errorCode: result.fullWallet.errorCode ?? null,
        },
        partnerFullWallet: {
          ok: result.partnerFullWallet.ok,
          counts: result.partnerFullWallet.counts,
          idleMs: result.partnerFullWallet.idleMs,
          errorCode: result.partnerFullWallet.errorCode ?? null,
        },
        dryRun,
      },
      { status }
    );
  } catch (error) {
    await reportServerErrorAsync(error, {
      operation: "cron_gateway_stale_reservation_release",
      cronJob: "gateway-stale-reservation-release",
      errorCode: "unhandled",
    });
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
