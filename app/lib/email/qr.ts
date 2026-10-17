import QRCode from "qrcode";
import { isValidInstallQrValue } from "@/app/lib/email/qrValidate";

export {
  isValidInstallQrValue,
  resolveInstallQrValue,
} from "@/app/lib/email/qrValidate";

/** Stable CID historically used for Nodemailer inline PNG (no longer used as HTML img src). */
export const ESIM_QR_CID = "mapesim-esim-qr@mapesim.com";

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
