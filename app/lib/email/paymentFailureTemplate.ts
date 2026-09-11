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

export type PaymentFailureEmailPayload = {
  customerName: string;
  purchaseReference: string;
  planLabel: string | null;
  destinationLabel: string | null;
  amountLabel: string;
  currencyLabel: string;
  occurredAtLabel: string;
  walletFundsReturned: boolean;
  retryUrl: string;
};

export function renderPaymentFailureEmailHtml(
  payload: PaymentFailureEmailPayload
): string {
  const name = escapeHtml(payload.customerName || "Customer");
  const walletNote = payload.walletFundsReturned
    ? renderEmailNotice("Your reserved wallet funds have been returned.")
    : "";
  const rows = [
    renderEmailDetailRow("Reference", payload.purchaseReference),
    payload.destinationLabel
      ? renderEmailDetailRow("Destination", payload.destinationLabel)
      : "",
    payload.planLabel ? renderEmailDetailRow("Plan", payload.planLabel) : "",
    renderEmailDetailRow(
      "Amount attempted",
      `${payload.amountLabel} ${payload.currencyLabel}`
    ),
    renderEmailDetailRow("Date", payload.occurredAtLabel),
  ].join("");

  return renderTransactionalEmailLayoutHtml({
    title: `${BRAND_NAME} payment not completed`,
    preheader: "No new eSIM was created from this failed attempt.",
    contentHtml: `
              ${renderEmailHeading("Payment wasn’t completed")}
              ${renderEmailLead(
                `Hello ${name}, your ${escapeHtml(BRAND_NAME)} payment was not completed. No new eSIM was created from this failed attempt.`
              )}
              ${walletNote}
              ${renderEmailSummaryPanel("Attempt details", rows)}
              ${renderEmailParagraph(
                "You can return and retry checkout when you are ready."
              )}
              ${renderEmailCtaButton(payload.retryUrl, "Retry checkout")}
              ${renderEmailSupportBlock()}`,
  });
}

export function renderPaymentFailureEmailText(
  payload: PaymentFailureEmailPayload
): string {
  const lines = [
    `${BRAND_NAME}: payment wasn’t completed`,
    "",
    `Hello ${payload.customerName || "Customer"},`,
    "",
    "Your payment was not completed.",
    "No new eSIM was created from this failed attempt.",
  ];
  if (payload.walletFundsReturned) {
    lines.push("", "Your reserved wallet funds have been returned.");
  }
  lines.push("", `Reference: ${payload.purchaseReference}`);
  if (payload.destinationLabel) {
    lines.push(`Destination: ${payload.destinationLabel}`);
  }
  if (payload.planLabel) {
    lines.push(`Plan: ${payload.planLabel}`);
  }
  lines.push(
    `Amount attempted: ${payload.amountLabel} ${payload.currencyLabel}`,
    `Date: ${payload.occurredAtLabel}`,
    "",
    "You can return and retry checkout when you are ready.",
    `Retry checkout: ${payload.retryUrl}`,
    "",
    `Support: ${BRAND_SUPPORT_EMAIL}`,
    `Contact: ${BRAND_SITE_URL}/contact`,
    "",
    renderEmailFooterText()
  );
  return lines.join("\n");
}
