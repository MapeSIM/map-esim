import {
  BRAND_EMAIL_COPYRIGHT,
  BRAND_EMAIL_TAGLINE,
  BRAND_NAME,
  BRAND_SITE_HOST,
  BRAND_SITE_URL,
  BRAND_SUPPORT_EMAIL,
} from "@/app/lib/brand";
import type { EmailChannel } from "@/app/lib/email/channels";
import { EMAIL_LOGO_CID, getEmailLogoCidSrc } from "@/app/lib/email/logo";

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
 * Logo is CID-backed for Gmail/Outlook; text remains when images are blocked.
 *
 * Channel is accepted for call-site compatibility but does not change footer
 * content — From / Reply-To routing stays on sendChannelMail.
 */
export function renderEmailFooterHtml(
  _channel?: EmailChannel,
  logoSrc: string = getEmailLogoCidSrc()
): string {
  const site = escapeHtml(BRAND_SITE_HOST);
  const siteUrl = escapeHtml(BRAND_SITE_URL);
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const logo = escapeHtml(logoSrc);

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;border-top:1px solid ${BORDER};">
      <tr>
        <td style="padding:20px 0 0;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 14px;">
            <tr>
              <td>
                <a href="${siteUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;border:0;outline:none;">
                  <img
                    src="${logo}"
                    width="${EMAIL_LOGO_DISPLAY_WIDTH}"
                    alt="${escapeHtml(BRAND_NAME)}"
                    style="display:block;width:${EMAIL_LOGO_DISPLAY_WIDTH}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"
                  />
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 2px;font-size:15px;line-height:1.4;color:${TEXT_PRIMARY};font-weight:800;">
            ${escapeHtml(BRAND_NAME)}
          </p>
          <p style="margin:0 0 14px;font-size:13px;line-height:1.45;color:${TEXT_SECONDARY};font-weight:600;">
            ${escapeHtml(BRAND_EMAIL_TAGLINE)}
          </p>
          <p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:${TEXT_SECONDARY};">
            <a href="${siteUrl}" target="_blank" rel="noopener noreferrer" style="color:#2f6b00;text-decoration:underline;">${siteUrl}</a>
          </p>
          <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:${TEXT_SECONDARY};">
            <a href="mailto:${support}" style="color:#2f6b00;text-decoration:underline;">${support}</a>
          </p>
          <p style="margin:0;font-size:11px;line-height:1.5;color:${TEXT_SECONDARY};">
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
    BRAND_SITE_URL,
    BRAND_SUPPORT_EMAIL,
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
