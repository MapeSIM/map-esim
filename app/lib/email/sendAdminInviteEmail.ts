import {
  ADMIN_INVITE_EMAIL_SUBJECT,
  renderAdminInviteEmailHtml,
  renderAdminInviteEmailText,
} from "@/app/lib/email/adminInviteTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";

export type SendAdminInviteEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed" | "invalid_recipient" };

/**
 * Admin invitation password-setup link email via SECURITY channel.
 * Never logs the setup URL/token or SMTP credentials.
 */
export async function sendAdminInviteEmail(options: {
  to: string;
  setupUrl: string;
}): Promise<SendAdminInviteEmailResult> {
  return sendChannelMail({
    channel: "security",
    to: options.to,
    subject: ADMIN_INVITE_EMAIL_SUBJECT,
    text: renderAdminInviteEmailText({
      recipientEmail: options.to,
      setupUrl: options.setupUrl,
    }),
    html: renderAdminInviteEmailHtml({
      recipientEmail: options.to,
      setupUrl: options.setupUrl,
    }),
  });
}
