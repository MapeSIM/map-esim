import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Attachment } from "nodemailer/lib/mailer";

/** Distinct from order QR CID (`mapesim-esim-qr@mapesim.com`). */
export const EMAIL_LOGO_CID = "mapesim-brand-logo@mapesim.com";

const LOGO_RELATIVE = path.join("public", "brand", "map-esim-logo.png");

let cachedLogo: Buffer | null | undefined;

export function getEmailLogoBuffer(): Buffer | null {
  if (cachedLogo !== undefined) return cachedLogo;
  const absolute = path.join(process.cwd(), LOGO_RELATIVE);
  if (!existsSync(absolute)) {
    cachedLogo = null;
    return null;
  }
  cachedLogo = readFileSync(absolute);
  return cachedLogo;
}

export function getEmailLogoAttachment(): Attachment | null {
  const content = getEmailLogoBuffer();
  if (!content) return null;
  return {
    filename: "map-esim-logo.png",
    content,
    contentType: "image/png",
    cid: EMAIL_LOGO_CID,
    contentDisposition: "inline",
  };
}

export function getEmailLogoCidSrc(): string {
  return `cid:${EMAIL_LOGO_CID}`;
}
