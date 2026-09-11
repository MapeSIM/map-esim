/**
 * Shared presentation helpers for MAP eSIM transactional emails.
 * UI only — no send/trigger/business logic.
 */
import { BRAND_SITE_URL, BRAND_SUPPORT_EMAIL } from "@/app/lib/brand";
import {
  BORDER,
  BRAND_INK,
  BRAND_LIME,
  BRAND_NAVY,
  escapeHtml,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";

export const EMAIL_FONT_STACK = "Segoe UI,Helvetica,Arial,sans-serif";
export const EMAIL_LINK = "#2f6b00";
export const EMAIL_SURFACE_MUTED = "#f8fafc";
export const EMAIL_NOTICE_BG = "#f4ffe6";
export const EMAIL_NOTICE_BORDER = "#b8e66b";
export const EMAIL_TEXT_ON_NAVY = "#C5D5E4";

/** Primary page heading inside the email card. */
export function renderEmailHeading(text: string): string {
  return `<h1 style="margin:0 0 14px;font-family:${EMAIL_FONT_STACK};font-size:24px;line-height:1.25;color:${TEXT_PRIMARY};font-weight:800;">
  ${escapeHtml(text)}
</h1>`;
}

/** Lead / intro paragraph under the heading. */
export function renderEmailLead(htmlOrEscapedText: string): string {
  return `<p style="margin:0 0 20px;font-family:${EMAIL_FONT_STACK};font-size:15px;line-height:1.65;color:${TEXT_SECONDARY};">
  ${htmlOrEscapedText}
</p>`;
}

/** Plain body paragraph (already-escaped or trusted HTML fragments). */
export function renderEmailParagraph(
  htmlOrEscapedText: string,
  options?: { emphasize?: boolean; marginBottom?: number }
): string {
  const mb = options?.marginBottom ?? 16;
  const weight = options?.emphasize ? "600" : "400";
  const color = options?.emphasize ? TEXT_PRIMARY : TEXT_SECONDARY;
  return `<p style="margin:0 0 ${mb}px;font-family:${EMAIL_FONT_STACK};font-size:15px;line-height:1.65;color:${color};font-weight:${weight};">
  ${htmlOrEscapedText}
</p>`;
}

/** Label / value row for summary tables. */
export function renderEmailDetailRow(label: string, value: string): string {
  return `<tr>
  <td style="padding:10px 0;border-bottom:1px solid ${BORDER};font-family:${EMAIL_FONT_STACK};font-size:13px;line-height:1.45;color:${TEXT_SECONDARY};width:38%;vertical-align:top;">
    ${escapeHtml(label)}
  </td>
  <td style="padding:10px 0;border-bottom:1px solid ${BORDER};font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:1.45;color:${TEXT_PRIMARY};font-weight:600;word-break:break-word;overflow-wrap:anywhere;vertical-align:top;">
    ${escapeHtml(value)}
  </td>
</tr>`;
}

/**
 * Bordered summary card. Pass joined detail rows (empty rows filtered by caller).
 */
export function renderEmailSummaryPanel(
  title: string,
  rowsHtml: string,
  options?: { intro?: string }
): string {
  if (!rowsHtml.trim()) return "";
  const intro = options?.intro
    ? `<p style="margin:0 0 12px;font-family:${EMAIL_FONT_STACK};font-size:13px;line-height:1.55;color:${TEXT_SECONDARY};">${escapeHtml(options.intro)}</p>`
    : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;">
  <tr>
    <td style="padding:18px 16px;border:1px solid ${BORDER};border-radius:12px;background:${EMAIL_SURFACE_MUTED};">
      <p style="margin:0 0 12px;font-family:${EMAIL_FONT_STACK};font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${TEXT_SECONDARY};">
        ${escapeHtml(title)}
      </p>
      ${intro}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${rowsHtml}
      </table>
    </td>
  </tr>
</table>`;
}

/** Soft callout / notice strip. */
export function renderEmailNotice(
  htmlOrEscapedText: string,
  options?: { title?: string }
): string {
  const title = options?.title
    ? `<p style="margin:0 0 6px;font-family:${EMAIL_FONT_STACK};font-size:14px;font-weight:700;color:${BRAND_INK};">${escapeHtml(options.title)}</p>`
    : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
  <tr>
    <td style="padding:14px 16px;border:1px solid ${EMAIL_NOTICE_BORDER};border-radius:12px;background:${EMAIL_NOTICE_BG};">
      ${title}
      <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:1.6;color:${TEXT_PRIMARY};">
        ${htmlOrEscapedText}
      </p>
    </td>
  </tr>
</table>`;
}

/** Primary / secondary CTA button (bulletproof table). */
export function renderEmailCtaButton(
  href: string,
  label: string,
  options?: { primary?: boolean; fullWidth?: boolean }
): string {
  const primary = options?.primary !== false;
  const bg = primary ? BRAND_LIME : BRAND_NAVY;
  const color = primary ? BRAND_INK : "#ffffff";
  const border = primary ? BRAND_LIME : BRAND_NAVY;
  const widthAttr = options?.fullWidth ? ' width="100%"' : "";
  const aDisplay = options?.fullWidth
    ? "display:block;text-align:center;"
    : "display:inline-block;";
  return `<table role="presentation"${widthAttr} cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
  <tr>
    <td align="center" bgcolor="${bg}" style="border-radius:12px;background-color:${bg};border:1px solid ${border};">
      <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="${aDisplay}padding:14px 24px;font-family:${EMAIL_FONT_STACK};font-size:14px;font-weight:800;line-height:1.2;color:${color};text-decoration:none;">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>`;
}

/** Text link styled consistently (for secondary actions). */
export function renderEmailTextLink(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_LINK};font-weight:700;text-decoration:underline;">${escapeHtml(label)}</a>`;
}

/** Standard support / contact footer block above brand footer. */
export function renderEmailSupportBlock(): string {
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const contactHost = escapeHtml(
    BRAND_SITE_URL.replace(/^https?:\/\//, "")
  );
  return `<p style="margin:22px 0 0;font-family:${EMAIL_FONT_STACK};font-size:13px;line-height:1.6;color:${TEXT_SECONDARY};">
  Questions? Contact
  <a href="mailto:${support}" style="color:${EMAIL_LINK};text-decoration:underline;">${support}</a>
  or visit
  <a href="${escapeHtml(BRAND_SITE_URL)}/contact" style="color:${EMAIL_LINK};text-decoration:underline;">${contactHost}/contact</a>.
</p>`;
}

/** Compact navy highlight band for install / milestone emails. */
export function renderEmailHeroBand(options: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}): string {
  const eyebrow = options.eyebrow
    ? `<p style="margin:0 0 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_LIME};">${escapeHtml(options.eyebrow)}</p>`
    : "";
  const subtitle = options.subtitle
    ? `<p style="margin:12px 0 0;font-family:${EMAIL_FONT_STACK};font-size:15px;line-height:1.45;font-weight:600;color:${EMAIL_TEXT_ON_NAVY};">${escapeHtml(options.subtitle)}</p>`
    : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;">
  <tr>
    <td align="center" bgcolor="${BRAND_NAVY}" style="padding:26px 20px;border-radius:12px;background-color:${BRAND_NAVY};">
      ${eyebrow}
      <h1 style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:26px;line-height:1.2;font-weight:800;color:#ffffff;">
        ${escapeHtml(options.title)}
      </h1>
      ${subtitle}
    </td>
  </tr>
</table>`;
}
