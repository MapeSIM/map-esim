/**
 * Evidence-safe VeSIM provider order GET lookup.
 * Never calls checkout. Never returns or logs raw provider payloads.
 */
import "server-only";

import { VesimEnvironmentError } from "@/app/lib/vesim/environment";
import {
  getBrokerToken,
  getVesimBaseUrl,
  readJsonSafe,
} from "@/app/lib/vesim/server";
import {
  classifyProviderOrderResponse,
  lookupKindToProviderResultKind,
  type ProviderOrderLookupKind,
  type SanitizedProviderOrderStatus,
} from "@/app/lib/vesim/providerOrderStatusCore";

export {
  classifyProviderOrderResponse,
  lookupKindToProviderResultKind,
} from "@/app/lib/vesim/providerOrderStatusCore";

export type {
  ProviderOrderLookupKind,
  SanitizedProviderOrderStatus,
  TriState,
} from "@/app/lib/vesim/providerOrderStatusCore";

export const PROVIDER_LOOKUP_TIMEOUT_MS = 12_000;

export type ProviderOrderLookupOptions = {
  providerOrderId: string;
  expectedOfferId?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

function normalizeProviderOrderId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id || id.length > 128) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) return null;
  return id;
}

/**
 * GET /api/broker/orders/{providerOrderId} — evidence-safe status only.
 * Does not retry. Does not call checkout. Does not persist.
 */
export async function lookupProviderOrderStatus(
  options: ProviderOrderLookupOptions
): Promise<SanitizedProviderOrderStatus> {
  const now = options.now ?? (() => new Date());
  const observedAt = now();
  const providerOrderId = normalizeProviderOrderId(options.providerOrderId);
  if (!providerOrderId) {
    return {
      kind: "UNKNOWN",
      observedAt,
      safeStatusCode: "invalid_provider_order_id",
      orderExists: "unknown",
      safeProviderState: null,
      offerMatch: "unknown",
      installDataPresent: "unknown",
    };
  }

  try {
    getVesimBaseUrl();
  } catch (error) {
    if (error instanceof VesimEnvironmentError) {
      return {
        kind: "ENVIRONMENT_BLOCKED",
        observedAt,
        safeStatusCode: "env_blocked",
        orderExists: "unknown",
        safeProviderState: null,
        offerMatch: "unknown",
        installDataPresent: "unknown",
      };
    }
    return {
      kind: "ENVIRONMENT_BLOCKED",
      observedAt,
      safeStatusCode: "env_blocked",
      orderExists: "unknown",
      safeProviderState: null,
      offerMatch: "unknown",
      installDataPresent: "unknown",
    };
  }

  const baseUrl = getVesimBaseUrl();
  const timeoutMs = options.timeoutMs ?? PROVIDER_LOOKUP_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let token: { tokenType: string; accessToken: string };
    try {
      token = await getBrokerToken();
    } catch (error) {
      if (error instanceof VesimEnvironmentError) {
        return {
          kind: "ENVIRONMENT_BLOCKED",
          observedAt,
          safeStatusCode: "env_blocked",
          orderExists: "unknown",
          safeProviderState: null,
          offerMatch: "unknown",
          installDataPresent: "unknown",
        };
      }
      return {
        kind: "AUTH_FAILURE",
        observedAt,
        safeStatusCode: "token_unavailable",
        orderExists: "unknown",
        safeProviderState: null,
        offerMatch: "unknown",
        installDataPresent: "unknown",
      };
    }

    const response = await fetchImpl(
      `${baseUrl}/api/broker/orders/${encodeURIComponent(providerOrderId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `${token.tokenType} ${token.accessToken}`,
        },
        cache: "no-store",
        signal: controller.signal,
      }
    );

    const payload = await readJsonSafe(response);
    // Never log payload.
    return classifyProviderOrderResponse({
      httpStatus: response.status,
      payload,
      requestedProviderOrderId: providerOrderId,
      expectedOfferId: options.expectedOfferId,
      observedAt,
    });
  } catch (error) {
    const aborted =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name: string }).name === "AbortError");
    if (aborted) {
      return {
        kind: "TIMEOUT",
        observedAt,
        safeStatusCode: "timeout",
        orderExists: "unknown",
        safeProviderState: null,
        offerMatch: "unknown",
        installDataPresent: "unknown",
      };
    }
    if (error instanceof VesimEnvironmentError) {
      return {
        kind: "ENVIRONMENT_BLOCKED",
        observedAt,
        safeStatusCode: "env_blocked",
        orderExists: "unknown",
        safeProviderState: null,
        offerMatch: "unknown",
        installDataPresent: "unknown",
      };
    }
    return {
      kind: "UNKNOWN",
      observedAt,
      safeStatusCode: "transport_error",
      orderExists: "unknown",
      safeProviderState: null,
      offerMatch: "unknown",
      installDataPresent: "unknown",
    };
  } finally {
    clearTimeout(timer);
  }
}
