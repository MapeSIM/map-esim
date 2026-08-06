import "server-only";

import { VesimEnvironmentError } from "@/app/lib/vesim/environment";
import {
  extractOrderId,
  extractReturnedOfferId,
  getBrokerToken,
  getVesimBaseUrl,
  readJsonSafe,
} from "@/app/lib/vesim/server";

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
 */
export async function executeCreditCheckout(options: {
  offerId: string;
  customerEmail: string;
}): Promise<CreditCheckoutResult> {
  const offerId = options.offerId.trim();
  const customerEmail = options.customerEmail.trim();
  if (!offerId || !customerEmail) {
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
        customerEmail,
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
