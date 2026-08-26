import { BRAND_NAME, BRAND_SITE_URL, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";

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
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const planRow = payload.planLabel
    ? detailRow("Plan", payload.planLabel)
    : "";
  const destinationRow = payload.destinationLabel
    ? detailRow("Destination", payload.destinationLabel)
    : "";

  return renderTransactionalEmailLayoutHtml({
    title: `${BRAND_NAME} payment received`,
    contentHtml: `
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
              </p>`,
  });
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
    renderEmailFooterText()
  );
  return lines.join("\n");
}
