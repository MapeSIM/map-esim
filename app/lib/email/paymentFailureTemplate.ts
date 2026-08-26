import { BRAND_NAME, BRAND_SITE_URL, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";

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

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${TEXT_SECONDARY};width:42%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:${TEXT_PRIMARY};font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

export function renderPaymentFailureEmailHtml(
  payload: PaymentFailureEmailPayload
): string {
  const name = escapeHtml(payload.customerName || "Customer");
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const walletNote = payload.walletFundsReturned
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_PRIMARY};font-weight:600;">
        Your reserved wallet funds have been returned.
      </p>`
    : "";
  const planRow = payload.planLabel
    ? detailRow("Plan", payload.planLabel)
    : "";
  const destinationRow = payload.destinationLabel
    ? detailRow("Destination", payload.destinationLabel)
    : "";

  return renderTransactionalEmailLayoutHtml({
    title: `${BRAND_NAME} payment not completed`,
    contentHtml: `
              <h1 style="margin:0 0 12px;font-size:22px;color:${TEXT_PRIMARY};font-weight:700;">
                Payment wasn’t completed
              </h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                Hello ${name}, your ${escapeHtml(BRAND_NAME)} payment was not completed.
                No new eSIM was created from this failed attempt.
              </p>
              ${walletNote}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
                ${detailRow("Reference", payload.purchaseReference)}
                ${destinationRow}
                ${planRow}
                ${detailRow("Amount attempted", `${payload.amountLabel} ${payload.currencyLabel}`)}
                ${detailRow("Date", payload.occurredAtLabel)}
              </table>
              <p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:${TEXT_SECONDARY};">
                You can return and retry checkout when you are ready.
              </p>
              <p style="margin:16px 0 0;font-size:14px;line-height:1.55;">
                <a href="${escapeHtml(payload.retryUrl)}" style="color:#2f6b00;font-weight:700;text-decoration:underline;">Retry checkout</a>
              </p>
              <p style="margin:18px 0 0;font-size:13px;line-height:1.55;color:${TEXT_SECONDARY};">
                Questions? Contact
                <a href="mailto:${support}" style="color:#2f6b00;text-decoration:underline;">${support}</a>
                or visit
                <a href="${escapeHtml(BRAND_SITE_URL)}/contact" style="color:#2f6b00;text-decoration:underline;">${escapeHtml(BRAND_SITE_URL.replace(/^https?:\/\//, ""))}/contact</a>.
              </p>`,
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
  lines.push(
    "",
    `Reference: ${payload.purchaseReference}`
  );
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
