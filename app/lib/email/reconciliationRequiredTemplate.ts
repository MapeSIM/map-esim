import { BRAND_NAME, BRAND_SITE_URL, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
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

export const RECON_REQUIRED_EMAIL_SUBJECT =
  "We’re reviewing your MAP eSIM order";

export type ReconciliationRequiredEmailPayload = {
  customerName: string;
  purchaseReference: string;
  planLabel: string | null;
  destinationLabel: string | null;
  amountLabel: string;
  currencyLabel: string;
  supportUrl: string;
  accountOrdersUrl: string;
};

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${TEXT_SECONDARY};width:42%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:${TEXT_PRIMARY};font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

export function renderReconciliationRequiredEmailHtml(
  payload: ReconciliationRequiredEmailPayload
): string {
  const name = escapeHtml(payload.customerName || "Customer");
  const footer = renderEmailFooterHtml("billing");
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const planRow = payload.planLabel
    ? detailRow("Plan", payload.planLabel)
    : "";
  const destinationRow = payload.destinationLabel
    ? detailRow("Destination", payload.destinationLabel)
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(BRAND_NAME)} order under review</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${PAGE_BG};width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:${CARD_BG};border:1px solid ${BORDER};">
          <tr>
            <td align="center" style="background:${BRAND_LIME};padding:22px 20px;">
              <p style="margin:0;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;color:${BRAND_INK};">
                ${escapeHtml(BRAND_NAME)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              <h1 style="margin:0 0 12px;font-size:22px;color:${TEXT_PRIMARY};font-weight:700;">
                We’re reviewing your order
              </h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                Hello ${name}, we couldn’t safely complete your ${escapeHtml(BRAND_NAME)} eSIM order automatically.
                Your order is under review by our team.
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_PRIMARY};font-weight:600;">
                Any reserved funds are being handled safely — they are held for this review, not lost.
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                Please do not place the same order again or pay again for this purchase while the review is open.
                We’ll update you when the review is resolved.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;">
                ${detailRow("Reference", payload.purchaseReference)}
                ${planRow}
                ${destinationRow}
                ${detailRow("Amount", `${payload.amountLabel} ${payload.currencyLabel}`)}
              </table>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:${TEXT_SECONDARY};">
                Need help? Contact
                <a href="mailto:${support}" style="color:${TEXT_PRIMARY};font-weight:600;">${support}</a>
                or visit
                <a href="${escapeHtml(payload.supportUrl)}" style="color:${TEXT_PRIMARY};font-weight:600;">Support</a>.
              </p>
              <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:${TEXT_SECONDARY};">
                <a href="${escapeHtml(payload.accountOrdersUrl)}" style="color:${TEXT_PRIMARY};font-weight:600;">View your account orders</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderReconciliationRequiredEmailText(
  payload: ReconciliationRequiredEmailPayload
): string {
  const name = payload.customerName || "Customer";
  const lines = [
    `Hello ${name},`,
    "",
    `We couldn’t safely complete your ${BRAND_NAME} eSIM order automatically.`,
    "Your order is under review by our team.",
    "",
    "Any reserved funds are being handled safely — they are held for this review, not lost.",
    "",
    "Please do not place the same order again or pay again for this purchase while the review is open.",
    "We’ll update you when the review is resolved.",
    "",
    `Reference: ${payload.purchaseReference}`,
  ];
  if (payload.planLabel) lines.push(`Plan: ${payload.planLabel}`);
  if (payload.destinationLabel) {
    lines.push(`Destination: ${payload.destinationLabel}`);
  }
  lines.push(
    `Amount: ${payload.amountLabel} ${payload.currencyLabel}`,
    "",
    `Support: ${BRAND_SUPPORT_EMAIL}`,
    `Support page: ${payload.supportUrl || `${BRAND_SITE_URL}/support`}`,
    `Account orders: ${payload.accountOrdersUrl}`,
    "",
    renderEmailFooterText("billing")
  );
  return lines.join("\n");
}
