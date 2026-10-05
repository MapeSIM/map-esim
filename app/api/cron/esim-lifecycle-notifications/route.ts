/**
 * Vercel Cron / secured HTTP trigger for customer eSIM lifecycle emails.
 * Auth: Authorization Bearer CRON_SECRET (or x-cron-secret header).
 * Never invents expiry — runner polls VeSIM usage only.
 *
 * Schedule: daily UTC via vercel.json (`0 6 * * *`) for Vercel Hobby
 * (max 1 cron run/day). Runner stays reusable for hourly later via plan
 * upgrade or an approved external scheduler hitting this same endpoint.
 *
 * Ops: `?force=1` or `?unlock=1` clears a stuck EsimLifecycleNotificationRunnerLock
 * and returns immediately (does not run the usage batch). Still requires valid CRON_SECRET.
 *
 * Speed: response returns as soon as the lifecycle batch finishes. Optional
 * `?staleRelease=1` piggybacks unpaid gateway hold release (can exceed ~30s).
 */
import { NextResponse } from "next/server";
import {
  forceClearEsimLifecycleRunnerLock,
  runEsimLifecycleNotifications,
} from "@/app/lib/esim/esimLifecycleNotificationRunner";
import { reportServerErrorAsync } from "@/app/lib/monitoring/serverErrorMonitoring";
import { runGatewayStaleReservationRecovery } from "@/app/lib/payments/gatewayStaleReservationRecovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Lifecycle batch is small + parallel; keep headroom for optional staleRelease. */
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

  const url = new URL(request.url);
  const dryRun =
    url.searchParams.get("dryRun") === "1" ||
    request.headers.get("x-cron-dry-run") === "1";
  const forceUnlock =
    url.searchParams.get("force") === "1" ||
    url.searchParams.get("unlock") === "1" ||
    request.headers.get("x-cron-force-unlock") === "1";
  const runStaleRelease =
    url.searchParams.get("staleRelease") === "1" ||
    request.headers.get("x-cron-stale-release") === "1";

  if (forceUnlock) {
    try {
      await forceClearEsimLifecycleRunnerLock();
      // Unlock-only: return immediately so external cron does not time out.
      return NextResponse.json(
        {
          ok: true,
          lockForceCleared: true,
          runnerClaimed: false,
          counts: null,
          errorCode: null,
          dryRun,
          mode: "force_unlock",
        },
        { status: 200 }
      );
    } catch (error) {
      await reportServerErrorAsync(error, {
        operation: "cron_esim_lifecycle_force_unlock",
        cronJob: "esim-lifecycle-notifications",
        errorCode: "force_unlock_failed",
      });
      return NextResponse.json(
        {
          ok: false,
          error: "force_unlock_failed",
          lockForceCleared: false,
          dryRun,
          mode: "force_unlock",
        },
        { status: 500 }
      );
    }
  }

  try {
    const result = await runEsimLifecycleNotifications({ dryRun });
    if (!result.ok && result.errorCode !== "runner_busy") {
      await reportServerErrorAsync(
        new Error("esim_lifecycle_notifications_failed"),
        {
          operation: "cron_esim_lifecycle_notifications",
          cronJob: "esim-lifecycle-notifications",
          errorCode: result.errorCode ?? "lifecycle_failed",
        }
      );
    }

    // Default: return immediately after the lifecycle batch so external
    // schedulers with ~30s timeouts do not fail. Opt-in piggyback only.
    let staleRelease: Awaited<
      ReturnType<typeof runGatewayStaleReservationRecovery>
    > | null = null;
    if (runStaleRelease) {
      try {
        staleRelease = await runGatewayStaleReservationRecovery({ dryRun });
        if (staleRelease && !staleRelease.ok) {
          await reportServerErrorAsync(
            new Error("piggyback_stale_release_failed"),
            {
              operation: "cron_esim_lifecycle_stale_release",
              cronJob: "esim-lifecycle-notifications",
              errorCode:
                staleRelease.customer.errorCode ??
                staleRelease.partner.errorCode ??
                "stale_release_failed",
            }
          );
        }
      } catch (error) {
        await reportServerErrorAsync(error, {
          operation: "cron_esim_lifecycle_stale_release",
          cronJob: "esim-lifecycle-notifications",
          errorCode: "stale_release_unhandled",
        });
        staleRelease = null;
      }
    }

    const status = result.ok ? 200 : result.errorCode === "runner_busy" ? 409 : 500;
    return NextResponse.json(
      {
        ok: result.ok,
        runnerClaimed: result.runnerClaimed,
        counts: result.counts,
        errorCode: result.errorCode ?? null,
        lockForceCleared: false,
        staleRelease: runStaleRelease
          ? staleRelease
            ? {
                ok: staleRelease.ok,
                customer: staleRelease.customer.counts,
                partner: staleRelease.partner.counts,
              }
            : { ok: false, errorCode: "stale_release_failed" }
          : { ok: true, skipped: true },
        dryRun,
      },
      { status }
    );
  } catch (error) {
    await reportServerErrorAsync(error, {
      operation: "cron_esim_lifecycle_notifications",
      cronJob: "esim-lifecycle-notifications",
      errorCode: "unhandled",
    });
    return NextResponse.json(
      { ok: false, error: "internal", lockForceCleared: false },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
