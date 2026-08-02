import {
  buildOrderEmailPayload,
  extractInstallDetails,
  hasInstallDetails,
} from "@/app/lib/email/extract";
import {
  getEmailDeliveryRecord,
  markEmailDelivery,
  wasEmailAlreadySent,
} from "@/app/lib/email/deliveryStore";
import { getEmailConfig } from "@/app/lib/email/config";
import { sendOrderEmail } from "@/app/lib/email/sendOrderEmail";
import type { EmailDeliveryStatus } from "@/app/lib/email/types";
import {
  getBrokerToken,
  getVesimBaseUrl,
  isValidEmail,
  readJsonSafe,
  type VerifiedCheckoutOffer,
} from "@/app/lib/vesim/server";

type JsonRecord = Record<string, unknown>;

async function fetchBrokerOrder(orderId: string): Promise<JsonRecord | null> {
  try {
    const token = await getBrokerToken();
    const baseUrl = getVesimBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/broker/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `${token.tokenType} ${token.accessToken}`,
        },
        cache: "no-store",
      }
    );

    const data = await readJsonSafe(response);
    if (!response.ok) {
      console.error("Order fetch for email failed:", response.status);
      return null;
    }
    return data;
  } catch (error: unknown) {
    console.error(
      "Order fetch for email error:",
      error instanceof Error ? error.message : "unknown_error"
    );
    return null;
  }
}

/**
 * Post-checkout email delivery. Never throws; never fails the VeSIM order.
 * Only sends after: verified offer, successful order ID, and install details.
 */
export async function deliverOrderEmailAfterCheckout(options: {
  orderId: string;
  customerEmail: string;
  verifiedOffer: VerifiedCheckoutOffer;
  /** Optional checkout response body — may already include install fields. */
  checkoutPayload?: JsonRecord;
}): Promise<{
  emailDelivery: EmailDeliveryStatus;
  customerEmail: string;
}> {
  const orderId = options.orderId.trim();
  const customerEmail = options.customerEmail.trim();

  if (!orderId) {
    return { emailDelivery: "failed", customerEmail };
  }

  if (wasEmailAlreadySent(orderId)) {
    markEmailDelivery(orderId, "already_sent", customerEmail);
    return { emailDelivery: "already_sent", customerEmail };
  }

  if (!customerEmail || !isValidEmail(customerEmail)) {
    markEmailDelivery(orderId, "invalid_email", customerEmail || undefined);
    return { emailDelivery: "invalid_email", customerEmail };
  }

  const config = getEmailConfig();
  if (!config.configured) {
    markEmailDelivery(orderId, "not_configured", customerEmail);
    return { emailDelivery: "not_configured", customerEmail };
  }

  let orderPayload = options.checkoutPayload || {};
  const checkoutInstall = extractInstallDetails(orderPayload);

  if (!hasInstallDetails(checkoutInstall)) {
    const fetched = await fetchBrokerOrder(orderId);
    if (fetched) {
      orderPayload = fetched;
    }
  }

  const emailPayload = buildOrderEmailPayload({
    customerEmail,
    orderId,
    verifiedOffer: options.verifiedOffer,
    orderPayload,
  });

  if (!emailPayload) {
    markEmailDelivery(orderId, "skipped_no_install_details", customerEmail);
    return {
      emailDelivery: "skipped_no_install_details",
      customerEmail,
    };
  }

  const result = await sendOrderEmail(emailPayload);
  return {
    emailDelivery: result.emailDelivery,
    customerEmail,
  };
}

export function getStoredEmailDelivery(orderId: string): {
  emailDelivery?: EmailDeliveryStatus;
  customerEmail?: string;
} {
  const record = getEmailDeliveryRecord(orderId);
  if (!record) return {};
  return {
    emailDelivery: record.status,
    customerEmail: record.customerEmail,
  };
}
