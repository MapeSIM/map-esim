/**
 * ICCID crypto primitives (no framework gate).
 * App server entrypoints must import via iccidCrypto.ts (server-only).
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const KEY_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;
const HASH_DOMAIN = "mapesim-iccid-hash-v1";
const CIPHER_PREFIX = "v1";

export class IccidCryptoError extends Error {
  readonly code:
    | "INVALID_KEY"
    | "INVALID_ICCID"
    | "DECRYPT_FAILED"
    | "ENCRYPT_FAILED";

  constructor(
    code: IccidCryptoError["code"],
    message = "ICCID crypto operation failed"
  ) {
    super(message);
    this.name = "IccidCryptoError";
    this.code = code;
  }
}

/**
 * Parse ICCID_ENCRYPTION_KEY as 32 raw bytes.
 * Accepts 64-char hex or standard/base64url encoding of 32 bytes.
 */
export function parseIccidEncryptionKey(
  raw: string | undefined = process.env.ICCID_ENCRYPTION_KEY
): Buffer | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded =
      normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const buf = Buffer.from(padded, "base64");
    if (buf.length === KEY_BYTE_LENGTH) return buf;
  } catch {
    // fall through
  }

  return null;
}

export function isIccidEncryptionConfigured(): boolean {
  return parseIccidEncryptionKey() != null;
}

function requireKey(): Buffer {
  const key = parseIccidEncryptionKey();
  if (!key || key.length !== KEY_BYTE_LENGTH) {
    throw new IccidCryptoError("INVALID_KEY");
  }
  return key;
}

/** Strip separators; keep digits only. */
export function normalizeIccid(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.replace(/\D+/g, "");
}

/** ICCID is typically 18–22 decimal digits after normalization. */
export function validateIccid(value: string | null | undefined): boolean {
  const normalized = normalizeIccid(value);
  return /^\d{18,22}$/.test(normalized);
}

export function maskIccidLast4(value: string | null | undefined): string {
  const digits = normalizeIccid(value);
  if (!digits) return "Pending from provider";
  const last4 = digits.slice(-4);
  if (last4.length < 4) return "••••••••••••••••";
  return `•••••••••••••${last4}`;
}

export function formatIccidLast4Mask(last4: string | null | undefined): string {
  const digits = (last4 ?? "").replace(/\D+/g, "");
  if (digits.length !== 4) return "Pending from provider";
  return `•••••••••••••${digits}`;
}

/** Deterministic HMAC for duplicate detection — not reversible to ICCID. */
export function hashIccid(value: string): string {
  const normalized = normalizeIccid(value);
  if (!validateIccid(normalized)) {
    throw new IccidCryptoError("INVALID_ICCID");
  }
  const key = requireKey();
  return createHmac("sha256", key)
    .update(`${HASH_DOMAIN}:${normalized}`)
    .digest("hex");
}

/**
 * AES-256-GCM with random IV. Ciphertext format:
 * v1.<iv_b64url>.<ciphertext_b64url>.<tag_b64url>
 */
export function encryptIccid(value: string): string {
  const normalized = normalizeIccid(value);
  if (!validateIccid(normalized)) {
    throw new IccidCryptoError("INVALID_ICCID");
  }
  try {
    const key = requireKey();
    const iv = randomBytes(IV_BYTE_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(normalized, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    if (tag.length !== AUTH_TAG_BYTE_LENGTH) {
      throw new IccidCryptoError("ENCRYPT_FAILED");
    }
    return [
      CIPHER_PREFIX,
      iv.toString("base64url"),
      ciphertext.toString("base64url"),
      tag.toString("base64url"),
    ].join(".");
  } catch (error) {
    if (error instanceof IccidCryptoError) throw error;
    throw new IccidCryptoError("ENCRYPT_FAILED");
  }
}

export function decryptIccid(payload: string): string {
  const parts = (payload ?? "").trim().split(".");
  if (parts.length !== 4 || parts[0] !== CIPHER_PREFIX) {
    throw new IccidCryptoError("DECRYPT_FAILED");
  }
  try {
    const key = requireKey();
    const iv = Buffer.from(parts[1], "base64url");
    const ciphertext = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    if (
      iv.length !== IV_BYTE_LENGTH ||
      tag.length !== AUTH_TAG_BYTE_LENGTH ||
      ciphertext.length === 0
    ) {
      throw new IccidCryptoError("DECRYPT_FAILED");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    if (!validateIccid(plain)) {
      throw new IccidCryptoError("DECRYPT_FAILED");
    }
    return normalizeIccid(plain);
  } catch (error) {
    if (error instanceof IccidCryptoError) throw error;
    throw new IccidCryptoError("DECRYPT_FAILED");
  }
}

export type IccidPersistFields = {
  iccidEncrypted: string;
  iccidHash: string;
  iccidLast4: string;
  iccidCapturedAt: Date;
};

/** Build DB fields for a valid ICCID, or null when invalid / crypto unavailable. */
export function buildIccidPersistFields(
  value: string | null | undefined
): IccidPersistFields | null {
  const normalized = normalizeIccid(value);
  if (!validateIccid(normalized)) return null;
  if (!isIccidEncryptionConfigured()) return null;
  try {
    return {
      iccidEncrypted: encryptIccid(normalized),
      iccidHash: hashIccid(normalized),
      iccidLast4: normalized.slice(-4),
      iccidCapturedAt: new Date(),
    };
  } catch {
    return null;
  }
}
