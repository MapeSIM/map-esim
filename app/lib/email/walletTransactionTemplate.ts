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

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${TEXT_SECONDARY};width:42%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:${TEXT_PRIMARY};font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

export function renderWalletTransactionEmailHtml(
  payload: WalletTransactionEmailPayload
): string {
  const name = escapeHtml(payload.customerName || "Customer");
  const footer = renderEmailFooterHtml("billing");
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const orderBlock = payload.orderReference
    ? detailRow("Related order", payload.orderReference)
    : "";
  const orderLink =
    payload.orderUrl != null
      ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;">
          <a href="${escapeHtml(payload.orderUrl)}" style="color:#2f6b00;font-weight:700;text-decoration:underline;">View related order</a>
        </p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(BRAND_NAME)} wallet update</title>
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
                Wallet balance update
              </h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                Hello ${name}, your ${escapeHtml(BRAND_NAME)} wallet balance has changed.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
                ${detailRow("Transaction type", payload.transactionTypeLabel)}
                ${detailRow("Amount", `${payload.amountLabel} ${payload.currencyLabel}`)}
                ${detailRow("Description", payload.description)}
                ${orderBlock}
                ${detailRow("Transaction reference", payload.transactionReference)}
                ${detailRow("Previous balance", payload.previousBalanceLabel)}
                ${detailRow("New balance", payload.newBalanceLabel)}
                ${detailRow("Date", payload.occurredAtLabel)}
              </table>
              <p style="margin:16px 0 0;font-size:14px;line-height:1.55;">
                <a href="${escapeHtml(payload.walletUrl)}" style="color:#2f6b00;font-weight:700;text-decoration:underline;">View your wallet</a>
              </p>
              ${orderLink}
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

export function renderWalletTransactionEmailText(
  payload: WalletTransactionEmailPayload
): string {
  const lines = [
    `${BRAND_NAME} wallet balance update`,
    "",
    `Hello ${payload.customerName || "Customer"},`,
    "",
    "Your wallet balance has changed.",
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
    renderEmailFooterText("billing")
  );
  return lines.join("\n");
}
