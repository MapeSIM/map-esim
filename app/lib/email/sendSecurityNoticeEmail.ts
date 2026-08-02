import {
  renderAccountDeletedEmailHtml,
  renderAccountDeletedEmailText,
  renderPasswordChangedEmailHtml,
  renderPasswordChangedEmailText,
} from "@/app/lib/email/securityNoticeTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";

export type SendSecurityNoticeResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed" | "invalid_recipient" };

/**
 * Password-changed alert via SECURITY channel.
 * Never includes passwords, OTPs, or install secrets.
 */
export async function sendPasswordChangedEmail(
  to: string
): Promise<SendSecurityNoticeResult> {
  return sendChannelMail({
    channel: "security",
    to,
    subject: "Your MAP eSIM password was changed",
    text: renderPasswordChangedEmailText(to),
    html: renderPasswordChangedEmailHtml(to),
  });
}

/**
 * Account-deletion confirmation via SECURITY channel.
 * Sent to the original verified address captured before anonymization.
 * Never includes passwords, OTPs, QR, or LPA values.
 */
export async function sendAccountDeletedEmail(
  to: string
): Promise<SendSecurityNoticeResult> {
  return sendChannelMail({
    channel: "security",
    to,
    subject: "Your MAP eSIM account was deleted",
    text: renderAccountDeletedEmailText(to),
    html: renderAccountDeletedEmailHtml(to),
  });
}
