import {
  BRAND_EMAIL_COPYRIGHT,
  BRAND_EMAIL_TAGLINE,
  BRAND_LOGO_ALT,
  BRAND_NAME,
  BRAND_SITE_HOST,
  BRAND_SITE_URL,
  BRAND_SUPPORT_EMAIL,
} from "@/app/lib/brand";
import type { EmailChannel } from "@/app/lib/email/channels";
import {
  EMAIL_LOGO_CID,
  resolveEmailLogoSrc,
} from "@/app/lib/email/logo";

export const BRAND_LIME = "#7CFF00";
export const BRAND_NAVY = "#020817";
export const BRAND_INK = "#06120a";
export const TEXT_PRIMARY = "#0d1524";
export const TEXT_SECONDARY = "#4b5d78";
export const BORDER = "#e2e8f0";
export const PAGE_BG = "#eef2f7";
export const CARD_BG = "#ffffff";
/** Display width for brand logo images in HTML emails (190–220px). */
export const EMAIL_LOGO_DISPLAY_WIDTH = 200;
/**
 * Intrinsic logo is 928×288 — keep height explicit for Outlook.
 * round(200 * 288 / 928) = 62
 */
export const EMAIL_LOGO_DISPLAY_HEIGHT = 62;
const EMAIL_LINK = "#2f6b00";
const EMAIL_FONT = "Segoe UI,Helvetica,Arial,sans-serif";

export { EMAIL_LOGO_CID };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Central reusable MAP eSIM email footer for every outgoing template.
 * Logo uses an absolute HTTPS URL (Gmail/Outlook compatible). CID attachment
 * may still be included by the transport as a fallback asset.
 *
 * Channel is accepted for call-site compatibility but does not change footer
 * content — From / Reply-To routing stays on sendChannelMail.
 */
export function renderEmailFooterHtml(
  _channel?: EmailChannel,
  logoSrc?: string
): string {
  const site = escapeHtml(BRAND_SITE_HOST);
  const siteUrl = escapeHtml(BRAND_SITE_URL);
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const logo = escapeHtml(resolveEmailLogoSrc(logoSrc));
  const contactUrl = escapeHtml(`${BRAND_SITE_URL}/contact`);

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:32px 0 0;border-top:1px solid ${BORDER};">
      <tr>
        <td style="padding:28px 0 0;font-family:${EMAIL_FONT};">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;">
            <tr>
              <td>
                <a href="${siteUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;border:0;outline:none;">
                  <img
                    src="${logo}"
                    width="${EMAIL_LOGO_DISPLAY_WIDTH}"
                    height="${EMAIL_LOGO_DISPLAY_HEIGHT}"
                    alt="${escapeHtml(BRAND_LOGO_ALT)}"
                    style="display:block;width:${EMAIL_LOGO_DISPLAY_WIDTH}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"
                  />
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 4px;font-size:16px;line-height:1.35;color:${TEXT_PRIMARY};font-weight:800;">
            ${escapeHtml(BRAND_NAME)}
          </p>
          <p style="margin:0 0 20px;font-size:13px;line-height:1.55;color:${TEXT_SECONDARY};font-weight:600;">
            ${escapeHtml(BRAND_EMAIL_TAGLINE)}
          </p>
          <p style="margin:0 0 8px;font-size:11px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;color:${TEXT_SECONDARY};font-weight:800;">
            Support
          </p>
          <p style="margin:0 0 6px;font-size:13px;line-height:1.55;color:${TEXT_SECONDARY};">
            <a href="mailto:${support}" style="color:${EMAIL_LINK};font-weight:700;text-decoration:underline;">${support}</a>
          </p>
          <p style="margin:0 0 6px;font-size:13px;line-height:1.55;color:${TEXT_SECONDARY};">
            Website:
            <a href="${siteUrl}" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_LINK};font-weight:700;text-decoration:underline;">${site}</a>
          </p>
          <p style="margin:0 0 20px;font-size:13px;line-height:1.55;color:${TEXT_SECONDARY};">
            <a href="${contactUrl}" target="_blank" rel="noopener noreferrer" style="color:${EMAIL_LINK};font-weight:700;text-decoration:underline;">${site}/contact</a>
          </p>
          <p style="margin:0;font-size:11px;line-height:1.55;color:${TEXT_SECONDARY};">
            ${escapeHtml(BRAND_EMAIL_COPYRIGHT)}
          </p>
        </td>
      </tr>
    </table>
  `;
}

export function renderEmailFooterText(_channel?: EmailChannel): string {
  return [
    BRAND_NAME,
    BRAND_EMAIL_TAGLINE,
    "",
    "Support",
    BRAND_SUPPORT_EMAIL,
    `Website: ${BRAND_SITE_URL}`,
    `${BRAND_SITE_URL}/contact`,
    "",
    BRAND_EMAIL_COPYRIGHT,
  ].join("\n");
}

/** @deprecated Prefer renderEmailFooterHtml */
export function renderChannelFooterHtml(channel: EmailChannel): string {
  return renderEmailFooterHtml(channel);
}

/** @deprecated Prefer renderEmailFooterText */
export function renderChannelFooterText(channel: EmailChannel): string {
  return renderEmailFooterText(channel);
}
