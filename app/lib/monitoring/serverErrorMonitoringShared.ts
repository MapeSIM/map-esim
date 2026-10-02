/**
 * Pure helpers for server error monitoring (offline-QA safe, no I/O).
 */
export type ServerErrorContext = {
  operation: string;
  errorCode?: string | null;
  purchaseType?: "customer" | "partner" | string | null;
  purchaseId?: string | null;
  paymentAttemptId?: string | null;
  provider?: string | null;
  cronJob?: string | null;
  routePath?: string | null;
  /** Extra SAFE scalar identifiers only (never payloads/secrets). */
  extras?: Record<string, string | number | boolean | null | undefined>;
};

export type ParsedSentryDsn = {
  publicKey: string;
  host: string;
  projectId: string;
  /** Legacy Store API endpoint used by this minimal reporter. */
  storeUrl: string;
};

/** Expected, handled business outcomes — never page external monitoring. */
export const EXPECTED_BUSINESS_ERROR_CODES = [
  "INSUFFICIENT_FUNDS",
  "INVALID_STATE",
  "INVALID_REQUEST",
  "PRICING_CHANGED",
  "PARTNER_UNAVAILABLE",
] as const;

export const SENTRY_REPORT_TIMEOUT_MS = 2500;
export const SENTRY_MESSAGE_MAX = 500;
export const SENTRY_EXTRA_MAX = 120;

export const SENSITIVE_KEY =
  /^(authorization|cookie|set-cookie|password|passwd|secret|token|api[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|session|signature|x-simpaisa-signature|x-safepay-signature|webhook[_-]?secret|raw[_-]?body|webhook[_-]?body|request[_-]?body|response[_-]?body|payload|card|cvv|cvc|pan|msisdn|customerMsisdn|userKey|user_key|bearer)$/i;

export const SENSITIVE_SUBSTRING =
  /(password|secret|token|authorization|signature|cookie|webhook.?body|raw.?body|api.?key|bearer|msisdn|userKey)/i;

export function parseSentryDsn(dsn: string): ParsedSentryDsn | null {
  const raw = (dsn ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const publicKey = decodeURIComponent(url.username || "").trim();
    const projectId = url.pathname.replace(/^\//, "").split("/")[0]?.trim() ?? "";
    const host = url.host.trim();
    if (!publicKey || !projectId || !host) return null;
    if (!/^[A-Za-z0-9._-]+$/.test(publicKey)) return null;
    if (!/^\d+$/.test(projectId)) return null;
    const protocol = url.protocol === "http:" ? "http:" : "https:";
    return {
      publicKey,
      host,
      projectId,
      storeUrl: `${protocol}//${host}/api/${projectId}/store/`,
    };
  } catch {
    return null;
  }
}

export function normalizeSampleRate(raw: string | undefined): number {
  const n = Number((raw ?? "1").trim());
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

export function isMonitoringFlagEnabled(input: {
  sentryEnabled?: string | null;
  nodeEnv?: string | null;
}): boolean {
  const flag = String(input.sentryEnabled ?? "")
    .trim()
    .toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  return String(input.nodeEnv ?? "")
    .trim()
    .toLowerCase() === "production";
}

export function clipMonitoringText(
  value: unknown,
  max = SENTRY_MESSAGE_MAX
): string | undefined {
  if (value == null) return undefined;
  let text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (SENSITIVE_SUBSTRING.test(text) && /[=:]/.test(text)) {
    return "[redacted]";
  }
  // Scrub common secret-bearing fragments even without key= form.
  text = text.replace(
    /(authorization|bearer|api[_-]?key|webhook[_-]?secret|password)\s*[:=]\s*\S+/gi,
    "$1=[redacted]"
  );
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function sanitizeMonitoringContextValue(
  key: string,
  value: unknown
): string | number | boolean | undefined {
  if (SENSITIVE_KEY.test(key) || SENSITIVE_SUBSTRING.test(key)) {
    return undefined;
  }
  if (value == null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return clipMonitoringText(value, SENTRY_EXTRA_MAX);
}

export function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if (!("code" in error)) return undefined;
  const code = String((error as { code?: unknown }).code ?? "").trim();
  return code ? code.slice(0, 64) : undefined;
}

export function isExpectedBusinessMonitoringError(
  error: unknown,
  context?: Pick<ServerErrorContext, "errorCode">
): boolean {
  const fromContext = String(context?.errorCode ?? "")
    .trim()
    .toUpperCase();
  const fromError = String(extractErrorCode(error) ?? "")
    .trim()
    .toUpperCase();
  const code = fromContext || fromError;
  if (!code) return false;
  return (EXPECTED_BUSINESS_ERROR_CODES as readonly string[]).includes(code);
}

export function sanitizeMonitoringTags(
  context: ServerErrorContext
): Record<string, string> {
  const tags: Record<string, string> = {
    operation: clipMonitoringText(context.operation, 64) ?? "unknown",
  };
  const pairs: Array<[string, unknown]> = [
    ["error_code", context.errorCode],
    ["purchase_type", context.purchaseType],
    ["provider", context.provider],
    ["cron_job", context.cronJob],
  ];
  for (const [key, value] of pairs) {
    const sanitized = sanitizeMonitoringContextValue(key, value);
    if (sanitized != null) tags[key] = String(sanitized);
  }
  return tags;
}

export function sanitizeMonitoringExtras(
  context: ServerErrorContext
): Record<string, string | number | boolean> {
  const extras: Record<string, string | number | boolean> = {};
  const base: Record<string, unknown> = {
    purchaseId: context.purchaseId,
    paymentAttemptId: context.paymentAttemptId,
    routePath: context.routePath,
    ...(context.extras ?? {}),
  };
  for (const [key, value] of Object.entries(base)) {
    const sanitized = sanitizeMonitoringContextValue(key, value);
    if (sanitized !== undefined) extras[key] = sanitized;
  }
  return extras;
}

export function buildSentryAuthHeader(publicKey: string): string {
  return [
    "Sentry sentry_version=7",
    "sentry_client=map-esim-server/1.0",
    `sentry_key=${publicKey}`,
  ].join(", ");
}

export function buildSentryStoreEvent(input: {
  eventId: string;
  error: { name: string; message: string; stack?: string };
  context: ServerErrorContext;
  environment: string;
  release: string | null;
  nowMs?: number;
}): Record<string, unknown> {
  const frames = framesFromStack(input.error.stack);
  return {
    event_id: input.eventId,
    timestamp: (input.nowMs ?? Date.now()) / 1000,
    platform: "node",
    level: "error",
    environment: input.environment,
    release: input.release ?? undefined,
    transaction: clipMonitoringText(input.context.operation, 100),
    tags: sanitizeMonitoringTags(input.context),
    extra: sanitizeMonitoringExtras(input.context),
    exception: {
      values: [
        {
          type: input.error.name,
          value: input.error.message,
          stacktrace: { frames },
        },
      ],
    },
  };
}

function framesFromStack(stack: string | undefined): Array<{
  filename?: string;
  function?: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
}> {
  if (!stack) return [];
  const frames: Array<{
    filename?: string;
    function?: string;
    lineno?: number;
    colno?: number;
    in_app?: boolean;
  }> = [];
  for (const line of stack.split("\n").slice(1, 30)) {
    const match =
      /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/.exec(line.trim()) ??
      /^\s*at\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    if (match.length >= 5) {
      const filename = match[2];
      frames.unshift({
        function: match[1] || undefined,
        filename,
        lineno: Number(match[3]),
        colno: Number(match[4]),
        in_app: Boolean(filename && !filename.includes("node_modules")),
      });
    }
  }
  return frames;
}

export type SentryFetch = (
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    cache?: RequestCache;
  }
) => Promise<{ ok: boolean; status: number }>;

/**
 * Single-attempt Store API POST with bounded timeout.
 * NEVER throws. No retries.
 */
export async function postSentryStoreEvent(input: {
  storeUrl: string;
  publicKey: string;
  eventBody: Record<string, unknown>;
  fetchImpl?: SentryFetch;
  timeoutMs?: number;
}): Promise<"sent" | "failed"> {
  const timeoutMs = input.timeoutMs ?? SENTRY_REPORT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {
      // ignore
    }
  }, timeoutMs);
  const fetchImpl = input.fetchImpl ?? (fetch as unknown as SentryFetch);
  try {
    const response = await fetchImpl(input.storeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": buildSentryAuthHeader(input.publicKey),
      },
      body: JSON.stringify(input.eventBody),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return "failed";
    return "sent";
  } catch {
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}
