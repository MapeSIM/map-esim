import {
  PARTNER_INVITE_EMAIL_SUBJECT,
  renderPartnerInviteEmailHtml,
  renderPartnerInviteEmailText,
} from "@/app/lib/email/partnerInviteTemplate";
import { sendPartnerChannelMail } from "@/app/lib/email/partnerTransport";

export type SendPartnerInviteEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed" | "invalid_recipient" };

/**
 * Partner welcome / password-setup link via partners@partneresim.com.
 * Never logs the setup URL/token or SMTP credentials.
 */
export async function sendPartnerInviteEmail(options: {
  to: string;
  setupUrl: string;
}): Promise<SendPartnerInviteEmailResult> {
  return sendPartnerChannelMail({
    channel: "partners",
    to: options.to,
    subject: PARTNER_INVITE_EMAIL_SUBJECT,
    text: renderPartnerInviteEmailText({
      recipientEmail: options.to,
      setupUrl: options.setupUrl,
    }),
    html: renderPartnerInviteEmailHtml({
      recipientEmail: options.to,
      setupUrl: options.setupUrl,
    }),
    headers: {
      "X-MAP-ESIM-Partner-Mail": "invite",
    },
  });
}
