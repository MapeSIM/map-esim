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
import {
  lifecycleSubject,
  type EsimLifecycleKind,
} from "@/app/lib/esim/esimLifecycleNotificationShared";

export type EsimLifecycleEmailPayload = {
  kind: EsimLifecycleKind;
  customerName: string;
  destinationLabel: string | null;
  planLabel: string | null;
  expiryStatusLabel: string;
  expiryDateLabel: string | null;
  remainingDataLabel: string | null;
  myEsimUrl: string;
  buyAnotherUrl: string;
};

function headlineFor(kind: EsimLifecycleKind): string {
  switch (kind) {
    case "EXPIRY_SOON_24H":
      return "Your plan expires soon";
    case "EXPIRED":
      return "Your plan has expired";
    case "LOW_DATA":
      return "Your data is running low";
    case "DATA_EXHAUSTED":
      return "You’ve used all your data";
    default:
      return "Plan update";
  }
}

function bodyIntro(kind: EsimLifecycleKind, name: string): string {
  switch (kind) {
    case "EXPIRY_SOON_24H":
      return `Hello ${name}, your ${escapeHtml(BRAND_NAME)} plan is due to expire in about 24 hours.`;
    case "EXPIRED":
      return `Hello ${name}, your ${escapeHtml(BRAND_NAME)} plan has expired according to the provider usage record.`;
    case "LOW_DATA":
      return `Hello ${name}, your ${escapeHtml(BRAND_NAME)} plan has 10% or less data remaining.`;
    case "DATA_EXHAUSTED":
      return `Hello ${name}, your ${escapeHtml(BRAND_NAME)} plan has no remaining data according to the provider usage record.`;
    default:
      return `Hello ${name}, here is an update about your ${escapeHtml(BRAND_NAME)} plan.`;
  }
}

export function renderEsimLifecycleEmailHtml(
  payload: EsimLifecycleEmailPayload
): string {
  const name = escapeHtml(payload.customerName || "Customer");
  const rows = [
    payload.destinationLabel
      ? renderEmailDetailRow("Destination", payload.destinationLabel)
      : "",
    payload.planLabel ? renderEmailDetailRow("Plan", payload.planLabel) : "",
    renderEmailDetailRow("Status", payload.expiryStatusLabel),
    payload.expiryDateLabel
      ? renderEmailDetailRow("Expiry", payload.expiryDateLabel)
      : "",
    payload.remainingDataLabel
      ? renderEmailDetailRow("Data remaining", payload.remainingDataLabel)
      : "",
  ].join("");

  return renderTransactionalEmailLayoutHtml({
    title: lifecycleSubject(payload.kind),
    preheader: lifecycleSubject(payload.kind),
    contentHtml: `
              ${renderEmailHeading(headlineFor(payload.kind))}
              ${renderEmailLead(bodyIntro(payload.kind, name))}
              ${renderEmailSummaryPanel("Plan status", rows)}
              ${renderEmailCtaButton(payload.myEsimUrl, "View My eSIM")}
              <p style="margin:4px 0 0;font-size:14px;line-height:1.55;">
                ${renderEmailTextLink(payload.buyAnotherUrl, "Buy another plan")}
              </p>
              ${renderEmailSupportBlock()}`,
  });
}

export function renderEsimLifecycleEmailText(
  payload: EsimLifecycleEmailPayload
): string {
  const lines = [
    lifecycleSubject(payload.kind),
    "",
    `Hello ${payload.customerName || "Customer"},`,
    "",
  ];
  switch (payload.kind) {
    case "EXPIRY_SOON_24H":
      lines.push(
        `Your ${BRAND_NAME} plan is due to expire in about 24 hours.`
      );
      break;
    case "EXPIRED":
      lines.push(
        `Your ${BRAND_NAME} plan has expired according to the provider usage record.`
      );
      break;
    case "LOW_DATA":
      lines.push(
        `Your ${BRAND_NAME} plan has 10% or less data remaining.`
      );
      break;
    case "DATA_EXHAUSTED":
      lines.push(
        `Your ${BRAND_NAME} plan has no remaining data according to the provider usage record.`
      );
      break;
  }
  lines.push("");
  if (payload.destinationLabel) {
    lines.push(`Destination: ${payload.destinationLabel}`);
  }
  if (payload.planLabel) {
    lines.push(`Plan: ${payload.planLabel}`);
  }
  lines.push(`Status: ${payload.expiryStatusLabel}`);
  if (payload.expiryDateLabel) {
    lines.push(`Expiry: ${payload.expiryDateLabel}`);
  }
  if (payload.remainingDataLabel) {
    lines.push(`Data remaining: ${payload.remainingDataLabel}`);
  }
  lines.push(
    "",
    `View My eSIM: ${payload.myEsimUrl}`,
    `Buy another plan: ${payload.buyAnotherUrl}`,
    "",
    `Support: ${BRAND_SUPPORT_EMAIL}`,
    "",
    ...renderEmailFooterText().split("\n")
  );
  return lines.join("\n");
}
