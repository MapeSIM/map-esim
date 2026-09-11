import { BRAND_NAME, BRAND_SITE_URL, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";
import {
  renderEmailCtaButton,
  renderEmailDetailRow,
  renderEmailHeading,
  renderEmailLead,
  renderEmailNotice,
  renderEmailParagraph,
  renderEmailSummaryPanel,
  renderEmailSupportBlock,
} from "@/app/lib/email/emailUi";

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

export function renderPaymentReceivedPendingEmailHtml(
  payload: PaymentReceivedPendingEmailPayload
): string {
  const name = escapeHtml(payload.customerName || "Customer");
  const rows = [
    renderEmailDetailRow("Reference", payload.purchaseReference),
    payload.destinationLabel
      ? renderEmailDetailRow("Destination", payload.destinationLabel)
      : "",
    payload.planLabel ? renderEmailDetailRow("Plan", payload.planLabel) : "",
    renderEmailDetailRow(
      "Amount",
      `${payload.amountLabel} ${payload.currencyLabel}`
    ),
  ].join("");

  return renderTransactionalEmailLayoutHtml({
    title: `${BRAND_NAME} payment received`,
    preheader: "Your eSIM is being prepared — install details will follow.",
    contentHtml: `
              ${renderEmailHeading("Payment received")}
              ${renderEmailLead(
                `Hello ${name}, we received your ${escapeHtml(BRAND_NAME)} payment. Your eSIM is being prepared and is not ready to install yet.`
              )}
              ${renderEmailNotice(
                "You will receive a separate email with QR code and install details when your eSIM is ready. No extra charge applies."
              )}
              ${renderEmailSummaryPanel("Purchase details", rows)}
              ${renderEmailParagraph(
                "You can check this purchase in your account while we finish setup."
              )}
              ${renderEmailCtaButton(payload.accountOrdersUrl, "View my eSIMs")}
              ${renderEmailSupportBlock()}`,
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
