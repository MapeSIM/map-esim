import "server-only";

import { VesimEnvironmentError } from "@/app/lib/vesim/environment";
import {
  extractOrderId,
  extractReturnedOfferId,
  getBrokerToken,
  getVesimBaseUrl,
  readJsonSafe,
} from "@/app/lib/vesim/server";

/**
 * Fixed VeSIM provider inbox. VeSIM emails this address only.
 * MAP eSIM branded order email must still use the real customer address.
 */
export const VESIM_PROVIDER_CUSTOMER_EMAIL = "orders@mapesim.com";

export type CreditCheckoutResult =
  | {
      kind: "success";
      providerOrderId: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "declined";
      httpStatus: number;
      payload: Record<string, unknown>;
    }
  | {
      kind: "uncertain";
      category: string;
      code: string;
      /** Present when the provider response included an order id (persist before recon). */
      providerOrderId?: string;
      payload?: Record<string, unknown>;
    };

/**
 * Single VeSIM credit checkout call.
 * Not wrapped in a Prisma transaction. No invented idempotency header.
 * Always sends {@link VESIM_PROVIDER_CUSTOMER_EMAIL} to VeSIM.
 */
export async function executeCreditCheckout(options: {
  offerId: string;
  /**
   * Ignored for the VeSIM provider payload (kept for call-site compatibility).
   * Callers must pass the real customer email to MAP branded delivery separately.
   */
  customerEmail?: string;
}): Promise<CreditCheckoutResult> {
  const offerId = options.offerId.trim();
  // Intentionally unused — never forward the end-customer address to VeSIM.
  void options.customerEmail;
  if (!offerId) {
    return {
      kind: "uncertain",
      category: "invalid_request",
      code: "missing_checkout_inputs",
    };
  }

  let response: Response;
  let payload: Record<string, unknown> = {};
  try {
    const token = await getBrokerToken();
    const baseUrl = getVesimBaseUrl();
    response = await fetch(`${baseUrl}/api/checkout/credit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `${token.tokenType} ${token.accessToken}`,
      },
      body: JSON.stringify({
        offerId,
        customerEmail: VESIM_PROVIDER_CUSTOMER_EMAIL,
        platform: "api",
      }),
      cache: "no-store",
    });
    payload = await readJsonSafe(response);
  } catch (error) {
    if (error instanceof VesimEnvironmentError) {
      return {
        kind: "uncertain",
        category: "provider_unavailable",
        code: "vesim_env_invalid",
      };
    }
    return {
      kind: "uncertain",
      category: "provider_timeout",
      code: "checkout_transport_error",
    };
  }

  const providerOrderId = extractOrderId(payload);
  if (!response.ok && !providerOrderId) {
    const status = response.status;
    if (status >= 500 || status === 408 || status === 429) {
      return {
        kind: "uncertain",
        category: "provider_uncertain",
        code: `http_${status}`,
        payload,
      };
    }
    return {
      kind: "declined",
      httpStatus: status,
      payload,
    };
  }

  if (!providerOrderId) {
    return {
      kind: "uncertain",
      category: "provider_uncertain",
      code: "missing_provider_order_id",
      payload,
    };
  }

  const returnedOfferId = extractReturnedOfferId(payload);
  if (
    returnedOfferId &&
    returnedOfferId.trim().toUpperCase() !== offerId.trim().toUpperCase()
  ) {
    return {
      kind: "uncertain",
      category: "provider_uncertain",
      code: "offer_mismatch",
      providerOrderId,
      payload,
    };
  }

  return {
    kind: "success",
    providerOrderId,
    payload,
  };
}
