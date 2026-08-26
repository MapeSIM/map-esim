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

export type PartnerRefundStatusEmailKind =
  | "received"
  | "under_review"
  | "approved_pending_execution"
  | "rejected"
  | "completed";

export type PartnerRefundStatusEmailPayload = {
  kind: PartnerRefundStatusEmailKind;
  partnerName: string;
  purchaseReference: string;
  amountLabel: string;
  currencyLabel: string;
  ordersUrl: string;
  eventAtLabel: string;
  /** Exact Partner MAP Wallet credit for completed emails. */
  walletCreditedLabel?: string;
  /** Optional admin decision note (rejected only; already sanitized). */
  decisionNote?: string;
};

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${TEXT_SECONDARY};width:42%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:${TEXT_PRIMARY};font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

function headlineFor(kind: PartnerRefundStatusEmailKind): string {
  switch (kind) {
    case "received":
      return "Partner refund request received";
    case "under_review":
      return "Partner refund request under review";
    case "approved_pending_execution":
      return "Partner refund approved — pending wallet credit";
    case "rejected":
      return "Partner refund request not approved";
    case "completed":
      return "Partner refund completed";
  }
}

function introFor(
  kind: PartnerRefundStatusEmailKind,
  name: string,
  walletCreditedLabel?: string
): string {
  switch (kind) {
    case "received":
      return `Hello ${name}, we received your ${BRAND_NAME} Partner refund request. Our team will review it. This is not confirmation that a refund has been approved or that Partner MAP Wallet funds have been credited.`;
    case "under_review":
      return `Hello ${name}, your ${BRAND_NAME} Partner refund request is now under review. This update only confirms review has started — no Partner MAP Wallet credit has been issued yet.`;
    case "approved_pending_execution":
      return `Hello ${name}, your ${BRAND_NAME} Partner refund request has been approved. Funds have NOT been credited to your Partner MAP Wallet yet. You will receive a separate completed notice when the wallet credit is applied.`;
    case "rejected":
      return `Hello ${name}, your ${BRAND_NAME} Partner refund request was reviewed and was not approved. If you need help, contact support using the details below.`;
    case "completed":
      return `Hello ${name}, your ${BRAND_NAME} Partner refund has been completed. ${walletCreditedLabel || "The approved amount"} was credited to your Partner MAP Wallet.`;
  }
}

function subjectFor(kind: PartnerRefundStatusEmailKind): string {
  switch (kind) {
    case "received":
      return "We received your MAP eSIM Partner refund request";
    case "under_review":
      return "Your MAP eSIM Partner refund request is under review";
    case "approved_pending_execution":
      return "Your MAP eSIM Partner refund is approved — funds not credited yet";
    case "rejected":
      return "Update on your MAP eSIM Partner refund request";
    case "completed":
      return "Your MAP eSIM Partner refund is completed — MAP Wallet credited";
  }
}

export function partnerRefundStatusEmailSubject(
  kind: PartnerRefundStatusEmailKind
): string {
  return subjectFor(kind);
}

export function renderPartnerRefundStatusEmailHtml(
  payload: PartnerRefundStatusEmailPayload
): string {
  const name = escapeHtml(payload.partnerName || "Partner");
  const footer = renderEmailFooterHtml("billing");
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const headline = escapeHtml(headlineFor(payload.kind));
  const intro = escapeHtml(
    introFor(
      payload.kind,
      payload.partnerName || "Partner",
      payload.walletCreditedLabel
    )
  );

  const caution =
    payload.kind === "completed"
      ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${TEXT_PRIMARY};font-weight:600;">
          Partner MAP Wallet credited: ${escapeHtml(payload.walletCreditedLabel || payload.amountLabel)} ${escapeHtml(payload.currencyLabel)}.
        </p>`
      : payload.kind === "approved_pending_execution"
        ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${TEXT_PRIMARY};font-weight:600;">
            This is not a refund-completed notice. Partner MAP Wallet funds have NOT been credited yet.
          </p>`
        : payload.kind === "received" || payload.kind === "under_review"
          ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${TEXT_PRIMARY};font-weight:600;">
              No Partner refund has been completed yet. No Partner MAP Wallet funds have been moved.
            </p>`
          : "";

  const noteBlock =
    payload.kind === "rejected" && (payload.decisionNote || "").trim()
      ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${TEXT_SECONDARY};">
          Decision note: ${escapeHtml(payload.decisionNote!.trim())}
        </p>`
      : "";

  const amountRowLabel =
    payload.kind === "completed"
      ? "Partner MAP Wallet credited"
      : "Requested Partner charge";
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
              ${noteBlock}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
                ${detailRow("Purchase reference", payload.purchaseReference)}
                ${detailRow(amountRowLabel, amountRowValue)}
                ${detailRow("Date", payload.eventAtLabel)}
              </table>
              <p style="margin:16px 0 0;font-size:14px;line-height:1.55;">
                <a href="${escapeHtml(payload.ordersUrl)}" style="color:#2f6b00;font-weight:700;text-decoration:underline;">View Partner orders</a>
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

export function renderPartnerRefundStatusEmailText(
  payload: PartnerRefundStatusEmailPayload
): string {
  const name = payload.partnerName || "Partner";
  const lines = [
    `${BRAND_NAME}: ${headlineFor(payload.kind)}`,
    "",
    introFor(payload.kind, name, payload.walletCreditedLabel),
    "",
  ];
  if (payload.kind === "received" || payload.kind === "under_review") {
    lines.push(
      "No Partner refund has been completed yet. No Partner MAP Wallet funds have been moved.",
      ""
    );
  }
  if (payload.kind === "approved_pending_execution") {
    lines.push(
      "This is not a refund-completed notice. Partner MAP Wallet funds have NOT been credited yet.",
      ""
    );
  }
  if (payload.kind === "completed") {
    lines.push(
      `Partner MAP Wallet credited: ${payload.walletCreditedLabel || payload.amountLabel} ${payload.currencyLabel}`,
      ""
    );
  }
  if (payload.kind === "rejected" && (payload.decisionNote || "").trim()) {
    lines.push(`Decision note: ${payload.decisionNote!.trim()}`, "");
  }
  lines.push(
    `Purchase reference: ${payload.purchaseReference}`,
    payload.kind === "completed"
      ? `Partner MAP Wallet credited: ${payload.walletCreditedLabel || payload.amountLabel} ${payload.currencyLabel}`
      : `Requested Partner charge: ${payload.amountLabel} ${payload.currencyLabel}`,
    `Date: ${payload.eventAtLabel}`,
    "",
    `View Partner orders: ${payload.ordersUrl}`,
    "",
    `Questions? Contact ${BRAND_SUPPORT_EMAIL} or visit ${BRAND_SITE_URL}/contact.`,
    "",
    renderEmailFooterText("billing")
  );
  return lines.join("\n");
}
