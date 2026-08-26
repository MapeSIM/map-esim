import { BRAND_NAME, BRAND_SITE_URL, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";

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
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const planRow = payload.planLabel
    ? detailRow("Plan", payload.planLabel)
    : "";
  const destinationRow = payload.destinationLabel
    ? detailRow("Destination", payload.destinationLabel)
    : "";

  return renderTransactionalEmailLayoutHtml({
    title: `${BRAND_NAME} order under review`,
    contentHtml: `
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
              </p>`,
  });
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
    renderEmailFooterText()
  );
  return lines.join("\n");
}
