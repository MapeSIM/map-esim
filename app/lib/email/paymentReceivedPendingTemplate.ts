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

export const PAYMENT_RECEIVED_PENDING_EMAIL_SUBJECT =
  "We received your MAP eSIM payment";

export type PaymentReceivedPendingEmailPayload = {
  customerName: string;
  purchaseReference: string;
  planLabel: string | null;
  destinationLabel: string | null;
  amountLabel: string;
  currencyLabel: string;
  accountOrdersUrl: string;
};

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${TEXT_SECONDARY};width:42%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:${TEXT_PRIMARY};font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

export function renderPaymentReceivedPendingEmailHtml(
  payload: PaymentReceivedPendingEmailPayload
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
  <title>${escapeHtml(BRAND_NAME)} payment received</title>
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
                Payment received
              </h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                Hello ${name}, we received your ${escapeHtml(BRAND_NAME)} payment.
                Your eSIM is being prepared and is not ready to install yet.
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_PRIMARY};font-weight:600;">
                You will receive a separate email with QR code and install details when your eSIM is ready.
                No extra charge applies.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
                ${detailRow("Reference", payload.purchaseReference)}
                ${destinationRow}
                ${planRow}
                ${detailRow("Amount", `${payload.amountLabel} ${payload.currencyLabel}`)}
              </table>
              <p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:${TEXT_SECONDARY};">
                You can check this purchase in your account while we finish setup.
              </p>
              <p style="margin:16px 0 0;font-size:14px;line-height:1.55;">
                <a href="${escapeHtml(payload.accountOrdersUrl)}" style="color:#2f6b00;font-weight:700;text-decoration:underline;">View my eSIMs</a>
              </p>
              <p style="margin:18px 0 0;font-size:13px;line-height:1.55;color:${TEXT_SECONDARY};">
                Questions? Contact
                <a href="mailto:${support}" style="color:#2f6b00;text-decoration:underline;">${support}</a>
                or visit
                <a href="${escapeHtml(BRAND_SITE_URL)}/contact" style="color:#2f6b00;text-decoration:underline;">${escapeHtml(BRAND_SITE_URL.replace(/^https?:\/\//, ""))}/contact</a>.
              </p>
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

export function renderPaymentReceivedPendingEmailText(
  payload: PaymentReceivedPendingEmailPayload
): string {
  const lines = [
    `${BRAND_NAME}: payment received`,
    "",
    `Hello ${payload.customerName || "Customer"},`,
    "",
    "We received your payment.",
    "Your eSIM is being prepared and is not ready to install yet.",
    "You will receive a separate email with QR code and install details when your eSIM is ready.",
    "No extra charge applies.",
    "",
    `Reference: ${payload.purchaseReference}`,
  ];
  if (payload.destinationLabel) {
    lines.push(`Destination: ${payload.destinationLabel}`);
  }
  if (payload.planLabel) {
    lines.push(`Plan: ${payload.planLabel}`);
  }
  lines.push(
    `Amount: ${payload.amountLabel} ${payload.currencyLabel}`,
    "",
    "You can check this purchase in your account while we finish setup.",
    `View my eSIMs: ${payload.accountOrdersUrl}`,
    "",
    `Support: ${BRAND_SUPPORT_EMAIL}`,
    `Contact: ${BRAND_SITE_URL}/contact`,
    "",
    renderEmailFooterText("billing")
  );
  return lines.join("\n");
}
