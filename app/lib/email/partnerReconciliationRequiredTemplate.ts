import { BRAND_NAME, BRAND_SITE_URL, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";

export const PARTNER_RECON_REQUIRED_EMAIL_SUBJECT =
  "MAP eSIM Partner purchase is under review";

export type PartnerReconciliationRequiredEmailPayload = {
  partnerName: string;
  purchaseReference: string;
  planLabel: string | null;
  destinationLabel: string | null;
  amountLabel: string;
  currencyLabel: string;
  supportUrl: string;
  partnerOrdersUrl: string;
};

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${TEXT_SECONDARY};width:42%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:${TEXT_PRIMARY};font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

export function renderPartnerReconciliationRequiredEmailHtml(
  payload: PartnerReconciliationRequiredEmailPayload
): string {
  const name = escapeHtml(payload.partnerName || "Partner");
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const planRow = payload.planLabel
    ? detailRow("Plan", payload.planLabel)
    : "";
  const destinationRow = payload.destinationLabel
    ? detailRow("Destination", payload.destinationLabel)
    : "";

  return renderTransactionalEmailLayoutHtml({
    title: `${BRAND_NAME} Partner purchase under review`,
    contentHtml: `
              <h1 style="margin:0 0 12px;font-size:22px;color:${TEXT_PRIMARY};font-weight:700;">
                Your Partner purchase is under review
              </h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                Hello ${name}, we received your eSIM purchase request, but its status has not yet been confirmed.
                ${escapeHtml(BRAND_NAME)} is reviewing the purchase.
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_PRIMARY};font-weight:600;">
                Please do not retry the purchase immediately or buy the same plan again while the review is open.
              </p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                Your Partner balance will be restored only if the purchase failure is confirmed.
                We’ll update the order when the review is resolved.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;">
                ${detailRow("Reference", payload.purchaseReference)}
                ${planRow}
                ${destinationRow}
                ${detailRow("Partner charge", `${payload.amountLabel} ${payload.currencyLabel}`)}
              </table>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:${TEXT_SECONDARY};">
                Need help? Contact
                <a href="mailto:${support}" style="color:${TEXT_PRIMARY};font-weight:600;">${support}</a>
                or visit
                <a href="${escapeHtml(payload.supportUrl)}" style="color:${TEXT_PRIMARY};font-weight:600;">Support</a>.
              </p>
              <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:${TEXT_SECONDARY};">
                <a href="${escapeHtml(payload.partnerOrdersUrl)}" style="color:${TEXT_PRIMARY};font-weight:600;">View Partner orders</a>
              </p>`,
  });
}

export function renderPartnerReconciliationRequiredEmailText(
  payload: PartnerReconciliationRequiredEmailPayload
): string {
  const lines = [
    `Hello ${payload.partnerName || "Partner"},`,
    "",
    "We received your eSIM purchase request, but its status has not yet been confirmed.",
    `${BRAND_NAME} is reviewing the purchase.`,
    "",
    "Please do not retry the purchase immediately or buy the same plan again while the review is open.",
    "",
    "Your Partner balance will be restored only if the purchase failure is confirmed.",
    "We’ll update the order when the review is resolved.",
    "",
    `Reference: ${payload.purchaseReference}`,
  ];
  if (payload.planLabel) lines.push(`Plan: ${payload.planLabel}`);
  if (payload.destinationLabel) {
    lines.push(`Destination: ${payload.destinationLabel}`);
  }
  lines.push(
    `Partner charge: ${payload.amountLabel} ${payload.currencyLabel}`,
    "",
    `Support: ${BRAND_SUPPORT_EMAIL}`,
    `Support page: ${payload.supportUrl || `${BRAND_SITE_URL}/support`}`,
    `Partner orders: ${payload.partnerOrdersUrl}`,
    "",
    renderEmailFooterText()
  );
  return lines.join("\n");
}
