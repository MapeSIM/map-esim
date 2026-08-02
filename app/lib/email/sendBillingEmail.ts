import { sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import { sendChannelMail } from "@/app/lib/email/transport";
import { BRAND_NAME } from "@/app/lib/brand";
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

export type BillingNoticeKind =
  | "payment_receipt"
  | "payment_status"
  | "payment_failed"
  | "refund_status"
  | "invoice";

export type SendBillingEmailResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "send_failed" | "invalid_recipient" };

/**
 * Billing notices via BILLING channel.
 * Ready for receipts/refunds/invoices — does not invent payment data.
 */
export async function sendBillingEmail(options: {
  to: string;
  kind: BillingNoticeKind;
  subject: string;
  bodyText: string;
}): Promise<SendBillingEmailResult> {
  const subject = sanitizeEmailHeaderValue(options.subject, 160);
  const body = options.bodyText
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .trim();
  if (!subject || !body) {
    return { ok: false, reason: "send_failed" };
  }

  const htmlBody = escapeHtml(body).replace(/\n/g, "<br/>");
  const html = `<!DOCTYPE html>
<html lang="en"><body style="margin:0;padding:0;background:${PAGE_BG};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${PAGE_BG};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" style="max-width:560px;background:${CARD_BG};border:1px solid ${BORDER};">
<tr><td align="center" style="background:${BRAND_LIME};padding:20px;"><p style="margin:0;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;color:${BRAND_INK};">${escapeHtml(BRAND_NAME)}</p></td></tr>
<tr><td style="padding:24px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
<p style="margin:0 0 12px;font-size:18px;font-weight:700;color:${TEXT_PRIMARY};">${escapeHtml(subject)}</p>
<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:${TEXT_SECONDARY};">${htmlBody}</p>
${renderEmailFooterHtml("billing")}
</td></tr>
</table></td></tr></table></body></html>`;

  return sendChannelMail({
    channel: "billing",
    to: options.to,
    subject: `[MAP eSIM Billing] ${subject}`,
    text: `${subject}\n\n${body}\n\n${renderEmailFooterText("billing")}`,
    html,
    headers: {
      "X-MAP-ESIM-Billing-Kind": sanitizeEmailHeaderValue(options.kind, 40),
    },
  });
}
