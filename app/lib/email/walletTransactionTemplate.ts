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
  renderEmailSummaryPanel,
  renderEmailSupportBlock,
  renderEmailTextLink,
} from "@/app/lib/email/emailUi";

export type WalletTransactionEmailPayload = {
  customerName: string;
  transactionTypeLabel: string;
  amountLabel: string;
  currencyLabel: string;
  description: string;
  orderReference: string | null;
  orderUrl: string | null;
  transactionReference: string;
  previousBalanceLabel: string;
  newBalanceLabel: string;
  occurredAtLabel: string;
  walletUrl: string;
};

export function renderWalletTransactionEmailHtml(
  payload: WalletTransactionEmailPayload
): string {
  const name = escapeHtml(payload.customerName || "Customer");
  const rows = [
    renderEmailDetailRow("Transaction type", payload.transactionTypeLabel),
    renderEmailDetailRow(
      "Amount",
      `${payload.amountLabel} ${payload.currencyLabel}`
    ),
    renderEmailDetailRow("Description", payload.description),
    payload.orderReference
      ? renderEmailDetailRow("Related order", payload.orderReference)
      : "",
    renderEmailDetailRow(
      "Transaction reference",
      payload.transactionReference
    ),
    renderEmailDetailRow("Previous balance", payload.previousBalanceLabel),
    renderEmailDetailRow("New balance", payload.newBalanceLabel),
    renderEmailDetailRow("Date", payload.occurredAtLabel),
  ].join("");

  const orderLink =
    payload.orderUrl != null
      ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.55;">
          ${renderEmailTextLink(payload.orderUrl, "View related order")}
        </p>`
      : "";

  return renderTransactionalEmailLayoutHtml({
    title: `${BRAND_NAME} wallet update`,
    preheader: `${payload.transactionTypeLabel} · ${payload.amountLabel} ${payload.currencyLabel}`,
    contentHtml: `
              ${renderEmailHeading(payload.transactionTypeLabel)}
              ${renderEmailLead(
                `Hello ${name}, here is a summary of your ${escapeHtml(BRAND_NAME)} wallet activity.`
              )}
              ${renderEmailSummaryPanel("Transaction summary", rows)}
              ${renderEmailCtaButton(payload.walletUrl, "View your wallet")}
              ${orderLink}
              ${renderEmailSupportBlock()}`,
  });
}

export function renderWalletTransactionEmailText(
  payload: WalletTransactionEmailPayload
): string {
  const lines = [
    `${BRAND_NAME}: ${payload.transactionTypeLabel}`,
    "",
    `Hello ${payload.customerName || "Customer"},`,
    "",
    "Here is a summary of your wallet activity.",
    "",
    `Transaction type: ${payload.transactionTypeLabel}`,
    `Amount: ${payload.amountLabel} ${payload.currencyLabel}`,
    `Description: ${payload.description}`,
  ];
  if (payload.orderReference) {
    lines.push(`Related order: ${payload.orderReference}`);
  }
  lines.push(
    `Transaction reference: ${payload.transactionReference}`,
    `Previous balance: ${payload.previousBalanceLabel}`,
    `New balance: ${payload.newBalanceLabel}`,
    `Date: ${payload.occurredAtLabel}`,
    "",
    `View your wallet: ${payload.walletUrl}`
  );
  if (payload.orderUrl) {
    lines.push(`View related order: ${payload.orderUrl}`);
  }
  lines.push(
    "",
    `Support: ${BRAND_SUPPORT_EMAIL}`,
    `Contact: ${BRAND_SITE_URL}/contact`,
    "",
    renderEmailFooterText()
  );
  return lines.join("\n");
}
