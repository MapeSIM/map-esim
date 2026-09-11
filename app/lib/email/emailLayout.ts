import { BRAND_NAME } from "@/app/lib/brand";
import {
  BORDER,
  BRAND_INK,
  BRAND_LIME,
  CARD_BG,
  escapeHtml,
  PAGE_BG,
  renderEmailFooterHtml,
} from "@/app/lib/email/brand";
import { EMAIL_FONT_STACK } from "@/app/lib/email/emailUi";

const DEFAULT_MAX_WIDTH = 580;

export type TransactionalEmailLayoutOptions = {
  title: string;
  preheader?: string;
  /** Main body HTML inside the card (footer appended automatically). */
  contentHtml: string;
  maxWidth?: number;
  /** Banner label above the body. Defaults to MAP eSIM. */
  bannerLabel?: string;
  /**
   * Optional logo src for the shared footer (CID for Nodemailer, public URL for preview).
   * Defaults to the standard email logo CID.
   */
  footerLogoSrc?: string;
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
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(options.preheader)}</div>`
    : "";
  const footerHtml = renderEmailFooterHtml(
    undefined,
    options.footerLogoSrc
  );

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(options.title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${preheader}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${PAGE_BG};width:100%;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:28px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:${maxWidth}px;width:100%;background:${CARD_BG};border:1px solid ${BORDER};border-radius:16px;overflow:hidden;border-collapse:separate;">
          <tr>
            <td align="center" bgcolor="${BRAND_LIME}" style="background:${BRAND_LIME};padding:18px 22px;">
              <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:13px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_INK};">
                ${banner}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 24px;font-family:${EMAIL_FONT_STACK};">
              ${options.contentHtml}
              ${footerHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
