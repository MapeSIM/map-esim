import type { OrderEmailPayload } from "@/app/lib/email/types";
import { BRAND_NAME } from "@/app/lib/brand";
import {
  BORDER,
  CARD_BG,
  escapeHtml,
  renderEmailFooterText,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "@/app/lib/email/brand";
import { renderTransactionalEmailLayoutHtml } from "@/app/lib/email/emailLayout";
import {
  EMAIL_FONT_STACK,
  renderEmailCtaButton,
  renderEmailDetailRow,
  renderEmailHeroBand,
  renderEmailLead,
  renderEmailNotice,
  renderEmailSummaryPanel,
  renderEmailSupportBlock,
} from "@/app/lib/email/emailUi";
import { resolveEmailLogoSrc } from "@/app/lib/email/logo";
import {
  formatDestinationHeadline,
  maskOrderReference,
} from "@/app/lib/email/format";

export type OrderEmailHtmlOptions = {
  /**
   * Image source for the scannable QR.
   * Production: absolute HTTPS `/api/vesim/install/qr?…` (order-access token).
   * Preview may use `data:image/png;base64,…` for local rendering only.
   * Never use `cid:` for production HTML (Gmail/Outlook break CID images).
   */
  qrImageSrc?: string;
  /** True when a downloadable PNG QR attachment is included on the message. */
  hasQrAttachment?: boolean;
  /**
   * Brand logo source. Production footer resolves to absolute HTTPS;
   * preview may use `/brand/...`.
   */
  logoImageSrc?: string;
};

function optionalDetailRow(label: string, value?: string): string {
  if (!value) return "";
  return renderEmailDetailRow(label, value);
}

function planChipLine(payload: OrderEmailPayload): string {
  const plan = (payload.planName ?? "").trim();
  const destination = formatDestinationHeadline(payload.destination);
  if (plan && plan !== "—") {
    return `${destination} · ${plan}`;
  }
  return destination;
}

function installQrSection(
  payload: OrderEmailPayload,
  options: { qrImageSrc?: string; hasQrAttachment?: boolean }
): string {
  const hasQrImage = Boolean(options.qrImageSrc);
  const hasQrAttachment = Boolean(options.hasQrAttachment);
  const hasManualFallbacks = Boolean(
    payload.smdpAddress ||
      payload.activationCode ||
      payload.qrValue ||
      payload.iccid
  );

  if (!hasQrImage && !hasQrAttachment && !hasManualFallbacks) {
    return "";
  }

  const qrImageBlock = hasQrImage
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px;">
        <tr>
          <td align="center" style="padding:22px 16px;border:1px solid ${BORDER};border-radius:14px;background:${CARD_BG};">
            <p style="margin:0 0 6px;font-family:${EMAIL_FONT_STACK};color:${TEXT_PRIMARY};font-size:16px;font-weight:800;line-height:1.3;">
              Scan to install your eSIM
            </p>
            <p style="margin:0 0 16px;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:13px;line-height:1.5;">
              Open your camera or eSIM settings and scan this code.
            </p>
            <img
              src="${escapeHtml(options.qrImageSrc!)}"
              width="280"
              height="280"
              alt="eSIM installation QR code"
              style="display:block;margin:0 auto;width:280px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"
            />
            <p style="margin:16px 0 0;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:12px;line-height:1.5;">
              Personal install code for this order — do not forward this email.
            </p>
          </td>
        </tr>
      </table>
    `
    : hasQrAttachment
      ? renderEmailNotice(
          "A scannable QR image is attached to this email. Open the PNG attachment to scan, or use the secure install page below.",
          { title: "Use the attached QR image" }
        )
      : renderEmailNotice(
          "A scannable QR code was not available for this order. Use the manual installation details below."
        );

  const orderPageCta = payload.orderAccessUrl
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px;">
        <tr>
          <td align="center">
            ${renderEmailCtaButton(
              payload.orderAccessUrl,
              "Open secure install page",
              { primary: true, fullWidth: true }
            )}
          </td>
        </tr>
      </table>
    `
    : "";

  const attachmentHint =
    hasQrAttachment && hasQrImage
      ? `<p style="margin:0 0 18px;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:13px;line-height:1.55;text-align:center;">
          A downloadable QR PNG is also attached — save it to your photos before you travel.
        </p>`
      : "";

  return `${qrImageBlock}${orderPageCta}${attachmentHint}`;
}

function deviceActionsSection(
  payload: OrderEmailPayload,
  hasQrImage: boolean,
  hasQrAttachment: boolean
): string {
  const iphoneUrl = payload.iphoneActivationUrl?.trim();
  const androidUrl = payload.androidActivationUrl?.trim();
  const androidGuideUrl = payload.androidGuideUrl?.trim();
  const iphoneGuideUrl = payload.iphoneGuideUrl?.trim();
  const scanHint = hasQrImage
    ? "Scan the QR code above"
    : hasQrAttachment
      ? "Open the attached QR PNG"
      : "Use the manual details below";

  const iphoneSteps = `
    <p style="margin:0 0 8px;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:12px;line-height:1.6;text-align:left;">
      1. ${escapeHtml(scanHint)} (or use Install on iPhone when available).<br/>
      2. Settings → Cellular / Mobile Service → Add eSIM.<br/>
      3. Confirm with Apple’s Allow / Continue prompts.<br/>
      4. Enable Data Roaming after you arrive.
    </p>`;

  const androidSteps = `
    <p style="margin:0 0 8px;font-family:${EMAIL_FONT_STACK};color:${TEXT_SECONDARY};font-size:12px;line-height:1.6;text-align:left;">
      1. ${escapeHtml(scanHint)} (or use Install on Android when available).<br/>
      2. Settings → Network &amp; Internet → SIMs → Add eSIM.<br/>
      3. Follow on-screen prompts for your device.<br/>
      4. Enable Data Roaming after you arrive.
    </p>`;

  const iphoneCta = iphoneUrl
    ? renderEmailCtaButton(iphoneUrl, "Install on iPhone")
    : iphoneGuideUrl
      ? renderEmailCtaButton(iphoneGuideUrl, "iPhone installation guide", {
          primary: false,
        })
      : "";

  const androidCta = androidUrl
    ? renderEmailCtaButton(androidUrl, "Install on Android", { primary: false })
    : androidGuideUrl
      ? renderEmailCtaButton(androidGuideUrl, "Android installation guide", {
          primary: false,
        })
      : "";

  if (
    !iphoneCta &&
    !androidCta &&
    !hasQrImage &&
    !hasQrAttachment
  ) {
    return "";
  }

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
      <tr>
        <td style="padding:16px 14px;border:1px solid ${BORDER};border-radius:12px;background:${CARD_BG};">
          <p style="margin:0 0 14px;font-family:${EMAIL_FONT_STACK};color:${TEXT_PRIMARY};font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">
            Device installation
          </p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="padding:0 0 14px;border-bottom:1px solid ${BORDER};">
                <p style="margin:0 0 8px;font-family:${EMAIL_FONT_STACK};color:${TEXT_PRIMARY};font-size:14px;font-weight:800;">
                  iPhone
                </p>
                ${iphoneSteps}
                ${iphoneCta}
              </td>
            </tr>
            <tr>
              <td style="padding:14px 0 0;">
                <p style="margin:0 0 8px;font-family:${EMAIL_FONT_STACK};color:${TEXT_PRIMARY};font-size:14px;font-weight:800;">
                  Android
                </p>
                ${androidSteps}
                ${androidCta}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function planDetailsSection(payload: OrderEmailPayload): string {
  const rows = [
    optionalDetailRow("Destination", payload.destination),
    optionalDetailRow("Plan", payload.planName),
    optionalDetailRow("Data", payload.dataAllowance),
    optionalDetailRow("Validity", payload.validity),
    optionalDetailRow("Order", maskOrderReference(payload.orderId)),
  ].join("");

  return renderEmailSummaryPanel("Plan details", rows);
}

function manualDetailsSection(payload: OrderEmailPayload): string {
  const fallbackRows = [
    optionalDetailRow("SM-DP+ address", payload.smdpAddress),
    optionalDetailRow("Activation code", payload.activationCode),
    optionalDetailRow("Complete LPA installation value", payload.qrValue),
    optionalDetailRow("ICCID", payload.iccid),
  ].join("");

  return renderEmailSummaryPanel(
    "Can't scan? Enter details manually",
    fallbackRows,
    {
      intro:
        "Use these verified details only if scanning is unavailable on your device.",
    }
  );
}

function introCopy(hasQrImage: boolean, hasQrAttachment: boolean): string {
  if (hasQrImage) {
    return "Your eSIM purchase was successful. Scan the QR below, open your secure install page, or use the attached QR image.";
  }
  if (hasQrAttachment) {
    return "Your eSIM purchase was successful. Open the attached QR image or your secure install page to set up the eSIM.";
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
  const attachFlag =
    options.hasQrAttachment !== undefined
      ? options.hasQrAttachment
      : hasQrImage;

  const installSection = installQrSection(payload, {
    qrImageSrc: options.qrImageSrc,
    hasQrAttachment: attachFlag,
  });
  const destinationHeadline = formatDestinationHeadline(payload.destination);
  const chip = planChipLine(payload);
  const logoSrc = resolveEmailLogoSrc(options.logoImageSrc);

  return renderTransactionalEmailLayoutHtml({
    title: `Your eSIM is Ready! — ${BRAND_NAME}`,
    preheader: `${destinationHeadline} · Install your eSIM`,
    footerLogoSrc: logoSrc,
    maxWidth: 600,
    contentHtml: `
              ${renderEmailHeroBand({
                eyebrow: BRAND_NAME,
                title: "Your eSIM is Ready!",
                subtitle: chip,
              })}
              ${renderEmailLead(
                escapeHtml(introCopy(hasQrImage, attachFlag))
              )}
              ${supportPurchaseNoticeSection(payload)}
              ${installSection}
              ${deviceActionsSection(payload, hasQrImage, attachFlag)}
              ${planDetailsSection(payload)}
              ${manualDetailsSection(payload)}
              ${renderEmailSupportBlock()}`,
  });
}

export function renderOrderEmailText(
  payload: OrderEmailPayload,
  options: { hasQrAttachment?: boolean; hasQrImage?: boolean } = {}
): string {
  const destinationHeadline = formatDestinationHeadline(payload.destination);
  const hasQrAttachment = Boolean(options.hasQrAttachment);
  const hasQrImage = Boolean(options.hasQrImage);
  const hasQr = hasQrAttachment || hasQrImage;
  const lines = [
    `${BRAND_NAME} — Your eSIM is Ready!`,
    destinationHeadline,
    "",
    introCopy(hasQrImage, hasQrAttachment),
  ];
  if (payload.supportPurchaseNotice?.trim()) {
    lines.push("", payload.supportPurchaseNotice.trim());
  }
  if (payload.orderAccessUrl) {
    lines.push("", `Secure install page: ${payload.orderAccessUrl}`);
  }
  if (payload.qrImageUrl) {
    lines.push(`Install QR image: ${payload.qrImageUrl}`);
  }
  if (hasQrAttachment) {
    lines.push("", "A downloadable QR PNG is attached to this email.");
  }
  lines.push(
    "",
    "Plan details",
    `Destination: ${payload.destination}`,
    `Plan: ${payload.planName}`,
    `Data: ${payload.dataAllowance}`,
    `Validity: ${payload.validity}`,
    `Order: ${maskOrderReference(payload.orderId)}`,
    "",
    "Device installation"
  );
  if (payload.iphoneActivationUrl) {
    lines.push(
      "Install on iPhone: use the official activation button/link in the HTML email."
    );
  } else if (payload.iphoneGuideUrl) {
    lines.push(`iPhone installation guide: ${payload.iphoneGuideUrl}`);
  }
  if (payload.androidActivationUrl) {
    lines.push(
      "An official Android activation link is included in the HTML email for this order."
    );
  } else if (payload.androidGuideUrl) {
    lines.push(`Android installation guide: ${payload.androidGuideUrl}`);
  }

  if (
    payload.smdpAddress ||
    payload.activationCode ||
    payload.qrValue ||
    payload.iccid
  ) {
    lines.push("", "Can't scan? Enter details manually");
    if (payload.smdpAddress) lines.push(`SM-DP+ address: ${payload.smdpAddress}`);
    if (payload.activationCode) {
      lines.push(`Activation code: ${payload.activationCode}`);
    }
    if (payload.qrValue) {
      lines.push(`Complete LPA installation value: ${payload.qrValue}`);
    }
    if (payload.iccid) lines.push(`ICCID: ${payload.iccid}`);
  }

  lines.push("", "How to install");
  if (hasQr) {
    lines.push(
      "1. Scan the QR, open the attached PNG, or use the secure install page.",
      "2. iPhone: Settings → Cellular/Mobile Service → Add eSIM.",
      "3. Android: Settings → Network & Internet → SIMs → Add eSIM.",
      "4. Enable Data Roaming after arriving at the destination."
    );
  } else {
    lines.push(
      "1. Open your device settings and choose Add eSIM / Add mobile plan.",
      "2. Enter the verified SM-DP+ address and activation code from this email.",
      "3. Enable Data Roaming after arriving at the destination."
    );
  }

  lines.push("", renderEmailFooterText());

  return lines.join("\n");
}

/** Sanitized sample used only by the development preview route. */
export function getSampleOrderEmailPayload(
  options: { withOfficialIphoneLink?: boolean } = {}
): OrderEmailPayload {
  const orderId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const access = "sample-opaque-token";
  const base: OrderEmailPayload = {
    customerEmail: "customer@example.com",
    orderId,
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
    orderAccessUrl: `https://mapesim.com/success?orderId=${orderId}&access=${access}`,
    qrImageUrl: `https://mapesim.com/api/vesim/install/qr?orderId=${encodeURIComponent(orderId)}&access=${encodeURIComponent(access)}&disposition=inline`,
  };

  if (options.withOfficialIphoneLink) {
    base.iphoneActivationUrl =
      "https://esimsetup.apple.com/esim_qrcode_provisioning";
  }

  return base;
}
