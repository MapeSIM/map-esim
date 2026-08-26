import "server-only";

import { BRAND_NAME, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";
import {
  getEmailConfig,
  sanitizeEmailHeaderValue,
} from "@/app/lib/email/config";
import { getEmailLogoAttachment } from "@/app/lib/email/logo";
import { getChannelTransporter } from "@/app/lib/email/transport";
import { isValidEmail } from "@/app/lib/vesim/server";

export type SendContactFormEmailResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_configured" | "send_failed" | "invalid_reply_to";
    };

/**
 * Inbound website contact form → SUPPORT mailbox.
 * Same channel/recipient as partnership applications.
 * Reply-To is the validated customer email only.
 * Does not set a custom SMTP envelope (Hostinger delivers the auto envelope).
 */
export async function sendContactFormEmail(options: {
  customerName: string;
  customerEmail: string;
  subject: string;
  message: string;
}): Promise<SendContactFormEmailResult> {
  const replyTo = options.customerEmail.trim().toLowerCase();
  if (!replyTo || !isValidEmail(replyTo)) {
    return { ok: false, reason: "invalid_reply_to" };
  }

  const subject = sanitizeEmailHeaderValue(options.subject, 160);
  const name = sanitizeEmailHeaderValue(options.customerName, 80);
  const message = options.message
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();

  if (!subject || !name || !message) {
    return { ok: false, reason: "send_failed" };
  }

  const config = getEmailConfig("support");
  if (!config.configured) {
    return { ok: false, reason: "not_configured" };
  }

  const transporter = getChannelTransporter("support");
  if (!transporter) {
    return { ok: false, reason: "not_configured" };
  }

  const to = BRAND_SUPPORT_EMAIL.trim().toLowerCase();
  if (!to || !isValidEmail(to)) {
    return { ok: false, reason: "send_failed" };
  }

  const text = [
    `New contact form message via ${BRAND_NAME}`,
    "",
    `Name: ${name}`,
    `Email: ${replyTo}`,
    `Subject: ${subject}`,
    "",
    message,
    "",
    renderEmailFooterText(),
  ].join("\n");

  const html = renderTransactionalEmailLayoutHtml({
    title: `[MAP eSIM Contact] ${subject}`,
    bannerLabel: `${BRAND_NAME} Contact`,
    contentHtml: `
<p style="margin:0 0 8px;font-size:13px;color:${TEXT_SECONDARY};"><strong style="color:${TEXT_PRIMARY};">Name:</strong> ${escapeHtml(name)}</p>
<p style="margin:0 0 8px;font-size:13px;color:${TEXT_SECONDARY};"><strong style="color:${TEXT_PRIMARY};">Email:</strong> ${escapeHtml(replyTo)}</p>
<p style="margin:0 0 16px;font-size:13px;color:${TEXT_SECONDARY};"><strong style="color:${TEXT_PRIMARY};">Subject:</strong> ${escapeHtml(subject)}</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${TEXT_PRIMARY};">${escapeHtml(message).replace(/\n/g, "<br/>")}</p>`,
  });

  try {
    const logo = getEmailLogoAttachment();
    await transporter.sendMail({
      from: config.from,
      to,
      replyTo,
      subject: `[MAP eSIM Contact] ${subject}`,
      text,
      html,
      attachments: logo ? [logo] : undefined,
      headers: {
        "X-MAP-ESIM-Form": "contact",
      },
    });
    return { ok: true };
  } catch {
    console.error("contact_form_email", "send_failed");
    return { ok: false, reason: "send_failed" };
  }
}
