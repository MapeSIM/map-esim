import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { Attachment } from "nodemailer/lib/mailer";
import { BRAND_SITE_URL } from "@/app/lib/brand";

/** Distinct from order QR CID (`mapesim-esim-qr@mapesim.com`). */
export const EMAIL_LOGO_CID = "mapesim-brand-logo@mapesim.com";

/** Browser-relative public path — prefer getEmailLogoAbsoluteUrl() in HTML. */
export const EMAIL_LOGO_PUBLIC_PATH = "/brand/map-esim-logo.png";

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

/** @deprecated Prefer getEmailLogoAbsoluteUrl() for HTML img src. */
export function getEmailLogoCidSrc(): string {
  return `cid:${EMAIL_LOGO_CID}`;
}

/**
 * Absolute HTTPS logo URL for Gmail/Outlook HTML rendering.
 * Relative `/brand/...` paths break in most email clients.
 */
export function getEmailLogoAbsoluteUrl(): string {
  return `${BRAND_SITE_URL}${EMAIL_LOGO_PUBLIC_PATH}`;
}

/**
 * Normalize any logo src to an absolute public URL for HTML emails.
 * Accepts absolute https, site-relative `/brand/...`, or legacy CID values.
 */
export function resolveEmailLogoSrc(logoSrc?: string | null): string {
  const absolute = getEmailLogoAbsoluteUrl();
  const raw = logoSrc?.trim();
  if (!raw) return absolute;
  if (raw.startsWith("cid:")) return absolute;
  if (raw.startsWith("/")) return `${BRAND_SITE_URL}${raw}`;
  return raw;
}
