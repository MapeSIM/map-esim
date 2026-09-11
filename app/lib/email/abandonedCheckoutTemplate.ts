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
  renderEmailParagraph,
  renderEmailSummaryPanel,
  renderEmailSupportBlock,
} from "@/app/lib/email/emailUi";

export const ABANDONED_CHECKOUT_EMAIL_SUBJECT =
  "Finish your MAP eSIM checkout";

export type AbandonedCheckoutEmailPayload = {
  customerName: string;
  purchaseReference: string;
  planLabel: string | null;
  destinationLabel: string | null;
  amountLabel: string;
  currencyLabel: string;
  /** Absolute URL from customerPendingPurchaseHref + site origin. */
  resumeCheckoutUrl: string;
};

export function renderAbandonedCheckoutEmailHtml(
  payload: AbandonedCheckoutEmailPayload
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
    title: `${BRAND_NAME} finish checkout`,
    preheader: "Continue your eSIM purchase when you are ready.",
    contentHtml: `
              ${renderEmailHeading("You’re almost there!")}
              ${renderEmailLead(
                `Hello ${name}, you started a ${escapeHtml(BRAND_NAME)} eSIM purchase but didn’t finish checkout. No eSIM was created from this incomplete attempt.`
              )}
              ${renderEmailSummaryPanel("Checkout details", rows)}
              ${renderEmailParagraph(
                "Continue checkout when you are ready — your package selection is still available."
              )}
              ${renderEmailCtaButton(
                payload.resumeCheckoutUrl,
                "Continue checkout"
              )}
              ${renderEmailSupportBlock()}`,
  });
}

export function renderAbandonedCheckoutEmailText(
  payload: AbandonedCheckoutEmailPayload
): string {
  const lines = [
    `${BRAND_NAME}: finish your checkout`,
    "",
    `Hello ${payload.customerName || "Customer"},`,
    "",
    "You started an eSIM purchase but didn’t finish checkout.",
    "No eSIM was created from this incomplete attempt.",
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
    "Continue checkout when you are ready — your package selection is still available.",
    `Continue checkout: ${payload.resumeCheckoutUrl}`,
    "",
    `Support: ${BRAND_SUPPORT_EMAIL}`,
    `Contact: ${BRAND_SITE_URL}/contact`,
    "",
    renderEmailFooterText()
  );
  return lines.join("\n");
}
