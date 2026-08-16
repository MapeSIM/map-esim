/**
 * Decode and re-encode Partner logo uploads with sharp.
 * Strips metadata. Output is always WEBP. No secrets.
 */
import "server-only";

import sharp from "sharp";
import {
  PARTNER_LOGO_MAX_BYTES,
  PARTNER_LOGO_MAX_INPUT_DIMENSION,
  PARTNER_LOGO_MAX_OUTPUT_DIMENSION,
} from "@/app/lib/partner/partnerShareLogoBlob";
import {
  PARTNER_LOGO_STAGE,
  type PartnerLogoStage,
} from "@/app/lib/partner/partnerShareLogoStages";

export const PARTNER_LOGO_UNAVAILABLE = "Logo upload is temporarily unavailable.";
export const PARTNER_LOGO_INVALID =
  "Upload a PNG, JPG, or WEBP image up to 1 MB.";
export const PARTNER_LOGO_TOO_LARGE_DIMENSIONS =
  "That image is too large. Use an image up to 4096×4096 pixels.";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const WEBP_RIFF = Buffer.from("RIFF", "ascii");
const WEBP_WEBP = Buffer.from("WEBP", "ascii");

export type PreparedPartnerLogo = {
  body: Buffer;
  contentType: "image/webp";
};

function startsWith(buffer: Buffer, magic: Buffer, offset = 0): boolean {
  if (buffer.length < offset + magic.length) return false;
  return buffer.subarray(offset, offset + magic.length).equals(magic);
}

function looksLikeSvgOrHtml(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 256).toString("utf8").trim().toLowerCase();
  return (
    head.startsWith("<svg") ||
    head.startsWith("<?xml") ||
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.includes("<svg")
  );
}

function detectSafeRasterKind(
  buffer: Buffer
): "png" | "jpeg" | "webp" | null {
  if (startsWith(buffer, PNG_MAGIC)) return "png";
  if (startsWith(buffer, JPEG_MAGIC)) return "jpeg";
  if (
    startsWith(buffer, WEBP_RIFF) &&
    buffer.length >= 12 &&
    startsWith(buffer, WEBP_WEBP, 8)
  ) {
    return "webp";
  }
  return null;
}

function extensionOk(filename: string | null | undefined): boolean {
  const name = (filename ?? "").trim().toLowerCase();
  if (!name || !name.includes(".")) return true;
  return /\.(png|jpe?g|webp)$/.test(name);
}

export async function preparePartnerLogoWebp(input: {
  bytes: Buffer;
  filename?: string | null;
}): Promise<
  | { ok: true; logo: PreparedPartnerLogo }
  | { ok: false; error: string; stage: PartnerLogoStage }
> {
  const bytes = input.bytes;
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    return {
      ok: false,
      error: PARTNER_LOGO_INVALID,
      stage: PARTNER_LOGO_STAGE.INVALID_IMAGE,
    };
  }
  if (bytes.length > PARTNER_LOGO_MAX_BYTES) {
    return {
      ok: false,
      error: PARTNER_LOGO_INVALID,
      stage: PARTNER_LOGO_STAGE.INVALID_IMAGE,
    };
  }
  if (!extensionOk(input.filename)) {
    return {
      ok: false,
      error: PARTNER_LOGO_INVALID,
      stage: PARTNER_LOGO_STAGE.INVALID_IMAGE,
    };
  }
  if (looksLikeSvgOrHtml(bytes)) {
    return {
      ok: false,
      error: PARTNER_LOGO_INVALID,
      stage: PARTNER_LOGO_STAGE.INVALID_IMAGE,
    };
  }
  const kind = detectSafeRasterKind(bytes);
  if (!kind) {
    return {
      ok: false,
      error: PARTNER_LOGO_INVALID,
      stage: PARTNER_LOGO_STAGE.INVALID_IMAGE,
    };
  }

  try {
    const image = sharp(bytes, {
      failOn: "error",
      limitInputPixels:
        PARTNER_LOGO_MAX_INPUT_DIMENSION * PARTNER_LOGO_MAX_INPUT_DIMENSION,
    });
    const meta = await image.metadata();
    const format = (meta.format ?? "").toLowerCase();
    if (format !== kind) {
      return {
        ok: false,
        error: PARTNER_LOGO_INVALID,
        stage: PARTNER_LOGO_STAGE.INVALID_IMAGE,
      };
    }
    if (format !== "png" && format !== "jpeg" && format !== "webp") {
      return {
        ok: false,
        error: PARTNER_LOGO_INVALID,
        stage: PARTNER_LOGO_STAGE.INVALID_IMAGE,
      };
    }
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) {
      return {
        ok: false,
        error: PARTNER_LOGO_INVALID,
        stage: PARTNER_LOGO_STAGE.INVALID_IMAGE,
      };
    }
    if (
      width > PARTNER_LOGO_MAX_INPUT_DIMENSION ||
      height > PARTNER_LOGO_MAX_INPUT_DIMENSION
    ) {
      return {
        ok: false,
        error: PARTNER_LOGO_TOO_LARGE_DIMENSIONS,
        stage: PARTNER_LOGO_STAGE.INVALID_IMAGE,
      };
    }

    const body = await image
      .rotate()
      .resize(PARTNER_LOGO_MAX_OUTPUT_DIMENSION, PARTNER_LOGO_MAX_OUTPUT_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, alphaQuality: 82 })
      .toBuffer();

    if (!body.length || body.length > PARTNER_LOGO_MAX_BYTES) {
      return {
        ok: false,
        error: PARTNER_LOGO_INVALID,
        stage: PARTNER_LOGO_STAGE.INVALID_IMAGE,
      };
    }

    return {
      ok: true,
      logo: { body, contentType: "image/webp" },
    };
  } catch {
    return {
      ok: false,
      error: PARTNER_LOGO_UNAVAILABLE,
      stage: PARTNER_LOGO_STAGE.IMAGE_PROCESS_FAILED,
    };
  }
}
