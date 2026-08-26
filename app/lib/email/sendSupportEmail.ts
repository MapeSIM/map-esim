import { sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import { sendChannelMail } from "@/app/lib/email/transport";
import { BRAND_NAME } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";

export type SendSupportEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed" | "invalid_recipient" };

/**
 * Support/contact outbound mail via SUPPORT channel.
 * Subject and body are sanitized; From/Reply-To are never caller-controlled.
 */
export async function sendSupportEmail(options: {
  to: string;
  subject: string;
  bodyText: string;
}): Promise<SendSupportEmailResult> {
  const subject = sanitizeEmailHeaderValue(options.subject, 160);
  const body = options.bodyText.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  if (!subject || !body) {
    return { ok: false, reason: "send_failed" };
  }

  const htmlBody = escapeHtml(body).replace(/\n/g, "<br/>");
  const html = renderTransactionalEmailLayoutHtml({
    title: subject,
    contentHtml: `
<p style="margin:0 0 12px;font-size:18px;font-weight:700;color:${TEXT_PRIMARY};">${escapeHtml(subject)}</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${TEXT_SECONDARY};">${htmlBody}</p>`,
  });

  return sendChannelMail({
    channel: "support",
    to: options.to,
    subject: `[MAP eSIM Support] ${subject}`,
    text: `${subject}\n\n${body}\n\n${renderEmailFooterText()}`,
    html,
  });
}
