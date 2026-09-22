/**
 * MAP eSIM branded HTML/text for admin customer campaigns.
 * Display/send rendering only — does not call SMTP or change transactional templates.
 *
 * Visual redesign is campaign-local: shared layout shell + footer stay unchanged.
 * Admin bodyText remains plain text (escaped); no raw HTML and no merge tags.
 */

import { BRAND_NAME, BRAND_SITE_URL, BRAND_TAGLINE } from "@/app/lib/brand";
import {
  BORDER,
  BRAND_INK,
  BRAND_LIME,
  BRAND_NAVY,
  CARD_BG,
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";
import {
  EMAIL_FONT_STACK,
  EMAIL_SURFACE_MUTED,
  EMAIL_TEXT_ON_NAVY,
} from "@/app/lib/email/emailUi";
import {
  sanitizeCampaignBody,
  sanitizeCampaignSubject,
} from "@/app/lib/admin/emailCampaignShared";

const BUY_ESIM_HREF = `${BRAND_SITE_URL}/countries`;

const FEATURES = [
  {
    title: "Global Coverage",
    body: "Stay online in 200+ destinations with local and regional eSIM plans.",
  },
  {
    title: "Instant Activation",
    body: "Buy in minutes, install by QR, and connect as soon as you land.",
  },
  {
    title: "Affordable Data Plans",
    body: "Transparent pricing with flexible data packs built for travel.",
  },
] as const;

function renderCampaignFeatureCard(title: string, body: string): string {
  return `<td width="33.33%" valign="top" style="padding:6px;width:33.33%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;">
    <tr>
      <td style="padding:16px 14px;border:1px solid ${BORDER};border-radius:12px;background:${EMAIL_SURFACE_MUTED};">
        <p style="margin:0 0 8px;font-family:${EMAIL_FONT_STACK};font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:${BRAND_INK};">
          <span style="display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:999px;background:${BRAND_LIME};vertical-align:middle;"></span>
          ${escapeHtml(title)}
        </p>
        <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:13px;line-height:1.55;color:${TEXT_SECONDARY};">
          ${escapeHtml(body)}
        </p>
      </td>
    </tr>
  </table>
</td>`;
}

function renderCampaignHeroHtml(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;width:100%;border-collapse:separate;">
  <tr>
    <td align="center" bgcolor="${BRAND_NAVY}" style="padding:28px 22px;border-radius:14px;background-color:${BRAND_NAVY};">
      <p style="margin:0 0 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND_LIME};">
        Travel connectivity
      </p>
      <h1 style="margin:0 0 12px;font-family:${EMAIL_FONT_STACK};font-size:26px;line-height:1.2;font-weight:800;color:#ffffff;">
        Stay connected wherever you go
      </h1>
      <p style="margin:0 0 22px;font-family:${EMAIL_FONT_STACK};font-size:15px;line-height:1.55;font-weight:600;color:${EMAIL_TEXT_ON_NAVY};">
        Premium eSIM data for modern travel — fast setup, global coverage, no physical SIM swaps.
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
        <tr>
          <td align="center" bgcolor="${BRAND_LIME}" style="border-radius:12px;background-color:${BRAND_LIME};border:1px solid ${BRAND_LIME};">
            <a href="${escapeHtml(BUY_ESIM_HREF)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 26px;font-family:${EMAIL_FONT_STACK};font-size:14px;font-weight:800;line-height:1.2;color:${BRAND_INK};text-decoration:none;">
              Buy eSIM Now
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function renderCampaignFeaturesHtml(): string {
  const cards = FEATURES.map((f) =>
    renderCampaignFeatureCard(f.title, f.body)
  ).join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;width:100%;">
  <tr>
    <td style="padding:0 0 12px;">
      <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${TEXT_SECONDARY};">
        Why travelers choose ${escapeHtml(BRAND_NAME)}
      </p>
    </td>
  </tr>
  <tr>
    ${cards}
  </tr>
</table>`;
}

function renderCampaignBodySectionHtml(
  subject: string,
  htmlBody: string
): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;width:100%;border-collapse:separate;">
  <tr>
    <td style="padding:20px 18px;border:1px solid ${BORDER};border-radius:14px;background:${CARD_BG};">
      <p style="margin:0 0 6px;font-family:${EMAIL_FONT_STACK};font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:${TEXT_SECONDARY};">
        Campaign update
      </p>
      <p style="margin:0 0 14px;font-family:${EMAIL_FONT_STACK};font-size:20px;line-height:1.3;font-weight:800;color:${TEXT_PRIMARY};">
        ${escapeHtml(subject)}
      </p>
      <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:15px;line-height:1.65;color:${TEXT_SECONDARY};">
        ${htmlBody}
      </p>
    </td>
  </tr>
</table>`;
}

export function renderCampaignEmailHtml(input: {
  subject: string;
  bodyText: string;
}): string {
  const subject = sanitizeCampaignSubject(input.subject);
  const body = sanitizeCampaignBody(input.bodyText);
  const htmlBody = escapeHtml(body).replace(/\n/g, "<br/>");

  return renderTransactionalEmailLayoutHtml({
    title: subject || BRAND_NAME,
    preheader: subject || BRAND_TAGLINE,
    bannerLabel: BRAND_NAME,
    contentHtml: `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;width:100%;">
  <tr>
    <td style="padding:0 0 4px;">
      <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:12px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_INK};">
        ${escapeHtml(BRAND_NAME)}
      </p>
      <p style="margin:8px 0 0;font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:1.5;color:${TEXT_SECONDARY};">
        ${escapeHtml(BRAND_TAGLINE)}
      </p>
    </td>
  </tr>
</table>
${renderCampaignHeroHtml()}
${renderCampaignFeaturesHtml()}
${renderCampaignBodySectionHtml(subject, htmlBody)}`,
  });
}

export function renderCampaignEmailText(input: {
  subject: string;
  bodyText: string;
}): string {
  const subject = sanitizeCampaignSubject(input.subject);
  const body = sanitizeCampaignBody(input.bodyText);
  const featureLines = FEATURES.flatMap((f) => [
    `• ${f.title}: ${f.body}`,
  ]);
  return [
    BRAND_NAME,
    BRAND_TAGLINE,
    "",
    "Stay connected wherever you go",
    "Premium eSIM data for modern travel — fast setup, global coverage, no physical SIM swaps.",
    `Buy eSIM Now: ${BUY_ESIM_HREF}`,
    "",
    "Why travelers choose MAP eSIM",
    ...featureLines,
    "",
    subject,
    "",
    body,
    "",
    renderEmailFooterText(),
  ].join("\n");
}
