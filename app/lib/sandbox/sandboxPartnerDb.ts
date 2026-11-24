/**
 * Neon-backed sandbox partners — isolated from live PartnerProfile / User.
 */
import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/app/lib/db";
import { hashPassword, verifyPassword } from "@/app/lib/auth/password";
import {
  SANDBOX_DEFAULT_BALANCE_CENTS,
  SANDBOX_TEST_KEY_PREFIX,
  generateSandboxTestKey,
} from "@/app/lib/sandbox/sandboxShared";
import type { SandboxPartnerPublic } from "@/app/lib/sandbox/sandboxPartnerTypes";

export type { SandboxPartnerPublic } from "@/app/lib/sandbox/sandboxPartnerTypes";

export function hashSandboxApiToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function mintSandboxApiToken(): { raw: string; prefix: string; keyHash: string } {
  const raw = generateSandboxTestKey();
  const prefix = raw.slice(0, Math.min(12, raw.length));
  return { raw, prefix, keyHash: hashSandboxApiToken(raw) };
}

function toPublic(
  row: {
    id: string;
    name: string;
    email: string;
    balanceCents: number;
    initialBalanceCents: number;
    shareCompanyName: string | null;
    shareSupportEmail: string | null;
    shareLogoUrl: string | null;
    shareButtonBackground: string | null;
    shareButtonTextColor: string | null;
    disabledAt: Date | null;
    createdAt: Date;
    apiKeys?: { prefix: string; revokedAt: Date | null }[];
  }
): SandboxPartnerPublic {
  const active = row.apiKeys?.find((k) => !k.revokedAt);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    balanceCents: row.balanceCents,
    initialBalanceCents: row.initialBalanceCents,
    shareCompanyName: row.shareCompanyName,
    shareSupportEmail: row.shareSupportEmail,
    shareLogoUrl: row.shareLogoUrl,
    shareButtonBackground: row.shareButtonBackground,
    shareButtonTextColor: row.shareButtonTextColor,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    apiKeyPrefix: active?.prefix ?? null,
  };
}

const partnerSelect = {
  id: true,
  name: true,
  email: true,
  balanceCents: true,
  initialBalanceCents: true,
  shareCompanyName: true,
  shareSupportEmail: true,
  shareLogoUrl: true,
  shareButtonBackground: true,
  shareButtonTextColor: true,
  disabledAt: true,
  createdAt: true,
  apiKeys: {
    where: { revokedAt: null },
    select: { prefix: true, revokedAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
} as const;

export async function listSandboxPartners(): Promise<SandboxPartnerPublic[]> {
  const rows = await prisma.sandboxPartner.findMany({
    orderBy: { createdAt: "desc" },
    select: partnerSelect,
  });
  return rows.map(toPublic);
}

export async function getSandboxPartnerById(
  id: string
): Promise<SandboxPartnerPublic | null> {
  const row = await prisma.sandboxPartner.findUnique({
    where: { id },
    select: partnerSelect,
  });
  return row ? toPublic(row) : null;
}

export async function createSandboxPartner(input: {
  name: string;
  email: string;
  password: string;
  initialBalanceCents?: number;
}): Promise<
  | { ok: true; partner: SandboxPartnerPublic; rawApiKey: string }
  | { ok: false; error: string }
> {
  const name = input.name.trim().slice(0, 120);
  const email = input.email.trim().toLowerCase().slice(0, 254);
  const password = input.password;
  if (!name || name.length < 2) {
    return { ok: false, error: "Name must be at least 2 characters." };
  }
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email." };
  }
  if (!password || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  const balance =
    typeof input.initialBalanceCents === "number" &&
    Number.isFinite(input.initialBalanceCents) &&
    input.initialBalanceCents >= 0
      ? Math.min(Math.floor(input.initialBalanceCents), 50_000_000)
      : SANDBOX_DEFAULT_BALANCE_CENTS;

  const existing = await prisma.sandboxPartner.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "A sandbox partner with this email already exists." };
  }

  const passwordHash = await hashPassword(password);
  const minted = mintSandboxApiToken();

  try {
    const created = await prisma.sandboxPartner.create({
      data: {
        name,
        email,
        passwordHash,
        balanceCents: balance,
        initialBalanceCents: balance,
        shareCompanyName: name,
        shareSupportEmail: email,
        apiKeys: {
          create: {
            name: "Default",
            prefix: minted.prefix,
            keyHash: minted.keyHash,
          },
        },
        walletTx: {
          create: {
            label: "Opening demo balance",
            amountCents: balance,
            kind: "credit",
          },
        },
      },
      select: partnerSelect,
    });
    return { ok: true, partner: toPublic(created), rawApiKey: minted.raw };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      return { ok: false, error: "A sandbox partner with this email already exists." };
    }
    return { ok: false, error: "Unable to create sandbox partner." };
  }
}

export async function authenticateSandboxPartner(input: {
  email: string;
  password: string;
}): Promise<
  | { ok: true; partner: SandboxPartnerPublic; rawApiKey: string | null }
  | { ok: false; error: string }
> {
  const email = input.email.trim().toLowerCase();
  const row = await prisma.sandboxPartner.findUnique({
    where: { email },
    select: {
      ...partnerSelect,
      passwordHash: true,
      apiKeys: {
        where: { revokedAt: null },
        select: { id: true, prefix: true, revokedAt: true, keyHash: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!row || row.disabledAt) {
    return { ok: false, error: "Invalid email or password." };
  }
  const valid = await verifyPassword(input.password, row.passwordHash);
  if (!valid) {
    return { ok: false, error: "Invalid email or password." };
  }

  // Return existing key only if we can re-mint for portal cache — we only have hash.
  // Ensure an active key exists; mint a fresh one on login so the portal can call APIs.
  const minted = mintSandboxApiToken();
  await prisma.$transaction([
    prisma.sandboxApiKey.updateMany({
      where: { partnerId: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.sandboxApiKey.create({
      data: {
        partnerId: row.id,
        name: "Portal",
        prefix: minted.prefix,
        keyHash: minted.keyHash,
      },
    }),
  ]);

  const partner = toPublic({ ...row, apiKeys: [{ prefix: minted.prefix, revokedAt: null }] });
  return { ok: true, partner, rawApiKey: minted.raw };
}

export async function findSandboxPartnerByApiKey(
  rawToken: string
): Promise<{ partnerId: string; keyId: string } | null> {
  const token = rawToken.trim();
  if (!token.startsWith(SANDBOX_TEST_KEY_PREFIX)) return null;
  const keyHash = hashSandboxApiToken(token);
  const key = await prisma.sandboxApiKey.findFirst({
    where: { keyHash, revokedAt: null },
    select: {
      id: true,
      partnerId: true,
      partner: { select: { disabledAt: true } },
    },
  });
  if (!key || key.partner.disabledAt) return null;
  // Soft last-used stamp (best-effort).
  void prisma.sandboxApiKey
    .update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);
  return { partnerId: key.partnerId, keyId: key.id };
}

/** Legacy fixture keys (no Neon row): accept format-only for empty-DB demos. */
export function isSandboxApiKeyFormat(raw: string): boolean {
  return /^sb_test_[A-Za-z0-9_-]{8,}$/.test(raw.trim());
}

export async function setSandboxPartnerBalance(
  partnerId: string,
  balanceCents: number,
  label = "Admin balance set"
): Promise<{ ok: true; balanceCents: number } | { ok: false; error: string }> {
  const next = Math.max(0, Math.min(Math.floor(balanceCents), 50_000_000));
  const row = await prisma.sandboxPartner.findUnique({
    where: { id: partnerId },
    select: { balanceCents: true },
  });
  if (!row) return { ok: false, error: "Sandbox partner not found." };
  const delta = next - row.balanceCents;
  await prisma.$transaction([
    prisma.sandboxPartner.update({
      where: { id: partnerId },
      data: { balanceCents: next },
    }),
    prisma.sandboxWalletTx.create({
      data: {
        partnerId,
        label,
        amountCents: Math.abs(delta),
        kind: delta >= 0 ? "credit" : "debit",
      },
    }),
  ]);
  return { ok: true, balanceCents: next };
}

export async function topUpSandboxPartner(
  partnerId: string,
  amountCents: number,
  options?: { label?: string }
): Promise<{ ok: true; balanceCents: number } | { ok: false; error: string }> {
  const add = Math.floor(amountCents);
  if (!Number.isFinite(add) || add <= 0) {
    return { ok: false, error: "Top-up amount must be positive." };
  }
  const row = await prisma.sandboxPartner.findUnique({
    where: { id: partnerId },
    select: { balanceCents: true },
  });
  if (!row) return { ok: false, error: "Sandbox partner not found." };
  const next = Math.min(row.balanceCents + add, 50_000_000);
  const label = (options?.label ?? "Admin top-up").trim() || "Admin top-up";
  await prisma.$transaction([
    prisma.sandboxPartner.update({
      where: { id: partnerId },
      data: { balanceCents: next },
    }),
    prisma.sandboxWalletTx.create({
      data: {
        partnerId,
        label,
        amountCents: add,
        kind: "credit",
      },
    }),
  ]);
  return { ok: true, balanceCents: next };
}

export async function resetSandboxPartnerDemoData(
  partnerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.sandboxPartner.findUnique({
    where: { id: partnerId },
    select: { initialBalanceCents: true },
  });
  if (!row) return { ok: false, error: "Sandbox partner not found." };

  await prisma.$transaction([
    prisma.sandboxOrder.deleteMany({ where: { partnerId } }),
    prisma.sandboxWalletTx.deleteMany({ where: { partnerId } }),
    prisma.sandboxPartner.update({
      where: { id: partnerId },
      data: { balanceCents: row.initialBalanceCents },
    }),
    prisma.sandboxWalletTx.create({
      data: {
        partnerId,
        label: "Demo data reset",
        amountCents: row.initialBalanceCents,
        kind: "credit",
      },
    }),
  ]);
  return { ok: true };
}

export async function deleteSandboxPartner(
  partnerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await prisma.sandboxPartner.delete({ where: { id: partnerId } });
    return { ok: true };
  } catch {
    return { ok: false, error: "Sandbox partner not found." };
  }
}

export async function debitSandboxPartnerWallet(
  partnerId: string,
  amountCents: number,
  label: string
): Promise<{ ok: true; balanceCents: number } | { ok: false; error: string }> {
  const amount = Math.floor(amountCents);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Invalid debit amount." };
  }
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.sandboxPartner.findUnique({
      where: { id: partnerId },
      select: { balanceCents: true, disabledAt: true },
    });
    if (!row || row.disabledAt) return null;
    if (row.balanceCents < amount) return { insufficient: true as const };
    const next = row.balanceCents - amount;
    await tx.sandboxPartner.update({
      where: { id: partnerId },
      data: { balanceCents: next },
    });
    await tx.sandboxWalletTx.create({
      data: { partnerId, label, amountCents: amount, kind: "debit" },
    });
    return { balanceCents: next };
  });
  if (!updated) return { ok: false, error: "Sandbox partner not found." };
  if ("insufficient" in updated) {
    return { ok: false, error: "Insufficient sandbox wallet balance." };
  }
  return { ok: true, balanceCents: updated.balanceCents };
}

export async function createSandboxOrderForPartner(input: {
  partnerId: string;
  offerId: string;
  quantity?: number;
  orderPayload: {
    orderId: string;
    region: string;
    planName: string;
    totalCents: number;
    iccid: string;
    activationCode: string;
    matchingId?: string;
    smdpAddress?: string;
  };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const debit = await debitSandboxPartnerWallet(
    input.partnerId,
    input.orderPayload.totalCents,
    `Order ${input.orderPayload.planName}`
  );
  if (!debit.ok) return debit;

  await prisma.sandboxOrder.create({
    data: {
      partnerId: input.partnerId,
      orderId: input.orderPayload.orderId,
      offerId: input.offerId,
      region: input.orderPayload.region,
      planName: input.orderPayload.planName,
      totalCents: input.orderPayload.totalCents,
      iccid: input.orderPayload.iccid,
      activationCode: input.orderPayload.activationCode,
      matchingId: input.orderPayload.matchingId ?? null,
      smdpAddress: input.orderPayload.smdpAddress ?? "smdp.sandbox.mapesim.store",
      status: "COMPLETED",
    },
  });
  return { ok: true };
}

export async function listSandboxOrdersForPartner(partnerId: string) {
  return prisma.sandboxOrder.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function listSandboxWalletTxForPartner(partnerId: string) {
  return prisma.sandboxWalletTx.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getSandboxOrderByIccid(partnerId: string, iccid: string) {
  return prisma.sandboxOrder.findFirst({
    where: { partnerId, iccid },
    orderBy: { createdAt: "desc" },
  });
}

/** Session cookie signing helpers (HMAC with AUTH_SECRET). */
export const SANDBOX_SESSION_COOKIE = "map_sandbox_sid";

export function signSandboxSession(partnerId: string): string {
  const secret =
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "dev-sandbox-session";
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14;
  const payload = `${partnerId}.${exp}`;
  const sig = createHash("sha256")
    .update(`${payload}.${secret}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifySandboxSession(
  token: string | null | undefined
): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [partnerId, expStr, sig] = parts;
  if (!partnerId || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const secret =
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    "dev-sandbox-session";
  const payload = `${partnerId}.${expStr}`;
  const expected = createHash("sha256")
    .update(`${payload}.${secret}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return partnerId;
}

/**
 * Realistic simulated eSIM install payload for sandbox only.
 * Never contacts VeSIM / live SM-DP+. ICCID + matchingId are random per call
 * (seed mixes in entropy so concurrent sandbox buys stay unique).
 */
export function mintDemoActivationCode(seed: string): {
  iccid: string;
  matchingId: string;
  smdpAddress: string;
  activationCode: string;
} {
  const entropy = randomBytes(12).toString("hex");
  const material = `${seed}:${Date.now().toString(36)}:${entropy}`;
  let h = 0;
  for (let i = 0; i < material.length; i++) {
    h = (h * 31 + material.charCodeAt(i)) >>> 0;
  }
  // 19-digit ICCID-like value (ITU-T E.118 style prefix 89 + country 44).
  const body = `${h.toString().padStart(10, "0")}${randomBytes(4)
    .toString("hex")
    .replace(/\D/g, "")
    .padStart(8, "0")}`.replace(/\D/g, "");
  const digits = `8944${body}`.replace(/\D/g, "").slice(0, 18);
  const iccid = `${digits}${luhnCheckDigit(digits)}`;

  const matchingId = `SNDBOX${randomBytes(6).toString("hex").toUpperCase()}`;
  const smdpAddress = "smdp.sandbox.mapesim.store";
  return {
    iccid,
    matchingId,
    smdpAddress,
    activationCode: `LPA:1$${smdpAddress}$${matchingId}`,
  };
}

/** Luhn check digit for a numeric string (ICCID-style). */
function luhnCheckDigit(digits: string): string {
  let sum = 0;
  let alt = true;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (!Number.isFinite(n)) n = 0;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return String((10 - (sum % 10)) % 10);
}

export function newSandboxOrderId(): string {
  return `sandbox_ord_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}
