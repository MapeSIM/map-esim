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

export type RefundStatusEmailKind =
  | "received"
  | "under_review"
  | "approved_pending_execution"
  | "rejected"
  | "completed";

export type RefundStatusEmailPayload = {
  kind: RefundStatusEmailKind;
  customerName: string;
  orderReference: string;
  amountLabel: string;
  currencyLabel: string;
  orderUrl: string;
  requestedAtLabel: string;
  /** Exact MAP Wallet credit for completed emails. */
  walletCreditedLabel?: string;
};

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${TEXT_SECONDARY};width:42%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:${TEXT_PRIMARY};font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

function headlineFor(kind: RefundStatusEmailKind): string {
  switch (kind) {
    case "received":
      return "Refund request received";
    case "under_review":
      return "Refund request under review";
    case "approved_pending_execution":
      return "Refund approved — pending execution";
    case "rejected":
      return "Refund request not approved";
    case "completed":
      return "Refund completed";
  }
}

function introFor(
  kind: RefundStatusEmailKind,
  name: string,
  walletCreditedLabel?: string
): string {
  switch (kind) {
    case "received":
      return `Hello ${name}, we received your ${BRAND_NAME} refund request. Our team will review it. This is not confirmation that a refund has been approved or issued.`;
    case "under_review":
      return `Hello ${name}, your ${BRAND_NAME} refund request is now under review by our team. This update only confirms review has started — no refund has been completed yet.`;
    case "approved_pending_execution":
      return `Hello ${name}, your ${BRAND_NAME} refund request has been approved. Actual funds have not yet been returned. When execution completes, you will receive a separate refund-completed notice with the MAP Wallet credit amount.`;
    case "rejected":
      return `Hello ${name}, your ${BRAND_NAME} refund request was reviewed and was not approved. If you need help, contact support using the details below.`;
    case "completed":
      return `Hello ${name}, your ${BRAND_NAME} refund has been completed. ${walletCreditedLabel || "The approved amount"} was credited to your MAP Wallet. This is not a Simpaisa or original-payment refund.`;
  }
}

function subjectFor(kind: RefundStatusEmailKind): string {
  switch (kind) {
    case "received":
      return "We received your MAP eSIM refund request";
    case "under_review":
      return "Your MAP eSIM refund request is under review";
    case "approved_pending_execution":
      return "Your MAP eSIM refund is approved — funds not returned yet";
    case "rejected":
      return "Update on your MAP eSIM refund request";
    case "completed":
      return "Your MAP eSIM refund is completed — MAP Wallet credited";
  }
}

export function refundStatusEmailSubject(kind: RefundStatusEmailKind): string {
  return subjectFor(kind);
}

export function renderRefundStatusEmailHtml(
  payload: RefundStatusEmailPayload
): string {
  const name = escapeHtml(payload.customerName || "Customer");
  const footer = renderEmailFooterHtml("billing");
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const headline = escapeHtml(headlineFor(payload.kind));
  const intro = escapeHtml(
    introFor(
      payload.kind,
      payload.customerName || "Customer",
      payload.walletCreditedLabel
    )
  );

  const caution =
    payload.kind === "completed"
      ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${TEXT_PRIMARY};font-weight:600;">
          MAP Wallet credited: ${escapeHtml(payload.walletCreditedLabel || payload.amountLabel)} ${escapeHtml(payload.currencyLabel)}.
          No Simpaisa / original-payment refund was issued by this notice.
        </p>`
      : payload.kind === "approved_pending_execution"
      ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${TEXT_PRIMARY};font-weight:600;">
          This is not a refund-completed notice. Actual funds have not yet been returned.
        </p>`
      : payload.kind === "received" || payload.kind === "under_review"
        ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${TEXT_PRIMARY};font-weight:600;">
            No refund has been completed yet. No funds have been moved.
          </p>`
        : "";

  const amountRowLabel =
    payload.kind === "completed" ? "MAP Wallet credited" : "Requested amount";
  const amountRowValue =
    payload.kind === "completed"
      ? `${payload.walletCreditedLabel || payload.amountLabel} ${payload.currencyLabel}`
      : `${payload.amountLabel} ${payload.currencyLabel}`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(BRAND_NAME)} ${headline}</title>
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
                ${headline}
              </h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                ${intro}
              </p>
              ${caution}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
                ${detailRow("Order reference", payload.orderReference)}
                ${detailRow(amountRowLabel, amountRowValue)}
                ${detailRow("Date", payload.requestedAtLabel)}
              </table>
              <p style="margin:16px 0 0;font-size:14px;line-height:1.55;">
                <a href="${escapeHtml(payload.orderUrl)}" style="color:#2f6b00;font-weight:700;text-decoration:underline;">View your order</a>
              </p>
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

export function renderRefundStatusEmailText(
  payload: RefundStatusEmailPayload
): string {
  const name = payload.customerName || "Customer";
  const lines = [
    `${BRAND_NAME}: ${headlineFor(payload.kind)}`,
    "",
    introFor(payload.kind, name, payload.walletCreditedLabel),
    "",
  ];
  if (payload.kind === "received" || payload.kind === "under_review") {
    lines.push(
      "No refund has been completed yet. No funds have been moved.",
      ""
    );
  }
  if (payload.kind === "approved_pending_execution") {
    lines.push(
      "This is not a refund-completed notice. Actual funds have not yet been returned.",
      ""
    );
  }
  if (payload.kind === "completed") {
    lines.push(
      `MAP Wallet credited: ${payload.walletCreditedLabel || payload.amountLabel} ${payload.currencyLabel}`,
      "No Simpaisa / original-payment refund was issued by this notice.",
      ""
    );
  }
  lines.push(
    `Order reference: ${payload.orderReference}`,
    payload.kind === "completed"
      ? `MAP Wallet credited: ${payload.walletCreditedLabel || payload.amountLabel} ${payload.currencyLabel}`
      : `Requested amount: ${payload.amountLabel} ${payload.currencyLabel}`,
    `Date: ${payload.requestedAtLabel}`,
    "",
    `View your order: ${payload.orderUrl}`,
    "",
    `Questions? Contact ${BRAND_SUPPORT_EMAIL} or visit ${BRAND_SITE_URL}/contact.`,
    "",
    renderEmailFooterText("billing")
  );
  return lines.join("\n");
}
