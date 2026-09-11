import type { OrderEmailPayload } from "@/app/lib/email/types";
import { BRAND_NAME } from "@/app/lib/brand";
import {
  BORDER,
  BRAND_INK,
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
  renderEmailCtaButton,
  renderEmailDetailRow,
  renderEmailHeroBand,
  renderEmailLead,
  renderEmailNotice,
  renderEmailParagraph,
  renderEmailSummaryPanel,
  renderEmailSupportBlock,
  renderEmailTextLink,
} from "@/app/lib/email/emailUi";
import { resolveEmailLogoSrc } from "@/app/lib/email/logo";
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

function optionalDetailRow(label: string, value?: string): string {
  if (!value) return "";
  return renderEmailDetailRow(label, value);
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
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
        <tr>
          <td align="center" style="padding:20px 16px;border:1px solid ${BORDER};border-radius:12px;background:${CARD_BG};">
            <p style="margin:0 0 14px;font-family:${EMAIL_FONT_STACK};color:${TEXT_PRIMARY};font-size:16px;font-weight:800;line-height:1.3;">
              Scan to install your eSIM
            </p>
            <img
              src="${escapeHtml(qrImageSrc!)}"
              width="280"
              height="280"
              alt="eSIM installation QR code"
              style="display:block;margin:0 auto;width:280px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"
            />
            <p style="margin:14px 0 0;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:13px;line-height:1.5;">
              Open your phone camera or eSIM installer and scan this code.
            </p>
          </td>
        </tr>
      </table>
    `
    : renderEmailNotice(
        "A scannable QR code was not available for this order. Use the manual installation details below."
      );

  const downloadNotice = hasQrImage
    ? renderEmailNotice(
        "Download the attached QR image and save it securely to your photos before installation.",
        { title: "QR Code Download Available" }
      )
    : "";

  const deviceActions = deviceActionsSection(payload, hasQrImage);

  const fallbackRows = [
    optionalDetailRow("SM-DP+ address", payload.smdpAddress),
    optionalDetailRow("Activation code", payload.activationCode),
    optionalDetailRow("Complete LPA installation value", payload.qrValue),
    optionalDetailRow("ICCID", payload.iccid),
  ].join("");

  const fallbackBlock = renderEmailSummaryPanel(
    "Manual installation details",
    fallbackRows,
    {
      intro:
        "If scanning is unavailable, enter these verified details manually on your device.",
    }
  );

  return `${qrImageBlock}${deviceActions}${downloadNotice}${fallbackBlock}`;
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
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px;">
        <tr>
          <td align="center">
            ${renderEmailCtaButton(iphoneUrl!, "Install on iPhone")}
            <p style="margin:0 0 8px;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;text-align:center;">
              On iOS 17.4 or later, tap the button and follow Apple’s confirmation steps.
            </p>
            <p style="margin:0;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;text-align:center;">
              Installation still requires the normal Apple Allow/Continue confirmation.
            </p>
          </td>
        </tr>
      </table>
    `
    : iphoneGuideUrl
      ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px;">
        <tr>
          <td align="center" style="padding:16px 14px;border:1px solid ${BORDER};border-radius:12px;background:${EMAIL_SURFACE_MUTED};">
            <p style="margin:0 0 10px;font-family:${EMAIL_FONT_STACK};color:${TEXT_PRIMARY};font-size:14px;font-weight:800;">
              iPhone installation
            </p>
            <p style="margin:0 0 12px;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:12px;line-height:1.55;">
              No official one-tap activation link was supplied for this order. Use the QR code below or the iPhone guide.
            </p>
            ${renderEmailCtaButton(iphoneGuideUrl, "View iPhone Installation Guide", {
              primary: false,
            })}
          </td>
        </tr>
      </table>
    `
      : "";

  const iphoneQrFallback = hasQrImage
    ? `
      <p style="margin:0 0 16px;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:12px;line-height:1.55;text-align:center;">
        On iOS 17.4 or later, you can also press and hold the QR code in Mail or Safari and select Add eSIM.
      </p>
    `
    : "";

  let androidBlock = "";
  if (hasAndroidDirect) {
    androidBlock = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
        <tr>
          <td align="center">
            ${renderEmailCtaButton(androidUrl!, "Install on Android", {
              primary: false,
            })}
            <p style="margin:0;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;text-align:center;">
              Uses the official activation link supplied for this order. Android support varies by device and carrier app.
            </p>
          </td>
        </tr>
      </table>
    `;
  } else if (hasQrImage || androidGuideUrl) {
    androidBlock = `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
        <tr>
          <td align="center" style="padding:16px 14px;border:1px solid ${BORDER};border-radius:12px;background:${EMAIL_SURFACE_MUTED};">
            <p style="margin:0 0 10px;font-family:${EMAIL_FONT_STACK};color:${TEXT_PRIMARY};font-size:14px;font-weight:800;">
              Android installation
            </p>
            <p style="margin:0 0 12px;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:12px;line-height:1.55;">
              One-click Android installation is not universally available. Download the attached QR image, then follow the Android guide.
            </p>
            ${
              hasQrImage
                ? `<p style="margin:0 0 10px;font-family:${EMAIL_FONT_STACK};color:${TEXT_PRIMARY};font-size:13px;font-weight:800;">Download QR for Android</p>
                   <p style="margin:0 0 12px;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;">Use the downloadable PNG attached to this email.</p>`
                : ""
            }
            ${
              androidGuideUrl
                ? renderEmailCtaButton(
                    androidGuideUrl,
                    "View Android Installation Guide",
                    { primary: false }
                  )
                : ""
            }
          </td>
        </tr>
      </table>
    `;
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:18px 16px;border:1px solid ${BORDER};border-radius:12px;background:${CARD_BG};">
          <p style="margin:0 0 14px;font-family:${EMAIL_FONT_STACK};color:${TEXT_PRIMARY};font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">
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
    optionalDetailRow("Destination", payload.destination),
    optionalDetailRow("Plan name", payload.planName),
    optionalDetailRow("Data allowance", payload.dataAllowance),
    optionalDetailRow("Validity", payload.validity),
    optionalDetailRow("Order ID", maskOrderReference(payload.orderId)),
  ].join("");

  return renderEmailSummaryPanel("Plan details", rows);
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
        <td valign="top" width="28" style="padding:0 0 10px;font-family:${EMAIL_FONT_STACK};color:${BRAND_INK};font-size:14px;font-weight:800;">
          ${index + 1}.
        </td>
        <td style="padding:0 0 10px;font-family:${EMAIL_FONT_STACK};color:${TEXT_PRIMARY};font-size:13px;line-height:1.55;">
          ${escapeHtml(step)}
        </td>
      </tr>
    `
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:18px 16px;border:1px solid ${BORDER};border-radius:12px;background:${CARD_BG};">
          <p style="margin:0 0 12px;font-family:${EMAIL_FONT_STACK};color:${TEXT_PRIMARY};font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">
            How to Install
          </p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
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

function supportPurchaseNoticeSection(payload: OrderEmailPayload): string {
  const notice = payload.supportPurchaseNotice?.trim();
  if (!notice) return "";
  return renderEmailNotice(escapeHtml(notice));
}

export function renderOrderEmailHtml(
  payload: OrderEmailPayload,
  options: OrderEmailHtmlOptions = {}
): string {
  const hasQrImage = Boolean(options.qrImageSrc);
  const installSection = installQrSection(payload, options.qrImageSrc);
  const destinationHeadline = formatDestinationHeadline(payload.destination);
  const logoSrc = resolveEmailLogoSrc(options.logoImageSrc);

  const orderPageLink = payload.orderAccessUrl
    ? renderEmailParagraph(
        `Prefer the website? ${renderEmailTextLink(
          payload.orderAccessUrl,
          "Open your secure order page"
        )}`
      )
    : "";

  return renderTransactionalEmailLayoutHtml({
    title: `Your eSIM is Ready! — ${BRAND_NAME}`,
    preheader: `${destinationHeadline} · Install your eSIM`,
    footerLogoSrc: logoSrc,
    maxWidth: 600,
    contentHtml: `
              ${renderEmailHeroBand({
                eyebrow: BRAND_NAME,
                title: "Your eSIM is Ready!",
                subtitle: destinationHeadline,
              })}
              ${renderEmailLead(escapeHtml(introCopy(hasQrImage)))}
              ${supportPurchaseNoticeSection(payload)}
              ${installSection}
              ${planDetailsSection(payload)}
              ${howToInstallSection(hasQrImage)}
              ${orderPageLink}
              ${renderEmailSupportBlock()}`,
  });
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
  ];
  if (payload.supportPurchaseNotice?.trim()) {
    lines.push("", payload.supportPurchaseNotice.trim());
  }
  lines.push(
    "",
    "Plan details",
    `Destination: ${payload.destination}`,
    `Plan name: ${payload.planName}`,
    `Data allowance: ${payload.dataAllowance}`,
    `Validity: ${payload.validity}`,
    `Order ID: ${maskOrderReference(payload.orderId)}`,
    "",
    "Device installation actions"
  );
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

  lines.push("", renderEmailFooterText());

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
