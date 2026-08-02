import type { OrderEmailPayload } from "@/app/lib/email/types";
import { ESIM_QR_CID } from "@/app/lib/email/qr";

export type OrderEmailHtmlOptions = {
  /**
   * Image source for the scannable QR.
   * Nodemailer: `cid:${ESIM_QR_CID}`
   * Preview: `data:image/png;base64,...`
   * Omit when no valid QR should be shown.
   */
  qrImageSrc?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(label: string, value?: string): string {
  if (!value) return "";
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #24324a;color:#9fb0c9;font-size:13px;width:38%;vertical-align:top;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #24324a;color:#f4f7fb;font-size:14px;font-weight:600;word-break:break-word;">
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
    payload.smdpAddress || payload.activationCode || payload.qrValue
  );

  if (!hasQrImage && !hasManualFallbacks) {
    return "";
  }

  const qrImageBlock = hasQrImage
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;">
        <tr>
          <td align="center" style="padding:18px 16px;border:1px solid #2f425f;border-radius:12px;background:#ffffff;">
            <p style="margin:0 0 14px;color:#0d1524;font-size:15px;font-weight:700;line-height:1.3;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              Scan to install your eSIM
            </p>
            <img
              src="${escapeHtml(qrImageSrc!)}"
              width="280"
              height="280"
              alt="eSIM installation QR code"
              style="display:block;margin:0 auto;width:280px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"
            />
            <p style="margin:14px 0 0;color:#4b5d78;font-size:12px;line-height:1.5;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
              Open your phone camera or eSIM installer and scan this code.
            </p>
          </td>
        </tr>
      </table>
    `
    : `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;">
        <tr>
          <td style="padding:14px 16px;border:1px solid #2f425f;border-radius:12px;background:#101827;">
            <p style="margin:0;color:#e8eef7;font-size:13px;line-height:1.55;">
              A scannable QR code was not available for this order. Use the manual installation details below.
            </p>
          </td>
        </tr>
      </table>
    `;

  const fallbackRows = [
    row("SM-DP+ address", payload.smdpAddress),
    row("Activation code", payload.activationCode),
    row("Complete LPA installation value", payload.qrValue),
  ]
    .filter(Boolean)
    .join("");

  const fallbackBlock = fallbackRows
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;">
        <tr>
          <td style="padding:16px;border:1px solid #2f425f;border-radius:12px;background:#101827;">
            <p style="margin:0 0 8px;color:#c6f26d;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">
              Manual fallback details
            </p>
            <p style="margin:0 0 12px;color:#9fb0c9;font-size:12px;line-height:1.5;">
              If scanning fails, enter these verified details manually on your device.
            </p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              ${fallbackRows}
            </table>
          </td>
        </tr>
      </table>
    `
    : "";

  return `${qrImageBlock}${fallbackBlock}`;
}

export function renderOrderEmailHtml(
  payload: OrderEmailPayload,
  options: OrderEmailHtmlOptions = {}
): string {
  const installSection = installQrSection(payload, options.qrImageSrc);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>MAP-eSIM order confirmed</title>
  </head>
  <body style="margin:0;padding:0;background:#070b14;color:#f4f7fb;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#070b14;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#0d1524;border:1px solid #24324a;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 18px;background-color:#0d1524;">
                <p style="margin:0;color:#c6f26d;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">
                  MAP-eSIM
                </p>
                <h1 style="margin:10px 0 0;color:#f4f7fb;font-size:28px;line-height:1.2;">
                  Order confirmed
                </h1>
                <p style="margin:10px 0 0;color:#9fb0c9;font-size:14px;line-height:1.55;">
                  Your eSIM is ready. Use the verified installation details below on your device.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${row("Customer email", payload.customerEmail)}
                  ${row("Order ID", payload.orderId)}
                  ${row("Destination", payload.destination)}
                  ${row("Plan", payload.planName)}
                  ${row("Data allowance", payload.dataAllowance)}
                  ${row("Validity", payload.validity)}
                  ${row("ICCID", payload.iccid)}
                </table>
                ${installSection}
                <div style="margin-top:22px;padding:16px;border-radius:12px;background:#101827;border:1px solid #2f425f;">
                  <p style="margin:0 0 8px;color:#f4f7fb;font-size:14px;font-weight:700;">
                    Manual installation
                  </p>
                  <p style="margin:0 0 8px;color:#9fb0c9;font-size:13px;line-height:1.55;">
                    <strong style="color:#e8eef7;">iOS:</strong> Settings → Mobile Service → Add eSIM → Use QR Code or Enter Details Manually.
                  </p>
                  <p style="margin:0;color:#9fb0c9;font-size:13px;line-height:1.55;">
                    <strong style="color:#e8eef7;">Android:</strong> Settings → Network &amp; internet → SIMs → Add eSIM → Scan QR or enter SM-DP+ details.
                  </p>
                </div>
                <div style="margin-top:16px;padding:16px;border-radius:12px;background:#1a2210;border:1px solid #3d4f22;">
                  <p style="margin:0 0 8px;color:#c6f26d;font-size:13px;font-weight:700;">
                    Important activation guidance
                  </p>
                  <ul style="margin:0;padding-left:18px;color:#d7e0ec;font-size:13px;line-height:1.55;">
                    <li>Install before travel when possible, and turn the eSIM line on after arrival.</li>
                    <li>Keep a stable Wi‑Fi connection while installing.</li>
                    <li>Do not delete the eSIM profile once installed unless advised by support.</li>
                    <li>One profile is typically for one device — transferring may not be supported.</li>
                  </ul>
                </div>
                <p style="margin:22px 0 0;color:#9fb0c9;font-size:13px;line-height:1.55;">
                  Need help? Contact
                  <a href="mailto:admin@mapesim.com" style="color:#c6f26d;text-decoration:none;">admin@mapesim.com</a>
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

export function renderOrderEmailText(payload: OrderEmailPayload): string {
  const lines = [
    "MAP-eSIM — Order confirmed",
    "",
    `Customer email: ${payload.customerEmail}`,
    `Order ID: ${payload.orderId}`,
    `Destination: ${payload.destination}`,
    `Plan: ${payload.planName}`,
    `Data allowance: ${payload.dataAllowance}`,
    `Validity: ${payload.validity}`,
  ];

  if (payload.iccid) lines.push(`ICCID: ${payload.iccid}`);
  if (payload.smdpAddress) lines.push(`SM-DP+ address: ${payload.smdpAddress}`);
  if (payload.activationCode) {
    lines.push(`Activation code: ${payload.activationCode}`);
  }
  if (payload.qrValue) {
    lines.push(`Complete LPA installation value: ${payload.qrValue}`);
  }

  lines.push(
    "",
    "Manual installation",
    "iOS: Settings → Mobile Service → Add eSIM → Use QR Code or Enter Details Manually.",
    "Android: Settings → Network & internet → SIMs → Add eSIM → Scan QR or enter SM-DP+ details.",
    "",
    "Important: Install on Wi‑Fi when possible. Activate the line after arrival. Do not delete the profile unless support advises it.",
    "",
    "Support: admin@mapesim.com"
  );

  return lines.join("\n");
}

/** Sanitized sample used only by the development preview route. */
export function getSampleOrderEmailPayload(): OrderEmailPayload {
  return {
    customerEmail: "customer@example.com",
    orderId: "SAMPLE-ORDER-0001",
    destination: "Japan",
    planName: "Japan 3GB / 7 Days",
    dataAllowance: "3 GB",
    validity: "7 Days",
    iccid: "8900000000000000001",
    smdpAddress: "smdp.example.invalid",
    activationCode: "SAMPLE-ACTIVATION-CODE",
    qrValue: "LPA:1$smdp.example.invalid$SAMPLE-ACTIVATION-CODE",
  };
}

export { ESIM_QR_CID };
