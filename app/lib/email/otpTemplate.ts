import { BRAND_NAME } from "@/app/lib/brand";
import {
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";

export type OtpEmailKind =
  | "signup"
  | "password_reset"
  | "account_deletion"
  | "admin_invite"
  | "partner_invite";

function copyForKind(kind: OtpEmailKind): {
  subject: string;
  headline: string;
  introLines: string[];
  ignore: string;
  preheader: string;
} {
  if (kind === "partner_invite") {
    return {
      subject: `Set up your ${BRAND_NAME} Partner account`,
      headline: "Partner account setup code",
      introLines: [
        `You have been invited to become a ${BRAND_NAME} partner.`,
        "Use this one-time code to set your password and activate your partner account.",
      ],
      ignore:
        "If you were not expecting this partner invitation, you can ignore this email.",
      preheader: `Your ${BRAND_NAME} partner account setup code expires in 10 minutes.`,
    };
  }
  if (kind === "admin_invite") {
    return {
      subject: `Set up your ${BRAND_NAME} Admin account`,
      headline: "Admin account setup code",
      introLines: [
        `You have been invited to become a ${BRAND_NAME} administrator.`,
        "Use this one-time code to set your password and activate your administrator account.",
      ],
      ignore:
        "If you were not expecting this administrator invitation, you can ignore this email.",
      preheader: `Your ${BRAND_NAME} admin account setup code expires in 10 minutes.`,
    };
  }
  if (kind === "password_reset") {
    return {
      subject: `Your ${BRAND_NAME} password reset code`,
      headline: "Password reset code",
      introLines: [
        `Use this one-time code to reset your ${BRAND_NAME} password. It expires in 10 minutes.`,
      ],
      ignore: "Ignore this email if you did not request it.",
      preheader: `Your ${BRAND_NAME} verification code expires in 10 minutes.`,
    };
  }
  if (kind === "account_deletion") {
    return {
      subject: `Confirm ${BRAND_NAME} account deletion`,
      headline: "Confirm account deletion",
      introLines: [
        `Use this one-time code to confirm deletion of your ${BRAND_NAME} account. It expires in 10 minutes.`,
      ],
      ignore: "Ignore this email if you did not request it.",
      preheader: `Your ${BRAND_NAME} verification code expires in 10 minutes.`,
    };
  }
  return {
    subject: `Verify your ${BRAND_NAME} email`,
    headline: "Verify your email",
    introLines: [
      `Welcome to ${BRAND_NAME}. Enter this one-time code to verify your email. It expires in 10 minutes.`,
    ],
    ignore: "Ignore this email if you did not request it.",
    preheader: `Your ${BRAND_NAME} verification code expires in 10 minutes.`,
  };
}

export function renderOtpEmailHtml(options: {
  kind: OtpEmailKind;
  code: string;
  recipientEmail: string;
}): string {
  const copy = copyForKind(options.kind);
  const code = escapeHtml(options.code);
  const email = escapeHtml(options.recipientEmail);
  const introHtml = copy.introLines
    .map(
      (line, index) =>
        `<p style="margin:0 0 ${
          index === copy.introLines.length - 1 ? "20" : "10"
        }px;font-size:15px;line-height:1.55;color:${TEXT_SECONDARY};">${escapeHtml(
          line
        )}</p>`
    )
    .join("\n              ");

  const contentHtml = `
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${TEXT_PRIMARY};font-weight:700;">
                ${escapeHtml(copy.headline)}
              </h1>
              ${introHtml}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
                <tr>
                  <td align="center" style="background:#f4ffe6;border:1px solid #b8e66b;padding:22px 12px;">
                    <p style="margin:0;font-family:Consolas,Courier New,monospace;font-size:36px;line-height:1.2;letter-spacing:0.28em;font-weight:700;color:${TEXT_PRIMARY};">
                      ${code}
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:${TEXT_PRIMARY};font-weight:600;">
                This code expires in 10 minutes.
              </p>
              <p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:${TEXT_SECONDARY};">
                Sent to ${email}. ${escapeHtml(copy.ignore)}
              </p>
              <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${TEXT_SECONDARY};">
                For your security, ${escapeHtml(BRAND_NAME)} will never ask for your password or installation codes by email.
              </p>`;

  return renderTransactionalEmailLayoutHtml({
    title: copy.subject,
    preheader: copy.preheader,
    contentHtml,
  });
}

export function renderOtpEmailText(options: {
  kind: OtpEmailKind;
  code: string;
  recipientEmail: string;
}): string {
  const copy = copyForKind(options.kind);
  return [
    BRAND_NAME,
    "",
    copy.headline,
    ...copy.introLines,
    "",
    `Code: ${options.code}`,
    "",
    "This code expires in 10 minutes.",
    `Sent to ${options.recipientEmail}.`,
    copy.ignore,
    "",
    renderEmailFooterText(),
  ].join("\n");
}

export function otpEmailSubject(kind: OtpEmailKind): string {
  return copyForKind(kind).subject;
}
