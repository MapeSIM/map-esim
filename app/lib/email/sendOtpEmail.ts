import {
  otpEmailSubject,
  renderOtpEmailHtml,
  renderOtpEmailText,
  type OtpEmailKind,
} from "@/app/lib/email/otpTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";
import { sendPartnerChannelMail } from "@/app/lib/email/partnerTransport";

export type SendOtpEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed" | "invalid_recipient" };

/**
 * Sends a branded security OTP email via the SECURITY channel.
 * Never logs the OTP or SMTP credentials.
 * Pass `audience: "partner"` for partneresim.com security@ mailbox.
 */
export async function sendOtpEmail(options: {
  kind: OtpEmailKind;
  to: string;
  code: string;
  audience?: "retail" | "partner";
}): Promise<SendOtpEmailResult> {
  const payload = {
    kind: options.kind,
    code: options.code,
    recipientEmail: options.to,
  };
  if (options.audience === "partner") {
    return sendPartnerChannelMail({
      channel: "security",
      to: options.to,
      subject: otpEmailSubject(options.kind),
      text: renderOtpEmailText(payload),
      html: renderOtpEmailHtml(payload),
      headers: { "X-MAP-ESIM-Partner-Mail": "otp" },
    });
  }
  return sendChannelMail({
    channel: "security",
    to: options.to,
    subject: otpEmailSubject(options.kind),
    text: renderOtpEmailText(payload),
    html: renderOtpEmailHtml(payload),
  });
}
