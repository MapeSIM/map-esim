import { isEmailConfigured } from "@/app/lib/email/config";
import {
  claimEmailSend,
  clearEmailDeliveryRecord,
  getEmailDeliveryRecord,
  markEmailDelivery,
  releaseEmailSendClaim,
  wasEmailAlreadySent,
} from "@/app/lib/email/deliveryStore";
import { buildDownloadableQrFilename } from "@/app/lib/email/format";
import {
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

function resolveHttpsQrImageSrc(payload: OrderEmailPayload): string | undefined {
  const raw = payload.qrImageUrl?.trim() || "";
  if (!raw) return undefined;
  // Never allow CID or data-URI in production HTML (Gmail/Outlook break these).
  if (/^cid:/i.test(raw) || /^data:/i.test(raw)) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return undefined;
    }
    // Production emails should be HTTPS; allow http only for local APP_BASE_URL.
    if (
      parsed.protocol === "http:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) {
      return undefined;
    }
    if (!parsed.pathname.includes("/api/vesim/install/qr")) {
      return undefined;
    }
    if (!parsed.searchParams.get("access") || !parsed.searchParams.get("orderId")) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

/**
 * Sends a branded MAP eSIM order email via the ORDERS channel.
 * Never throws to callers for SMTP failures — returns a safe status.
 * Never logs credentials or raw provider payloads.
 *
 * HTML QR uses an absolute HTTPS order-access URL (Gmail/Outlook compatible).
 * A downloadable PNG attachment is still included when LPA is available.
 * CID is not used for the HTML <img> src.
 */
export async function sendOrderEmail(
  payload: OrderEmailPayload,
  options?: { forceResend?: boolean }
): Promise<SendOrderEmailResult> {
  const orderId = payload.orderId.trim();
  const customerEmail = payload.customerEmail.trim();
  const forceResend = options?.forceResend === true;

  if (!orderId) {
    return { emailDelivery: "failed", detail: "missing_order_id" };
  }

  if (!customerEmail || !isValidEmail(customerEmail)) {
    markEmailDelivery(orderId, "invalid_email", customerEmail || undefined);
    return { emailDelivery: "invalid_email" };
  }

  if (forceResend) {
    clearEmailDeliveryRecord(orderId);
  } else if (wasEmailAlreadySent(orderId)) {
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
    // QR PNG is generated only from verified order payload fields — never client params.
    const installValue = resolveInstallQrValue(payload);
    const qrPng = installValue
      ? await generateEsimQrPngBuffer(installValue)
      : null;

    const httpsQrSrc =
      qrPng && installValue ? resolveHttpsQrImageSrc(payload) : undefined;

    const attachments = qrPng
      ? [
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
    const safeOrderToken = orderId.replace(/[^a-zA-Z0-9_-]/g, "");
    const messageId = forceResend
      ? `<order-${safeOrderToken}-r${Date.now()}@mapesim.com>`
      : `<order-${safeOrderToken}@mapesim.com>`;

    const result = await sendChannelMail({
      channel: "orders",
      to: customerEmail,
      subject: `Your eSIM is Ready! — ${destinationLabel} | MAP eSIM`,
      text: renderOrderEmailText(payload, {
        hasQrAttachment: Boolean(qrPng),
        hasQrImage: Boolean(httpsQrSrc),
      }),
      html: renderOrderEmailHtml(payload, {
        qrImageSrc: httpsQrSrc,
        hasQrAttachment: Boolean(qrPng),
      }),
      attachments,
      headers: {
        "X-Entity-Ref-ID": orderId,
        "X-MAP-ESIM-Order-ID": orderId,
        ...(forceResend ? { "X-MAP-ESIM-Admin-Resend": "1" } : {}),
      },
      messageId,
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
