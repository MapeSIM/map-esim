/**
 * Next.js instrumentation — Node server error monitoring init + request errors.
 * Edge runtime is intentionally not instrumented (no client/edge Sentry SDK).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initServerErrorMonitoring } = await import(
    "@/app/lib/monitoring/serverErrorMonitoring"
  );
  initServerErrorMonitoring();
}

export async function onRequestError(
  error: unknown,
  _request: { path?: string; method?: string; headers?: unknown },
  context: {
    routerKind?: string;
    routePath?: string;
    routeType?: string;
  }
): Promise<void> {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  try {
    const { reportServerErrorAsync } = await import(
      "@/app/lib/monitoring/serverErrorMonitoring"
    );
    // Next.js requires awaiting async reporting work in onRequestError
    // so Vercel/serverless can flush before freeze.
    await reportServerErrorAsync(error, {
      operation: "next_request_error",
      routePath: context?.routePath ?? undefined,
      extras: {
        routerKind: context?.routerKind ?? undefined,
        routeType: context?.routeType ?? undefined,
      },
    });
  } catch {
    // never throw from instrumentation
  }
}
