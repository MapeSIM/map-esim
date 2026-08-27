import { BRAND_NAME, BRAND_SITE_URL, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";
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

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${TEXT_SECONDARY};width:42%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:${TEXT_PRIMARY};font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`;
}

function headlineFor(kind: EsimLifecycleKind): string {
  switch (kind) {
    case "EXPIRY_SOON_24H":
      return "Your plan expires soon";
    case "EXPIRED":
      return "Your plan has expired";
    case "LOW_DATA":
      return "Your data is running low";
    case "DATA_EXHAUSTED":
      return "Your data is used up";
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
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const destinationRow = payload.destinationLabel
    ? detailRow("Destination", payload.destinationLabel)
    : "";
  const planRow = payload.planLabel
    ? detailRow("Plan", payload.planLabel)
    : "";
  const expiryDateRow = payload.expiryDateLabel
    ? detailRow("Expiry", payload.expiryDateLabel)
    : "";
  const remainingRow = payload.remainingDataLabel
    ? detailRow("Data remaining", payload.remainingDataLabel)
    : "";

  return renderTransactionalEmailLayoutHtml({
    title: lifecycleSubject(payload.kind),
    preheader: lifecycleSubject(payload.kind),
    contentHtml: `
              <h1 style="margin:0 0 12px;font-size:22px;color:${TEXT_PRIMARY};font-weight:700;">
                ${escapeHtml(headlineFor(payload.kind))}
              </h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                ${bodyIntro(payload.kind, name)}
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
                ${destinationRow}
                ${planRow}
                ${detailRow("Status", payload.expiryStatusLabel)}
                ${expiryDateRow}
                ${remainingRow}
              </table>
              <p style="margin:18px 0 0;font-size:14px;line-height:1.55;">
                <a href="${escapeHtml(payload.myEsimUrl)}" style="color:#2f6b00;font-weight:700;text-decoration:underline;">View My eSIM</a>
                &nbsp;&nbsp;·&nbsp;&nbsp;
                <a href="${escapeHtml(payload.buyAnotherUrl)}" style="color:#2f6b00;font-weight:700;text-decoration:underline;">Buy another plan</a>
              </p>
              <p style="margin:18px 0 0;font-size:13px;line-height:1.55;color:${TEXT_SECONDARY};">
                Questions? Contact
                <a href="mailto:${support}" style="color:#2f6b00;text-decoration:underline;">${support}</a>
                or visit
                <a href="${escapeHtml(BRAND_SITE_URL)}/contact" style="color:#2f6b00;text-decoration:underline;">${escapeHtml(BRAND_SITE_URL.replace(/^https?:\/\//, ""))}/contact</a>.
              </p>`,
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
