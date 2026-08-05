import type { OrderEmailPayload } from "@/app/lib/email/types";
import { BRAND_NAME } from "@/app/lib/brand";
import {
  renderEmailFooterHtml,
  renderEmailFooterText,
} from "@/app/lib/email/brand";
import { getEmailLogoCidSrc } from "@/app/lib/email/logo";
import {
  formatDestinationHeadline,
  maskOrderReference,
} from "@/app/lib/email/format";
import { ESIM_QR_CID } from "@/app/lib/email/qr";

export type OrderEmailHtmlOptions = {
  /**
   * Image source for the scannable QR.
   * Nodemailer: `cid:${ESIM_QR_CID}`
   * Preview: `data:image/png;base64,...`
   * Omit when no valid QR should be shown.
   */
  qrImageSrc?: string;
  /**
   * Brand logo source. Nodemailer uses CID; preview may use `/brand/...`.
   */
  logoImageSrc?: string;
};

const BRAND_LIME = "#7CFF00";
const BRAND_NAVY = "#020817";
const BRAND_INK = "#06120a";
const TEXT_PRIMARY = "#0d1524";
const TEXT_SECONDARY = "#4b5d78";
const TEXT_ON_NAVY = "#C5D5E4";
const BORDER = "#e2e8f0";
const NOTICE_BG = "#f4ffe6";
const NOTICE_BORDER = "#b8e66b";
const PAGE_BG = "#eef2f7";
/** Display width for the horizontal brand logo in HTML emails (190–220px). */
const EMAIL_LOGO_WIDTH = 200;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function detailRow(label: string, value?: string): string {
  if (!value) return "";
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${TEXT_SECONDARY};font-size:13px;width:38%;vertical-align:top;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${TEXT_PRIMARY};font-size:14px;font-weight:600;word-break:break-word;overflow-wrap:anywhere;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
        ${escapeHtml(value)}
      </td>
    </tr>
  `;
}

function installQrSection(
  payload: OrderEmailPayload,
  qrImageSrc?: string
): string {
  const hasQrImage = Boolean(qrImageSrc);
  const hasManualFallbacks = Boolean(
    payload.smdpAddress ||
      payload.activationCode ||
      payload.qrValue ||
      payload.iccid
  );

  if (!hasQrImage && !hasManualFallbacks) {
    return "";
  }

  const qrImageBlock = hasQrImage
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
        <tr>
          <td align="center" style="padding:20px 16px;border:1px solid ${BORDER};background:#ffffff;">
            <p style="margin:0 0 14px;color:${TEXT_PRIMARY};font-size:16px;font-weight:700;line-height:1.3;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              Scan to install your eSIM
            </p>
            <img
              src="${escapeHtml(qrImageSrc!)}"
              width="280"
              height="280"
              alt="eSIM installation QR code"
              style="display:block;margin:0 auto;width:280px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"
            />
            <p style="margin:14px 0 0;color:${TEXT_SECONDARY};font-size:13px;line-height:1.5;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              Open your phone camera or eSIM installer and scan this code.
            </p>
          </td>
        </tr>
      </table>
    `
    : `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
        <tr>
          <td style="padding:14px 16px;border:1px solid ${BORDER};background:#f8fafc;">
            <p style="margin:0;color:${TEXT_PRIMARY};font-size:13px;line-height:1.55;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              A scannable QR code was not available for this order. Use the manual installation details below.
            </p>
          </td>
        </tr>
      </table>
    `;

  const downloadNotice = hasQrImage
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
        <tr>
          <td style="padding:14px 16px;border:1px solid ${NOTICE_BORDER};background:${NOTICE_BG};">
            <p style="margin:0 0 6px;color:${BRAND_INK};font-size:14px;font-weight:700;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              QR Code Download Available
            </p>
            <p style="margin:0;color:${TEXT_PRIMARY};font-size:13px;line-height:1.55;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              Download the attached QR image and save it securely to your photos before installation.
            </p>
          </td>
        </tr>
      </table>
    `
    : "";

  const deviceActions = deviceActionsSection(payload, hasQrImage);

  const fallbackRows = [
    detailRow("SM-DP+ address", payload.smdpAddress),
    detailRow("Activation code", payload.activationCode),
    detailRow("Complete LPA installation value", payload.qrValue),
    detailRow("ICCID", payload.iccid),
  ]
    .filter(Boolean)
    .join("");

  const fallbackBlock = fallbackRows
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
        <tr>
          <td style="padding:16px;border:1px solid ${BORDER};background:#f8fafc;">
            <p style="margin:0 0 8px;color:${TEXT_PRIMARY};font-size:14px;font-weight:700;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              Manual installation details
            </p>
            <p style="margin:0 0 12px;color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              If scanning is unavailable, enter these verified details manually on your device.
            </p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              ${fallbackRows}
            </table>
          </td>
        </tr>
      </table>
    `
    : "";

  return `${qrImageBlock}${deviceActions}${downloadNotice}${fallbackBlock}`;
}

function ctaButton(href: string, label: string, primary = true): string {
  const bg = primary ? BRAND_LIME : "#0d1524";
  const color = primary ? BRAND_INK : "#ffffff";
  const border = primary ? BRAND_LIME : "#0d1524";
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 10px;">
      <tr>
        <td align="center" bgcolor="${bg}" style="border-radius:10px;background-color:${bg};border:1px solid ${border};">
          <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 22px;color:${color};font-size:14px;font-weight:700;text-decoration:none;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function deviceActionsSection(
  payload: OrderEmailPayload,
  hasQrImage: boolean
): string {
  const iphoneUrl = payload.iphoneActivationUrl?.trim();
  const androidUrl = payload.androidActivationUrl?.trim();
  const androidGuideUrl = payload.androidGuideUrl?.trim();
  const iphoneGuideUrl = payload.iphoneGuideUrl?.trim();

  const hasIphoneButton = Boolean(iphoneUrl);
  const hasAndroidDirect = Boolean(androidUrl);

  if (
    !hasIphoneButton &&
    !hasQrImage &&
    !androidGuideUrl &&
    !iphoneGuideUrl &&
    !hasAndroidDirect
  ) {
    return "";
  }

  const iphoneBlock = hasIphoneButton
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;">
        <tr>
          <td align="center">
            ${ctaButton(iphoneUrl!, "Install on iPhone", true)}
            <p style="margin:0 0 8px;color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;text-align:center;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              On iOS 17.4 or later, tap the button and follow Apple’s confirmation steps.
            </p>
            <p style="margin:0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;text-align:center;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              Installation still requires the normal Apple Allow/Continue confirmation.
            </p>
          </td>
        </tr>
      </table>
    `
    : iphoneGuideUrl
      ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;">
        <tr>
          <td align="center" style="padding:14px 12px;border:1px solid ${BORDER};background:#f8fafc;">
            <p style="margin:0 0 10px;color:${TEXT_PRIMARY};font-size:14px;font-weight:700;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              iPhone installation
            </p>
            <p style="margin:0 0 12px;color:${TEXT_SECONDARY};font-size:12px;line-height:1.55;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              No official one-tap activation link was supplied for this order. Use the QR code below or the iPhone guide.
            </p>
            ${ctaButton(iphoneGuideUrl, "View iPhone Installation Guide", false)}
          </td>
        </tr>
      </table>
    `
      : "";

  const iphoneQrFallback = hasQrImage
    ? `
      <p style="margin:0 0 16px;color:${TEXT_SECONDARY};font-size:12px;line-height:1.55;text-align:center;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
        On iOS 17.4 or later, you can also press and hold the QR code in Mail or Safari and select Add eSIM.
      </p>
    `
    : "";

  let androidBlock = "";
  if (hasAndroidDirect) {
    androidBlock = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
        <tr>
          <td align="center">
            ${ctaButton(androidUrl!, "Install on Android", false)}
            <p style="margin:0;color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;text-align:center;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              Uses the official activation link supplied for this order. Android support varies by device and carrier app.
            </p>
          </td>
        </tr>
      </table>
    `;
  } else if (hasQrImage || androidGuideUrl) {
    androidBlock = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
        <tr>
          <td align="center" style="padding:14px 12px;border:1px solid ${BORDER};background:#f8fafc;">
            <p style="margin:0 0 10px;color:${TEXT_PRIMARY};font-size:14px;font-weight:700;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              Android installation
            </p>
            <p style="margin:0 0 12px;color:${TEXT_SECONDARY};font-size:12px;line-height:1.55;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              One-click Android installation is not universally available. Download the attached QR image, then follow the Android guide.
            </p>
            ${
              hasQrImage
                ? `<p style="margin:0 0 10px;color:${TEXT_PRIMARY};font-size:13px;font-weight:700;font-family:Segoe UI,Helvetica,Arial,sans-serif;">Download QR for Android</p>
                   <p style="margin:0 0 12px;color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;font-family:Segoe UI,Helvetica,Arial,sans-serif;">Use the downloadable PNG attached to this email.</p>`
                : ""
            }
            ${
              androidGuideUrl
                ? ctaButton(androidGuideUrl, "View Android Installation Guide", false)
                : ""
            }
          </td>
        </tr>
      </table>
    `;
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:16px;border:1px solid ${BORDER};background:#ffffff;">
          <p style="margin:0 0 14px;color:${TEXT_PRIMARY};font-size:14px;font-weight:700;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
            Device installation actions
          </p>
          ${iphoneBlock}
          ${iphoneQrFallback}
          ${androidBlock}
        </td>
      </tr>
    </table>
  `;
}

function planDetailsSection(payload: OrderEmailPayload): string {
  const rows = [
    detailRow("Destination", payload.destination),
    detailRow("Plan name", payload.planName),
    detailRow("Data allowance", payload.dataAllowance),
    detailRow("Validity", payload.validity),
    detailRow("Order ID", maskOrderReference(payload.orderId)),
  ]
    .filter(Boolean)
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:16px;border:1px solid ${BORDER};background:#ffffff;">
          <p style="margin:0 0 10px;color:${TEXT_PRIMARY};font-size:14px;font-weight:700;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
            Plan details
          </p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${rows}
          </table>
        </td>
      </tr>
    </table>
  `;
}

function howToInstallSection(hasQrImage: boolean): string {
  const steps = hasQrImage
    ? [
        "Download or save the attached QR code.",
        "iPhone: Settings → Cellular/Mobile Service → Add eSIM.",
        "Android: Settings → Network & Internet → SIMs → Add eSIM.",
        "Select “Use QR Code” and scan the saved image from another screen where required.",
        "Enable Data Roaming after arriving at the destination.",
      ]
    : [
        "Open your device settings and choose Add eSIM / Add mobile plan.",
        "iPhone: Settings → Cellular/Mobile Service → Add eSIM → Enter Details Manually.",
        "Android: Settings → Network & Internet → SIMs → Add eSIM → Enter SM-DP+ details.",
        "Enter the verified SM-DP+ address and activation code from this email.",
        "Enable Data Roaming after arriving at the destination.",
      ];

  const items = steps
    .map(
      (step, index) => `
      <tr>
        <td valign="top" width="28" style="padding:0 0 10px;color:${BRAND_INK};font-size:14px;font-weight:700;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
          ${index + 1}.
        </td>
        <td style="padding:0 0 10px;color:${TEXT_PRIMARY};font-size:13px;line-height:1.55;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
          ${escapeHtml(step)}
        </td>
      </tr>
    `
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:16px;border:1px solid ${BORDER};background:#ffffff;">
          <p style="margin:0 0 12px;color:${TEXT_PRIMARY};font-size:14px;font-weight:700;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
            How to Install
          </p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            ${items}
          </table>
        </td>
      </tr>
    </table>
  `;
}

function introCopy(hasQrImage: boolean): string {
  if (hasQrImage) {
    return "Your eSIM purchase was successful. Your installation QR code is included below and attached as a downloadable image.";
  }
  return "Your eSIM purchase was successful. Use the verified manual installation details below on your device.";
}

export function renderOrderEmailHtml(
  payload: OrderEmailPayload,
  options: OrderEmailHtmlOptions = {}
): string {
  const hasQrImage = Boolean(options.qrImageSrc);
  const installSection = installQrSection(payload, options.qrImageSrc);
  const destinationHeadline = formatDestinationHeadline(payload.destination);
  /** Preview: public `/brand/...` URL. Real mail: CID (default). */
  const logoSrc = escapeHtml(options.logoImageSrc || getEmailLogoCidSrc());
  const logoImg = `
                  <img
                    src="${logoSrc}"
                    width="${EMAIL_LOGO_WIDTH}"
                    alt="MAP eSIM"
                    style="display:block;margin:0 auto;width:${EMAIL_LOGO_WIDTH}px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"
                  />`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>Your eSIM is Ready! — ${BRAND_NAME}</title>
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
  <body style="margin:0;padding:0;background:${PAGE_BG};color:${TEXT_PRIMARY};font-family:Segoe UI,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${PAGE_BG}" style="background:${PAGE_BG};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid ${BORDER};">
            <tr>
              <td align="center" bgcolor="#ffffff" style="padding:28px 24px 22px;background-color:#ffffff;">
                ${logoImg}
              </td>
            </tr>
            <tr>
              <td height="3" bgcolor="${BRAND_LIME}" style="height:3px;line-height:3px;font-size:0;background-color:${BRAND_LIME};">&nbsp;</td>
            </tr>
            <tr>
              <td align="center" bgcolor="${BRAND_NAVY}" style="padding:28px 24px;background-color:${BRAND_NAVY};">
                <p style="margin:0 0 10px;color:${BRAND_LIME};font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
                  ${BRAND_NAME}
                </p>
                <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.2;font-weight:800;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
                  Your eSIM is Ready!
                </h1>
                <p style="margin:12px 0 0;color:${TEXT_ON_NAVY};font-size:16px;line-height:1.4;font-weight:600;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
                  ${escapeHtml(destinationHeadline)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px;background:#ffffff;">
                <p style="margin:0 0 20px;color:${TEXT_PRIMARY};font-size:14px;line-height:1.6;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
                  ${escapeHtml(introCopy(hasQrImage))}
                </p>
                ${installSection}
                ${planDetailsSection(payload)}
                ${howToInstallSection(hasQrImage)}
                ${
                  payload.orderAccessUrl
                    ? `
                <p style="margin:0 0 14px;color:${TEXT_PRIMARY};font-size:13px;line-height:1.55;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
                  Prefer the website?
                  <a href="${escapeHtml(payload.orderAccessUrl)}" style="color:#2f6b00;text-decoration:underline;">Open your secure order page</a>
                </p>`
                    : ""
                }
                ${renderEmailFooterHtml("orders", options.logoImageSrc || getEmailLogoCidSrc())}
                <p style="margin:16px 0 8px;color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
                  © 2026 ${BRAND_NAME}. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderOrderEmailText(
  payload: OrderEmailPayload,
  options: { hasQrAttachment?: boolean } = {}
): string {
  const destinationHeadline = formatDestinationHeadline(payload.destination);
  const hasQr = Boolean(options.hasQrAttachment);
  const lines = [
    `${BRAND_NAME} — Your eSIM is Ready!`,
    destinationHeadline,
    "",
    introCopy(hasQr),
    "",
    "Plan details",
    `Destination: ${payload.destination}`,
    `Plan name: ${payload.planName}`,
    `Data allowance: ${payload.dataAllowance}`,
    `Validity: ${payload.validity}`,
    `Order ID: ${maskOrderReference(payload.orderId)}`,
  ];

  lines.push("", "Device installation actions");
  if (payload.iphoneActivationUrl) {
    lines.push(
      "Install on iPhone: use the official activation button/link in the HTML email.",
      "On iOS 17.4 or later, tap the button and follow Apple’s confirmation steps."
    );
  } else if (payload.iphoneGuideUrl) {
    lines.push(`View iPhone Installation Guide: ${payload.iphoneGuideUrl}`);
  }
  if (hasQr) {
    lines.push(
      "On iOS 17.4 or later, you can also press and hold the QR code in Mail or Safari and select Add eSIM.",
      "Download QR for Android: use the downloadable PNG attached to this email."
    );
  }
  if (payload.androidActivationUrl) {
    lines.push(
      "An official Android activation link is included in the HTML email for this order."
    );
  } else if (payload.androidGuideUrl) {
    lines.push(`View Android Installation Guide: ${payload.androidGuideUrl}`);
  }

  if (payload.smdpAddress || payload.activationCode || payload.qrValue || payload.iccid) {
    lines.push("", "Manual installation details");
    if (payload.smdpAddress) lines.push(`SM-DP+ address: ${payload.smdpAddress}`);
    if (payload.activationCode) {
      lines.push(`Activation code: ${payload.activationCode}`);
    }
    if (payload.qrValue) {
      lines.push(`Complete LPA installation value: ${payload.qrValue}`);
    }
    if (payload.iccid) lines.push(`ICCID: ${payload.iccid}`);
  }

  lines.push("", "How to Install");
  if (hasQr) {
    lines.push(
      "1. Download or save the attached QR code.",
      "2. iPhone: Settings → Cellular/Mobile Service → Add eSIM.",
      "3. Android: Settings → Network & Internet → SIMs → Add eSIM.",
      "4. Select “Use QR Code” and scan the saved image from another screen where required.",
      "5. Enable Data Roaming after arriving at the destination."
    );
  } else {
    lines.push(
      "1. Open your device settings and choose Add eSIM / Add mobile plan.",
      "2. iPhone: Settings → Cellular/Mobile Service → Add eSIM → Enter Details Manually.",
      "3. Android: Settings → Network & Internet → SIMs → Add eSIM → Enter SM-DP+ details.",
      "4. Enter the verified SM-DP+ address and activation code from this email.",
      "5. Enable Data Roaming after arriving at the destination."
    );
  }

  if (payload.orderAccessUrl) {
    lines.push("", `Secure order page: ${payload.orderAccessUrl}`);
  }

  lines.push(
    "",
    renderEmailFooterText("orders"),
    `© 2026 ${BRAND_NAME}. All rights reserved.`
  );

  return lines.join("\n");
}

/** Sanitized sample used only by the development preview route. */
export function getSampleOrderEmailPayload(
  options: { withOfficialIphoneLink?: boolean } = {}
): OrderEmailPayload {
  const base: OrderEmailPayload = {
    customerEmail: "customer@example.com",
    orderId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    destination: "Pakistan",
    planName: "Pakistan 1GB / 7 Days",
    dataAllowance: "1 GB",
    validity: "7 Days",
    iccid: "8900000000000000001",
    smdpAddress: "smdp.example.invalid",
    activationCode: "SAMPLE-ACTIVATION-CODE",
    qrValue: "LPA:1$smdp.example.invalid$SAMPLE-ACTIVATION-CODE",
    androidGuideUrl: "https://mapesim.com/install/android",
    iphoneGuideUrl: "https://mapesim.com/install/iphone",
    orderAccessUrl:
      "https://mapesim.com/success?orderId=a1b2c3d4-e5f6-7890-abcd-ef1234567890&access=sample-opaque-token",
  };

  if (options.withOfficialIphoneLink) {
    // Sample official Apple host URL for layout preview only — not from client params.
    base.iphoneActivationUrl =
      "https://esimsetup.apple.com/esim_qrcode_provisioning";
  }

  return base;
}

export { ESIM_QR_CID };
