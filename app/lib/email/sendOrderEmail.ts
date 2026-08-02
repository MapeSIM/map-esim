import { isEmailConfigured } from "@/app/lib/email/config";
import {
  claimEmailSend,
  getEmailDeliveryRecord,
  markEmailDelivery,
  releaseEmailSendClaim,
  wasEmailAlreadySent,
} from "@/app/lib/email/deliveryStore";
import { buildDownloadableQrFilename } from "@/app/lib/email/format";
import {
  ESIM_QR_CID,
  generateEsimQrPngBuffer,
  resolveInstallQrValue,
} from "@/app/lib/email/qr";
import {
  renderOrderEmailHtml,
  renderOrderEmailText,
} from "@/app/lib/email/template";
import { sendChannelMail } from "@/app/lib/email/transport";
import type {
  OrderEmailPayload,
  SendOrderEmailResult,
} from "@/app/lib/email/types";
import { isValidEmail } from "@/app/lib/vesim/server";

const INLINE_QR_FILENAME = "map-esim-qr-inline.png";

/**
 * Sends a branded MAP eSIM order email via the ORDERS channel.
 * Never throws to callers for SMTP failures — returns a safe status.
 * Never logs credentials or raw provider payloads.
 */
export async function sendOrderEmail(
  payload: OrderEmailPayload
): Promise<SendOrderEmailResult> {
  const orderId = payload.orderId.trim();
  const customerEmail = payload.customerEmail.trim();

  if (!orderId) {
    return { emailDelivery: "failed", detail: "missing_order_id" };
  }

  if (!customerEmail || !isValidEmail(customerEmail)) {
    markEmailDelivery(orderId, "invalid_email", customerEmail || undefined);
    return { emailDelivery: "invalid_email" };
  }

  if (wasEmailAlreadySent(orderId)) {
    markEmailDelivery(orderId, "already_sent", customerEmail);
    return { emailDelivery: "already_sent" };
  }

  if (!isEmailConfigured("orders")) {
    markEmailDelivery(orderId, "not_configured", customerEmail);
    return { emailDelivery: "not_configured" };
  }

  if (!claimEmailSend(orderId)) {
    const existing = getEmailDeliveryRecord(orderId);
    if (
      existing?.status === "sent" ||
      existing?.status === "already_sent"
    ) {
      return { emailDelivery: "already_sent" };
    }
    return { emailDelivery: "already_sent" };
  }

  try {
    // QR is generated only from verified order payload fields — never client params.
    const installValue = resolveInstallQrValue(payload);
    const qrPng = installValue
      ? await generateEsimQrPngBuffer(installValue)
      : null;

    const attachments = qrPng
      ? [
          {
            filename: INLINE_QR_FILENAME,
            content: qrPng,
            contentType: "image/png",
            cid: ESIM_QR_CID,
            contentDisposition: "inline" as const,
          },
          {
            filename: buildDownloadableQrFilename(
              payload.destination,
              orderId
            ),
            content: qrPng,
            contentType: "image/png",
            contentDisposition: "attachment" as const,
          },
        ]
      : undefined;

    const destinationLabel = payload.destination.trim() || "eSIM";

    const result = await sendChannelMail({
      channel: "orders",
      to: customerEmail,
      subject: `Your eSIM is Ready! — ${destinationLabel} | MAP eSIM`,
      text: renderOrderEmailText(payload, { hasQrAttachment: Boolean(qrPng) }),
      html: renderOrderEmailHtml(payload, {
        qrImageSrc: qrPng ? `cid:${ESIM_QR_CID}` : undefined,
      }),
      attachments,
      headers: {
        "X-Entity-Ref-ID": orderId,
        "X-MAP-ESIM-Order-ID": orderId,
      },
      messageId: `<order-${orderId.replace(/[^a-zA-Z0-9_-]/g, "")}@mapesim.com>`,
    });

    if (!result.ok) {
      if (result.reason === "not_configured") {
        markEmailDelivery(orderId, "not_configured", customerEmail);
        return { emailDelivery: "not_configured" };
      }
      markEmailDelivery(orderId, "failed", customerEmail);
      return { emailDelivery: "failed" };
    }

    markEmailDelivery(orderId, "sent", customerEmail);
    return { emailDelivery: "sent" };
  } catch (error: unknown) {
    console.error(
      "Order email delivery failed:",
      error instanceof Error ? error.message : "unknown_error"
    );
    markEmailDelivery(orderId, "failed", customerEmail);
    return { emailDelivery: "failed" };
  } finally {
    releaseEmailSendClaim(orderId);
  }
}
