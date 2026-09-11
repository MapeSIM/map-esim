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
  renderEmailSummaryPanel,
  renderEmailSupportBlock,
} from "@/app/lib/email/emailUi";

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
  const intro = escapeHtml(
    introFor(
      payload.kind,
      payload.customerName || "Customer",
      payload.walletCreditedLabel
    )
  );

  const caution =
    payload.kind === "completed"
      ? renderEmailNotice(
          `MAP Wallet credited: ${escapeHtml(payload.walletCreditedLabel || payload.amountLabel)} ${escapeHtml(payload.currencyLabel)}. No Simpaisa / original-payment refund was issued by this notice.`,
          { title: "Refund completed" }
        )
      : payload.kind === "approved_pending_execution"
        ? renderEmailNotice(
            "This is not a refund-completed notice. Actual funds have not yet been returned."
          )
        : payload.kind === "received" || payload.kind === "under_review"
          ? renderEmailNotice(
              "No refund has been completed yet. No funds have been moved."
            )
          : "";

  const amountRowLabel =
    payload.kind === "completed" ? "MAP Wallet credited" : "Requested amount";
  const amountRowValue =
    payload.kind === "completed"
      ? `${payload.walletCreditedLabel || payload.amountLabel} ${payload.currencyLabel}`
      : `${payload.amountLabel} ${payload.currencyLabel}`;

  const rows = [
    renderEmailDetailRow("Order reference", payload.orderReference),
    renderEmailDetailRow(amountRowLabel, amountRowValue),
    renderEmailDetailRow("Date", payload.requestedAtLabel),
  ].join("");

  return renderTransactionalEmailLayoutHtml({
    title: `${BRAND_NAME} ${headlineFor(payload.kind)}`,
    preheader: subjectFor(payload.kind),
    contentHtml: `
              ${renderEmailHeading(headlineFor(payload.kind))}
              ${renderEmailLead(intro)}
              ${caution}
              ${renderEmailSummaryPanel("Refund details", rows)}
              ${renderEmailCtaButton(payload.orderUrl, "View your order")}
              ${renderEmailSupportBlock()}`,
  });
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
    renderEmailFooterText()
  );
  return lines.join("\n");
}
