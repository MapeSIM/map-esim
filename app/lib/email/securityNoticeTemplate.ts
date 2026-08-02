import { BRAND_NAME } from "@/app/lib/brand";
import {
  BRAND_INK,
  BRAND_LIME,
  BORDER,
  CARD_BG,
  escapeHtml,
  PAGE_BG,
  renderEmailFooterHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";

export function renderPasswordChangedEmailHtml(recipientEmail: string): string {
  const email = escapeHtml(recipientEmail);
  const footer = renderEmailFooterHtml("security");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your ${escapeHtml(BRAND_NAME)} password was changed</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${PAGE_BG};width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:${CARD_BG};border:1px solid ${BORDER};">
          <tr>
            <td align="center" style="background:${BRAND_LIME};padding:22px 20px;">
              <p style="margin:0;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;color:${BRAND_INK};">
                ${escapeHtml(BRAND_NAME)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              <h1 style="margin:0 0 12px;font-size:22px;color:${TEXT_PRIMARY};font-weight:700;">
                Password changed
              </h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                The password for ${email} was changed successfully.
              </p>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:${TEXT_PRIMARY};">
                If you did not make this change, reset your password immediately and contact support.
              </p>
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderPasswordChangedEmailText(recipientEmail: string): string {
  return [
    BRAND_NAME,
    "",
    "Password changed",
    `The password for ${recipientEmail} was changed successfully.`,
    "If you did not make this change, reset your password immediately and contact support.",
    "",
    renderEmailFooterText("security"),
  ].join("\n");
}

export function renderAccountDeletedEmailHtml(recipientEmail: string): string {
  const email = escapeHtml(recipientEmail);
  const footer = renderEmailFooterHtml("security");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your ${escapeHtml(BRAND_NAME)} account was deleted</title>
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${PAGE_BG};width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:${CARD_BG};border:1px solid ${BORDER};">
          <tr>
            <td align="center" style="background:${BRAND_LIME};padding:22px 20px;">
              <p style="margin:0;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:22px;font-weight:800;color:${BRAND_INK};">
                ${escapeHtml(BRAND_NAME)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              <h1 style="margin:0 0 12px;font-size:22px;color:${TEXT_PRIMARY};font-weight:700;">
                Account deleted
              </h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">
                The ${escapeHtml(BRAND_NAME)} account for ${email} has been permanently deleted.
              </p>
              <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:${TEXT_PRIMARY};">
                Past eSIM purchases remain available through your original secure order links. If you did not request this, contact support immediately.
              </p>
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderAccountDeletedEmailText(recipientEmail: string): string {
  return [
    BRAND_NAME,
    "",
    "Account deleted",
    `The ${BRAND_NAME} account for ${recipientEmail} has been permanently deleted.`,
    "Past eSIM purchases remain available through your original secure order links. If you did not request this, contact support immediately.",
    "",
    renderEmailFooterText("security"),
  ].join("\n");
}
