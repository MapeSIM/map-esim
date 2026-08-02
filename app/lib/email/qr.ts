import QRCode from "qrcode";
import type { OrderEmailPayload } from "@/app/lib/email/types";

/** Stable CID used by Nodemailer inline PNG attachments. */
export const ESIM_QR_CID = "mapesim-esim-qr@mapesim.com";

const MIN_LEN = 8;
const MAX_LEN = 2048;

/**
 * Validates a verified installation / LPA string before QR generation.
 * Never call this with client query params or unverified input.
 */
export function isValidInstallQrValue(value: string): boolean {
  const v = value.trim();
  if (v.length < MIN_LEN || v.length > MAX_LEN) return false;
  // Reject whitespace-only / control characters.
  if (/[\u0000-\u001F\u007F]/.test(v)) return false;
  // Prefer GSMA LPA activation strings.
  if (/^LPA:1\$/i.test(v)) return true;
  // Allow other provider install tokens that are compact and non-URL.
  if (/^https?:\/\//i.test(v)) return false;
  if (/\s/.test(v)) return false;
  return /^[\w.$+\-/=:@]+$/i.test(v);
}

/**
 * Resolves the QR payload from verified order email fields only.
 */
export function resolveInstallQrValue(
  payload: OrderEmailPayload
): string | null {
  const direct = payload.qrValue?.trim();
  if (direct && isValidInstallQrValue(direct)) {
    return direct;
  }

  const smdp = payload.smdpAddress?.trim();
  const activation = payload.activationCode?.trim();
  if (smdp && activation) {
    const built = `LPA:1$${smdp}$${activation}`;
    if (isValidInstallQrValue(built)) {
      return built;
    }
  }

  return null;
}

export async function generateEsimQrPngBuffer(
  installValue: string
): Promise<Buffer | null> {
  const value = installValue.trim();
  if (!isValidInstallQrValue(value)) {
    return null;
  }

  try {
    return await QRCode.toBuffer(value, {
      type: "png",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 280,
      color: {
        dark: "#0d1524",
        light: "#ffffff",
      },
    });
  } catch {
    return null;
  }
}

export async function generateEsimQrDataUrl(
  installValue: string
): Promise<string | null> {
  const buffer = await generateEsimQrPngBuffer(installValue);
  if (!buffer) return null;
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
