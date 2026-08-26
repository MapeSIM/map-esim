import { BRAND_NAME } from "@/app/lib/brand";
import {
  BRAND_INK,
  BRAND_LIME,
  BORDER,
  CARD_BG,
  escapeHtml,
  PAGE_BG,
  renderEmailFooterHtml,
} from "@/app/lib/email/brand";

const DEFAULT_MAX_WIDTH = 560;
const FONT_STACK = "Segoe UI,Helvetica,Arial,sans-serif";

export type TransactionalEmailLayoutOptions = {
  title: string;
  preheader?: string;
  /** Main body HTML inside the card (footer appended automatically). */
  contentHtml: string;
  maxWidth?: number;
  /** Banner label above the body. Defaults to MAP eSIM. */
  bannerLabel?: string;
};

/**
 * Shared MAP eSIM transactional email shell: lime brand banner, card body,
 * and the unified branded footer (logo, tagline, site, support, copyright).
 */
export function renderTransactionalEmailLayoutHtml(
  options: TransactionalEmailLayoutOptions
): string {
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const banner = escapeHtml(options.bannerLabel ?? BRAND_NAME);
  const preheader = options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(options.preheader)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
  ${preheader}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${PAGE_BG};width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:${maxWidth}px;background:${CARD_BG};border:1px solid ${BORDER};">
          <tr>
            <td align="center" style="background:${BRAND_LIME};padding:22px 20px;">
              <p style="margin:0;font-family:${FONT_STACK};font-size:22px;font-weight:800;letter-spacing:0.02em;color:${BRAND_INK};">
                ${banner}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;font-family:${FONT_STACK};">
              ${options.contentHtml}
              ${renderEmailFooterHtml()}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
