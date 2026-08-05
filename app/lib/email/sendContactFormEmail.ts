import "server-only";

import { BRAND_NAME, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import {
  BRAND_INK,
  BRAND_LIME,
  BORDER,
  CARD_BG,
  escapeHtml,
  PAGE_BG,
  renderEmailFooterHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
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
 * Reply-To is the validated customer email only (order mail paths unchanged).
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
    renderEmailFooterText("support"),
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en"><body style="margin:0;padding:0;background:${PAGE_BG};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PAGE_BG};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" style="max-width:560px;background:${CARD_BG};border:1px solid ${BORDER};">
<tr><td align="center" style="background:${BRAND_LIME};padding:20px;">
<p style="margin:0;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;color:${BRAND_INK};">${escapeHtml(BRAND_NAME)} Contact</p>
</td></tr>
<tr><td style="padding:24px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
<p style="margin:0 0 8px;font-size:13px;color:${TEXT_SECONDARY};"><strong style="color:${TEXT_PRIMARY};">Name:</strong> ${escapeHtml(name)}</p>
<p style="margin:0 0 8px;font-size:13px;color:${TEXT_SECONDARY};"><strong style="color:${TEXT_PRIMARY};">Email:</strong> ${escapeHtml(replyTo)}</p>
<p style="margin:0 0 16px;font-size:13px;color:${TEXT_SECONDARY};"><strong style="color:${TEXT_PRIMARY};">Subject:</strong> ${escapeHtml(subject)}</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${TEXT_PRIMARY};">${escapeHtml(message).replace(/\n/g, "<br/>")}</p>
${renderEmailFooterHtml("support")}
</td></tr>
</table></td></tr></table></body></html>`;

  const logo = getEmailLogoAttachment();

  try {
    await transporter.sendMail({
      from: config.from,
      to,
      replyTo,
      subject: `[MAP eSIM Contact] ${subject}`,
      text,
      html,
      attachments: logo ? [logo] : undefined,
      envelope: {
        from: config.mailbox,
        to,
      },
    });
    return { ok: true };
  } catch {
    console.error("Contact form email send failed");
    return { ok: false, reason: "send_failed" };
  }
}
