import {
  BRAND_LOGO_ALT,
  BRAND_NAME,
  BRAND_SITE_HOST,
  BRAND_SITE_URL,
  BRAND_SUPPORT_EMAIL,
  BRAND_TAGLINE,
} from "@/app/lib/brand";
import type { EmailChannel } from "@/app/lib/email/channels";
import { EMAIL_CHANNELS } from "@/app/lib/email/channels";
import { EMAIL_LOGO_CID, getEmailLogoCidSrc } from "@/app/lib/email/logo";

export const BRAND_LIME = "#7cff00";
export const BRAND_INK = "#06120a";
export const TEXT_PRIMARY = "#0d1524";
export const TEXT_SECONDARY = "#4b5d78";
export const BORDER = "#e2e8f0";
export const PAGE_BG = "#eef2f7";
export const CARD_BG = "#ffffff";

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
 * Central reusable transactional email footer.
 * Logo is CID-backed for Gmail/Outlook; text remains when images are blocked.
 */
export function renderEmailFooterHtml(
  channel: EmailChannel,
  logoSrc: string = getEmailLogoCidSrc()
): string {
  const def = EMAIL_CHANNELS[channel];
  const site = escapeHtml(BRAND_SITE_HOST);
  const support = escapeHtml(BRAND_SUPPORT_EMAIL);
  const channelName = escapeHtml(def.displayName);
  const channelMail = escapeHtml(def.mailbox);
  const logo = escapeHtml(logoSrc);
  const alt = escapeHtml(BRAND_LOGO_ALT);

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;border-top:1px solid ${BORDER};">
      <tr>
        <td style="padding:20px 0 0;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 14px;">
            <tr>
              <td>
                <a href="${BRAND_SITE_URL}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;border:0;outline:none;">
                  <img
                    src="${logo}"
                    width="200"
                    alt="${alt}"
                    style="display:block;width:200px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"
                  />
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 2px;font-size:15px;line-height:1.4;color:${TEXT_PRIMARY};font-weight:800;">
            ${escapeHtml(BRAND_NAME)}
          </p>
          <p style="margin:0 0 14px;font-size:13px;line-height:1.45;color:${TEXT_SECONDARY};font-weight:600;">
            ${escapeHtml(BRAND_TAGLINE)}
          </p>
          <p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:${TEXT_SECONDARY};">
            Website:
            <a href="${BRAND_SITE_URL}" target="_blank" rel="noopener noreferrer" style="color:#2f6b00;text-decoration:underline;">${site}</a>
          </p>
          <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:${TEXT_SECONDARY};">
            Customer Support:
            <a href="mailto:${support}" style="color:#2f6b00;text-decoration:underline;">${support}</a>
          </p>
          <p style="margin:0 0 2px;font-size:12px;line-height:1.5;color:${TEXT_PRIMARY};font-weight:700;">
            ${channelName}
          </p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:${TEXT_SECONDARY};">
            <a href="mailto:${channelMail}" style="color:#2f6b00;text-decoration:underline;">${channelMail}</a>
          </p>
        </td>
      </tr>
    </table>
  `;
}

export function renderEmailFooterText(channel: EmailChannel): string {
  const def = EMAIL_CHANNELS[channel];
  return [
    BRAND_NAME,
    BRAND_TAGLINE,
    "",
    `Website: ${BRAND_SITE_URL}`,
    `Customer Support: ${BRAND_SUPPORT_EMAIL}`,
    "",
    def.displayName,
    def.mailbox,
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
