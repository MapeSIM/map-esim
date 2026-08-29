/**
 * VeSIM provider refund-review email template (Admin-triggered).
 * May include full ICCID in the email body for provider review.
 * Never import into client components with live ICCID payloads.
 */

import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";

export type VesimRefundReviewEmailPayload = {
  mapOrderId: string;
  providerOrderId: string;
  /** Full ICCID — email body only; never log or put in audit metadata. */
  iccid: string;
  destination: string;
  planName: string;
  purchaseDateLabel: string;
  refundReasonLabel: string;
  requestedAmountLabel: string;
  orderStatusLabel: string;
  usageSummary: string;
  adminNote: string | null;
};

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${TEXT_SECONDARY};width:42%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:${TEXT_PRIMARY};font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

export function vesimRefundReviewEmailSubject(mapOrderId: string): string {
  const id = mapOrderId.trim() || "—";
  return `Refund Review Request – MAP eSIM Order #${id}`;
}

export function renderVesimRefundReviewEmailText(
  payload: VesimRefundReviewEmailPayload
): string {
  const adminNote = (payload.adminNote ?? "").trim() || "None";
  return [
    "Hi VeSIM Team,",
    "",
    "Please review the following customer refund request and confirm provider-side refund eligibility/cancellation status.",
    "",
    `MAP eSIM Order ID: ${payload.mapOrderId}`,
    `VeSIM Order Reference: ${payload.providerOrderId}`,
    `ICCID: ${payload.iccid}`,
    `Destination: ${payload.destination}`,
    `Package / Plan: ${payload.planName}`,
    `Purchase Date: ${payload.purchaseDateLabel}`,
    `Refund Reason: ${payload.refundReasonLabel}`,
    `Requested Refund Amount: ${payload.requestedAmountLabel}`,
    `Current Order / eSIM Status: ${payload.orderStatusLabel}`,
    `Usage Summary: ${payload.usageSummary}`,
    `Admin Note: ${adminNote}`,
    "",
    "Please confirm whether this eSIM is eligible for refund/cancellation and advise the next step.",
    "",
    "Regards,",
    "MAP eSIM Billing / Support",
    "",
    renderEmailFooterText("billing"),
  ].join("\n");
}

export function renderVesimRefundReviewEmailHtml(
  payload: VesimRefundReviewEmailPayload
): string {
  const adminNote = (payload.adminNote ?? "").trim() || "None";
  const bodyHtml = `
<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${TEXT_PRIMARY};">
  Hi VeSIM Team,
</p>
<p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:${TEXT_SECONDARY};">
  Please review the following customer refund request and confirm provider-side
  refund eligibility/cancellation status.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 18px;">
  ${detailRow("MAP eSIM Order ID", payload.mapOrderId)}
  ${detailRow("VeSIM Order Reference", payload.providerOrderId)}
  ${detailRow("ICCID", payload.iccid)}
  ${detailRow("Destination", payload.destination)}
  ${detailRow("Package / Plan", payload.planName)}
  ${detailRow("Purchase Date", payload.purchaseDateLabel)}
  ${detailRow("Refund Reason", payload.refundReasonLabel)}
  ${detailRow("Requested Refund Amount", payload.requestedAmountLabel)}
  ${detailRow("Current Order / eSIM Status", payload.orderStatusLabel)}
  ${detailRow("Usage Summary", payload.usageSummary)}
  ${detailRow("Admin Note", adminNote)}
</table>
<p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:${TEXT_SECONDARY};">
  Please confirm whether this eSIM is eligible for refund/cancellation and advise the next step.
</p>
<p style="margin:0;font-size:14px;line-height:1.55;color:${TEXT_PRIMARY};">
  Regards,<br />MAP eSIM Billing / Support
</p>`;

  return renderTransactionalEmailLayoutHtml({
    title: "Refund review request",
    preheader: `Refund review for MAP order ${payload.mapOrderId}`,
    contentHtml: bodyHtml,
  });
}
