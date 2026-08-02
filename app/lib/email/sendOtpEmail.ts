import {
  otpEmailSubject,
  renderOtpEmailHtml,
  renderOtpEmailText,
  type OtpEmailKind,
} from "@/app/lib/email/otpTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";

export type SendOtpEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed" | "invalid_recipient" };

/**
 * Sends a branded security OTP email via the SECURITY channel.
 * Never logs the OTP or SMTP credentials.
 */
export async function sendOtpEmail(options: {
  kind: OtpEmailKind;
  to: string;
  code: string;
}): Promise<SendOtpEmailResult> {
  const result = await sendChannelMail({
    channel: "security",
    to: options.to,
    subject: otpEmailSubject(options.kind),
    text: renderOtpEmailText({
      kind: options.kind,
      code: options.code,
      recipientEmail: options.to,
    }),
    html: renderOtpEmailHtml({
      kind: options.kind,
      code: options.code,
      recipientEmail: options.to,
    }),
  });

  return result;
}
