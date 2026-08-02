import nodemailer from "nodemailer";
import { getEmailConfig } from "@/app/lib/email/config";
import {
  claimEmailSend,
  getEmailDeliveryRecord,
  markEmailDelivery,
  releaseEmailSendClaim,
  wasEmailAlreadySent,
} from "@/app/lib/email/deliveryStore";
import {
  ESIM_QR_CID,
  generateEsimQrPngBuffer,
  resolveInstallQrValue,
} from "@/app/lib/email/qr";
import {
  renderOrderEmailHtml,
  renderOrderEmailText,
} from "@/app/lib/email/template";
import type {
  OrderEmailPayload,
  SendOrderEmailResult,
} from "@/app/lib/email/types";
import { isValidEmail } from "@/app/lib/vesim/server";

/**
 * Sends a branded MAP-eSIM order email.
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

  const config = getEmailConfig();
  if (!config.configured) {
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
    const transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.password,
      },
    });

    // QR is generated only from verified order payload fields — never client params.
    const installValue = resolveInstallQrValue(payload);
    const qrPng = installValue
      ? await generateEsimQrPngBuffer(installValue)
      : null;

    const attachments = qrPng
      ? [
          {
            filename: "esim-qr.png",
            content: qrPng,
            contentType: "image/png",
            cid: ESIM_QR_CID,
            contentDisposition: "inline" as const,
          },
        ]
      : undefined;

    await transporter.sendMail({
      from: config.from,
      to: customerEmail,
      subject: `MAP-eSIM order confirmed — ${orderId}`,
      text: renderOrderEmailText(payload),
      html: renderOrderEmailHtml(payload, {
        qrImageSrc: qrPng ? `cid:${ESIM_QR_CID}` : undefined,
      }),
      attachments,
      // Use verified order ID as the stable email reference for dedupe/tracing.
      headers: {
        "X-Entity-Ref-ID": orderId,
        "X-MAP-ESIM-Order-ID": orderId,
      },
      messageId: `<order-${orderId.replace(/[^a-zA-Z0-9_-]/g, "")}@mapesim.com>`,
    });

    markEmailDelivery(orderId, "sent", customerEmail);
    return { emailDelivery: "sent" };
  } catch (error: unknown) {
    // Log only a safe message — never SMTP passwords or API keys.
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
