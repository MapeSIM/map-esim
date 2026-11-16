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

export type ManualPaymentCustomerEmailPayload = {
  customerName: string;
  orderReference: string;
  planLabel: string | null;
  destinationLabel: string | null;
  amountLabel: string;
  paymentMethodLabel: string;
  supportUrl: string;
  accountOrdersUrl: string | null;
};

export type ManualPaymentAdminEmailPayload = {
  orderId: string;
  orderReference: string;
  customerName: string;
  customerEmail: string;
  planLabel: string | null;
  destinationLabel: string | null;
  amountLabel: string;
  paymentMethodLabel: string;
  submittedAtLabel: string;
  adminReviewUrl: string;
};

export function manualPaymentCustomerSubject(orderReference: string): string {
  return `We received your manual payment — Order ${orderReference} under review`;
}

export function manualPaymentAdminSubject(orderReference: string): string {
  return `[MAP eSIM] Manual payment submitted — ${orderReference}`;
}

export function renderManualPaymentCustomerEmailHtml(
  payload: ManualPaymentCustomerEmailPayload
): string {
  const name = escapeHtml(payload.customerName || "Customer");
  const rows = [
    renderEmailDetailRow("Order", payload.orderReference),
    payload.destinationLabel
      ? renderEmailDetailRow("Destination", payload.destinationLabel)
      : "",
    payload.planLabel ? renderEmailDetailRow("Plan", payload.planLabel) : "",
    renderEmailDetailRow("Amount", payload.amountLabel),
    renderEmailDetailRow("Payment method", payload.paymentMethodLabel),
  ].join("");

  return renderTransactionalEmailLayoutHtml({
    title: `${BRAND_NAME} manual payment received`,
    preheader: "Your payment proof is under review.",
    contentHtml: `
              ${renderEmailHeading("We received your manual payment")}
              ${renderEmailLead(
                `Hello ${name}, thanks for submitting your payment proof for ${escapeHtml(BRAND_NAME)}. Your order is under review.`
              )}
              ${renderEmailNotice(
                "Verification usually completes within a few business hours. You will receive a separate email with QR / install details once your eSIM is issued. No extra charge applies."
              )}
              ${renderEmailSummaryPanel("Order summary", rows)}
              ${
                payload.accountOrdersUrl
                  ? `${renderEmailParagraph(
                      "You can check this order in your account while we review your payment."
                    )}${renderEmailCtaButton(
                      payload.accountOrdersUrl,
                      "View my orders"
                    )}`
                  : renderEmailParagraph(
                      `Need help? Contact ${escapeHtml(BRAND_SUPPORT_EMAIL)} or visit our support page.`
                    )
              }
              ${renderEmailCtaButton(payload.supportUrl, "Support Center")}
              ${renderEmailSupportBlock()}`,
  });
}

export function renderManualPaymentCustomerEmailText(
  payload: ManualPaymentCustomerEmailPayload
): string {
  const lines = [
    `${BRAND_NAME}: manual payment received`,
    "",
    `Hello ${payload.customerName || "Customer"},`,
    "",
    "We received your manual payment proof. Your order is under review.",
    "Verification usually completes within a few business hours.",
    "You will receive a separate email with QR / install details once your eSIM is issued.",
    "",
    `Order: ${payload.orderReference}`,
  ];
  if (payload.destinationLabel) {
    lines.push(`Destination: ${payload.destinationLabel}`);
  }
  if (payload.planLabel) {
    lines.push(`Plan: ${payload.planLabel}`);
  }
  lines.push(
    `Amount: ${payload.amountLabel}`,
    `Payment method: ${payload.paymentMethodLabel}`,
    ""
  );
  if (payload.accountOrdersUrl) {
    lines.push(`View my orders: ${payload.accountOrdersUrl}`, "");
  }
  lines.push(
    `Support: ${payload.supportUrl}`,
    `Email: ${BRAND_SUPPORT_EMAIL}`,
    "",
    renderEmailFooterText()
  );
  return lines.join("\n");
}

export function renderManualPaymentAdminEmailHtml(
  payload: ManualPaymentAdminEmailPayload
): string {
  const rows = [
    renderEmailDetailRow("Order ID", payload.orderId),
    renderEmailDetailRow("Reference", payload.orderReference),
    renderEmailDetailRow("Customer", payload.customerName),
    renderEmailDetailRow("Email", payload.customerEmail),
    payload.destinationLabel
      ? renderEmailDetailRow("Destination", payload.destinationLabel)
      : "",
    payload.planLabel ? renderEmailDetailRow("Plan", payload.planLabel) : "",
    renderEmailDetailRow("Amount", payload.amountLabel),
    renderEmailDetailRow("Payment method", payload.paymentMethodLabel),
    renderEmailDetailRow("Submitted", payload.submittedAtLabel),
  ].join("");

  return renderTransactionalEmailLayoutHtml({
    title: `${BRAND_NAME} manual payment alert`,
    preheader: `Review payment proof for ${payload.orderReference}`,
    contentHtml: `
              ${renderEmailHeading("Manual payment submitted")}
              ${renderEmailLead(
                "A customer submitted a manual payment proof. Review and approve in Admin."
              )}
              ${renderEmailSummaryPanel("Order details", rows)}
              ${renderEmailCtaButton(payload.adminReviewUrl, "Review in Admin")}
              ${renderEmailSupportBlock()}`,
  });
}

export function renderManualPaymentAdminEmailText(
  payload: ManualPaymentAdminEmailPayload
): string {
  return [
    `${BRAND_NAME}: manual payment submitted`,
    "",
    `Order ID: ${payload.orderId}`,
    `Reference: ${payload.orderReference}`,
    `Customer: ${payload.customerName}`,
    `Email: ${payload.customerEmail}`,
    payload.destinationLabel
      ? `Destination: ${payload.destinationLabel}`
      : null,
    payload.planLabel ? `Plan: ${payload.planLabel}` : null,
    `Amount: ${payload.amountLabel}`,
    `Payment method: ${payload.paymentMethodLabel}`,
    `Submitted: ${payload.submittedAtLabel}`,
    "",
    `Review in Admin: ${payload.adminReviewUrl}`,
    "",
    `Site: ${BRAND_SITE_URL}`,
    "",
    renderEmailFooterText(),
  ]
    .filter((line): line is string => line != null)
    .join("\n");
}
