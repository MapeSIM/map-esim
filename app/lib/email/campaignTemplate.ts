/**
 * MAP eSIM branded HTML/text for admin customer campaigns.
 * Display/send rendering only — does not call SMTP or change transactional templates.
 *
 * Layout variants are selected by templateKey. CLASSIC preserves the original
 * hero + features layout so existing campaigns keep rendering unchanged.
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
  EMAIL_NOTICE_BG,
  EMAIL_NOTICE_BORDER,
  EMAIL_SURFACE_MUTED,
  EMAIL_TEXT_ON_NAVY,
  renderEmailCtaButton,
  renderEmailSupportBlock,
} from "@/app/lib/email/emailUi";
import {
  parseEmailCampaignTemplateKey,
  sanitizeCampaignBody,
  sanitizeCampaignSubject,
  type EmailCampaignTemplateKey,
} from "@/app/lib/admin/emailCampaignShared";

const BUY_ESIM_HREF = `${BRAND_SITE_URL}/countries`;
const SUPPORT_HREF = `mailto:support@mapesim.com`;

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
  htmlBody: string,
  eyebrow: string
): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;width:100%;border-collapse:separate;">
  <tr>
    <td style="padding:20px 18px;border:1px solid ${BORDER};border-radius:14px;background:${CARD_BG};">
      <p style="margin:0 0 6px;font-family:${EMAIL_FONT_STACK};font-size:11px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:${TEXT_SECONDARY};">
        ${escapeHtml(eyebrow)}
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

function renderBrandIntroHtml(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;width:100%;">
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
</table>`;
}

function renderNavyBandHtml(options: {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
}): string {
  const cta =
    options.ctaLabel && options.ctaHref
      ? `<div style="margin-top:22px;">${renderEmailCtaButton(
          options.ctaHref,
          options.ctaLabel
        )}</div>`
      : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;width:100%;border-collapse:separate;">
  <tr>
    <td align="left" bgcolor="${BRAND_NAVY}" style="padding:26px 22px;border-radius:14px;background-color:${BRAND_NAVY};">
      <p style="margin:0 0 10px;font-family:${EMAIL_FONT_STACK};font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:${BRAND_LIME};">
        ${escapeHtml(options.eyebrow)}
      </p>
      <h1 style="margin:0 0 10px;font-family:${EMAIL_FONT_STACK};font-size:24px;line-height:1.25;font-weight:800;color:#ffffff;">
        ${escapeHtml(options.title)}
      </h1>
      <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:15px;line-height:1.55;font-weight:600;color:${EMAIL_TEXT_ON_NAVY};">
        ${escapeHtml(options.subtitle)}
      </p>
      ${cta}
    </td>
  </tr>
</table>`;
}

function renderClassicContentHtml(subject: string, htmlBody: string): string {
  return `
${renderBrandIntroHtml()}
${renderCampaignHeroHtml()}
${renderCampaignFeaturesHtml()}
${renderCampaignBodySectionHtml(subject, htmlBody, "Campaign update")}`;
}

function renderAnnouncementContentHtml(
  subject: string,
  htmlBody: string
): string {
  return `
${renderBrandIntroHtml()}
${renderNavyBandHtml({
  eyebrow: "Announcement",
  title: subject || "Update from MAP eSIM",
  subtitle: "A short message from the MAP eSIM team.",
})}
${renderCampaignBodySectionHtml(subject, htmlBody, "Message")}
${renderEmailSupportBlock()}`;
}

function renderOfferContentHtml(subject: string, htmlBody: string): string {
  return `
${renderBrandIntroHtml()}
${renderNavyBandHtml({
  eyebrow: "Special offer",
  title: subject || "Your eSIM offer",
  subtitle: "Save on travel data — browse destinations and activate in minutes.",
  ctaLabel: "Browse eSIM plans",
  ctaHref: BUY_ESIM_HREF,
})}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;width:100%;border-collapse:separate;">
  <tr>
    <td style="padding:14px 16px;border:1px solid ${EMAIL_NOTICE_BORDER};border-radius:12px;background:${EMAIL_NOTICE_BG};">
      <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_INK};">
        Limited-time promo
      </p>
      <p style="margin:8px 0 0;font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:1.55;color:${TEXT_SECONDARY};">
        Offer details are in the message below. Availability can change — check the site for current plans.
      </p>
    </td>
  </tr>
</table>
${renderCampaignBodySectionHtml(subject, htmlBody, "Offer details")}
${renderEmailSupportBlock()}`;
}

function renderAlertContentHtml(subject: string, htmlBody: string): string {
  return `
${renderBrandIntroHtml()}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;width:100%;border-collapse:separate;">
  <tr>
    <td style="padding:0;border-radius:14px;border:1px solid ${BORDER};overflow:hidden;background:${CARD_BG};">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
        <tr>
          <td width="6" bgcolor="${BRAND_LIME}" style="width:6px;background-color:${BRAND_LIME};font-size:0;line-height:0;">&nbsp;</td>
          <td style="padding:22px 20px;">
            <p style="margin:0 0 8px;font-family:${EMAIL_FONT_STACK};font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_INK};">
              Important update
            </p>
            <h1 style="margin:0 0 10px;font-family:${EMAIL_FONT_STACK};font-size:22px;line-height:1.3;font-weight:800;color:${TEXT_PRIMARY};">
              ${escapeHtml(subject || "Important update")}
            </h1>
            <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:1.55;color:${TEXT_SECONDARY};">
              Please read this service notice carefully.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
${renderCampaignBodySectionHtml(subject, htmlBody, "What you need to know")}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;width:100%;">
  <tr>
    <td style="padding:0;">
      <p style="margin:0 0 12px;font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:1.55;color:${TEXT_SECONDARY};">
        Need help? Contact
        <a href="${escapeHtml(SUPPORT_HREF)}" style="color:${BRAND_INK};font-weight:700;text-decoration:underline;">support@mapesim.com</a>.
      </p>
    </td>
  </tr>
</table>
${renderEmailSupportBlock()}`;
}

function renderTemplateContentHtml(
  templateKey: EmailCampaignTemplateKey,
  subject: string,
  htmlBody: string
): string {
  switch (templateKey) {
    case "ANNOUNCEMENT":
      return renderAnnouncementContentHtml(subject, htmlBody);
    case "OFFER":
      return renderOfferContentHtml(subject, htmlBody);
    case "ALERT":
      return renderAlertContentHtml(subject, htmlBody);
    case "CLASSIC":
    default:
      return renderClassicContentHtml(subject, htmlBody);
  }
}

export function renderCampaignEmailHtml(input: {
  subject: string;
  bodyText: string;
  templateKey?: string | null;
}): string {
  const subject = sanitizeCampaignSubject(input.subject);
  const body = sanitizeCampaignBody(input.bodyText);
  const htmlBody = escapeHtml(body).replace(/\n/g, "<br/>");
  const templateKey = parseEmailCampaignTemplateKey(input.templateKey);

  return renderTransactionalEmailLayoutHtml({
    title: subject || BRAND_NAME,
    preheader: subject || BRAND_TAGLINE,
    bannerLabel: BRAND_NAME,
    contentHtml: renderTemplateContentHtml(templateKey, subject, htmlBody),
  });
}

export function renderCampaignEmailText(input: {
  subject: string;
  bodyText: string;
  templateKey?: string | null;
}): string {
  const subject = sanitizeCampaignSubject(input.subject);
  const body = sanitizeCampaignBody(input.bodyText);
  const templateKey = parseEmailCampaignTemplateKey(input.templateKey);
  const featureLines = FEATURES.flatMap((f) => [`• ${f.title}: ${f.body}`]);

  if (templateKey === "CLASSIC") {
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

  const headline =
    templateKey === "OFFER"
      ? "Special offer"
      : templateKey === "ALERT"
        ? "Important update"
        : "Announcement";

  const lines = [BRAND_NAME, BRAND_TAGLINE, "", headline, subject, "", body, ""];
  if (templateKey === "OFFER") {
    lines.push(`Browse eSIM plans: ${BUY_ESIM_HREF}`, "");
  }
  if (templateKey === "ALERT") {
    lines.push("Need help? Contact support@mapesim.com", "");
  }
  lines.push(renderEmailFooterText());
  return lines.join("\n");
}
