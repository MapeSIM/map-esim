/**
 * Partner eSIM share-token foundation (Phase 3 Slice 1).
 * Raw token is returned once to the caller and must never be persisted, logged,
 * audited, or used as an internal identifier. Only SHA-256(token) is stored.
 *
 * Canonical public path (Slice 2): /share/<opaque-token> — never query params.
 * Platform/web-server access logs may still record the path; this module never
 * writes the raw token or /share/<token> into AuditLog or application logs.
 *
 * Active share links have no time-based expiry. They stay valid until the
 * Partner revokes them or regenerates (which immediately invalidates the old
 * token). Do not add expiresAt for share links.
 */
import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  OrderFundingSource,
  OrderStatus,
  PartnerEsimPurchaseStatus,
} from "@prisma/client";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { prisma } from "@/app/lib/db";
import { requireActivePartnerActor } from "@/app/lib/partner/partnerAccess";

export const PARTNER_SHARE_CREATED_AUDIT = "partner.share_created";
export const PARTNER_SHARE_REVOKED_AUDIT = "partner.share_revoked";

export const PARTNER_SHARE_ACCESS_UNAVAILABLE =
  "Partner access is unavailable.";
export const PARTNER_SHARE_ORDER_UNAVAILABLE =
  "This order is not available for sharing.";
export const PARTNER_SHARE_TOKEN_INVALID = "This share link is invalid.";

const RAW_TOKEN_BYTES = 32;
const RAW_TOKEN_MAX_LEN = 128;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

function hashOpaqueToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function mintRawToken(): string {
  return randomBytes(RAW_TOKEN_BYTES).toString("base64url");
}

function normalizeOrderId(orderIdRaw: string): string | null {
  const orderId = (orderIdRaw ?? "").trim();
  if (!orderId || orderId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(orderId)) {
    return null;
  }
  return orderId;
}

function isSafeRawTokenShape(rawToken: string): boolean {
  const trimmed = (rawToken ?? "").trim();
  if (!trimmed || trimmed.length > RAW_TOKEN_MAX_LEN) return false;
  if (!BASE64URL_RE.test(trimmed)) return false;
  // 256-bit source encodes to 43 base64url chars without padding.
  if (trimmed.length < 43) return false;
  return true;
}

export function buildPartnerEsimSharePath(rawToken: string): string {
  return `/share/${rawToken}`;
}

async function loadOwnedCompletedPartnerOrder(options: {
  partnerId: string;
  orderId: string;
}): Promise<{ orderId: string; partnerId: string } | null> {
  const purchase = await prisma.partnerEsimPurchase.findFirst({
    where: {
      partnerId: options.partnerId,
      orderId: options.orderId,
      status: PartnerEsimPurchaseStatus.COMPLETED,
      fundingSource: OrderFundingSource.PARTNER_BALANCE,
    },
    select: {
      orderId: true,
      partnerId: true,
      order: {
        select: {
          id: true,
          status: true,
          fundingSource: true,
        },
      },
    },
  });

  if (!purchase?.orderId || !purchase.order) return null;
  if (purchase.order.status !== OrderStatus.COMPLETED) return null;
  if (purchase.order.fundingSource !== OrderFundingSource.PARTNER_BALANCE) {
    return null;
  }
  return { orderId: purchase.order.id, partnerId: purchase.partnerId };
}

export type CreatePartnerEsimShareTokenResult =
  | {
      ok: true;
      rawToken: string;
      sharePath: string;
      shareTokenId: string;
      orderId: string;
    }
  | { ok: false; error: string };

/**
 * Mint one new share token for a completed Partner-owned Order.
 * Atomically revokes any previously active token for that Order (one active link).
 * Raw token is returned only to the immediate caller.
 */
export async function createPartnerEsimShareToken(options: {
  partnerUserId: string;
  orderId: string;
}): Promise<CreatePartnerEsimShareTokenResult> {
  const actor = await requireActivePartnerActor(options.partnerUserId);
  if (!actor) {
    return { ok: false, error: PARTNER_SHARE_ACCESS_UNAVAILABLE };
  }

  const orderId = normalizeOrderId(options.orderId);
  if (!orderId) {
    return { ok: false, error: PARTNER_SHARE_ORDER_UNAVAILABLE };
  }

  const owned = await loadOwnedCompletedPartnerOrder({
    partnerId: actor.partnerId,
    orderId,
  });
  if (!owned) {
    return { ok: false, error: PARTNER_SHARE_ORDER_UNAVAILABLE };
  }

  const rawToken = mintRawToken();
  const tokenHash = hashOpaqueToken(rawToken);
  const now = new Date();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const purchase = await tx.partnerEsimPurchase.findFirst({
        where: {
          partnerId: actor.partnerId,
          orderId,
          status: PartnerEsimPurchaseStatus.COMPLETED,
          fundingSource: OrderFundingSource.PARTNER_BALANCE,
        },
        select: {
          order: {
            select: { id: true, status: true, fundingSource: true },
          },
        },
      });
      if (
        !purchase?.order ||
        purchase.order.status !== OrderStatus.COMPLETED ||
        purchase.order.fundingSource !== OrderFundingSource.PARTNER_BALANCE
      ) {
        throw new Error("partner_share_order_unavailable");
      }

      const revoked = await tx.partnerEsimShareToken.updateMany({
        where: {
          orderId,
          partnerId: actor.partnerId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      const row = await tx.partnerEsimShareToken.create({
        data: {
          partnerId: actor.partnerId,
          orderId,
          tokenHash,
        },
        select: { id: true },
      });

      return { shareTokenId: row.id, revokedCount: revoked.count };
    });

    if (created.revokedCount > 0) {
      await writeAuditLog({
        actorUserId: actor.userId,
        action: PARTNER_SHARE_REVOKED_AUDIT,
        targetType: "Order",
        targetId: orderId,
        metadata: {
          partnerId: actor.partnerId,
          orderId,
          rotated: true,
        },
      });
    }

    await writeAuditLog({
      actorUserId: actor.userId,
      action: PARTNER_SHARE_CREATED_AUDIT,
      targetType: "PartnerEsimShareToken",
      targetId: created.shareTokenId,
      metadata: {
        partnerId: actor.partnerId,
        orderId,
        shareTokenId: created.shareTokenId,
      },
    });

    return {
      ok: true,
      rawToken,
      sharePath: buildPartnerEsimSharePath(rawToken),
      shareTokenId: created.shareTokenId,
      orderId,
    };
  } catch {
    return { ok: false, error: PARTNER_SHARE_ORDER_UNAVAILABLE };
  }
}

/**
 * Boolean-only probe. Never returns a raw token or hash.
 * Used so the Partner UI can show Create vs Regenerate without faking recovery.
 */
export async function hasActivePartnerEsimShareToken(options: {
  partnerUserId: string;
  orderId: string;
}): Promise<boolean> {
  const actor = await requireActivePartnerActor(options.partnerUserId);
  if (!actor) return false;

  const orderId = normalizeOrderId(options.orderId);
  if (!orderId) return false;

  const owned = await loadOwnedCompletedPartnerOrder({
    partnerId: actor.partnerId,
    orderId,
  });
  if (!owned) return false;

  const active = await prisma.partnerEsimShareToken.count({
    where: {
      orderId,
      partnerId: actor.partnerId,
      revokedAt: null,
    },
  });
  return active > 0;
}

export type RevokePartnerEsimShareTokenResult =
  | { ok: true; alreadyRevoked: boolean }
  | { ok: false; error: string };

/**
 * Revoke the active share token(s) for a Partner-owned Order.
 * Idempotent when already revoked or none exist for an owned completed Order.
 */
export async function revokePartnerEsimShareToken(options: {
  partnerUserId: string;
  orderId: string;
}): Promise<RevokePartnerEsimShareTokenResult> {
  const actor = await requireActivePartnerActor(options.partnerUserId);
  if (!actor) {
    return { ok: false, error: PARTNER_SHARE_ACCESS_UNAVAILABLE };
  }

  const orderId = normalizeOrderId(options.orderId);
  if (!orderId) {
    return { ok: false, error: PARTNER_SHARE_ORDER_UNAVAILABLE };
  }

  const owned = await loadOwnedCompletedPartnerOrder({
    partnerId: actor.partnerId,
    orderId,
  });
  if (!owned) {
    return { ok: false, error: PARTNER_SHARE_ORDER_UNAVAILABLE };
  }

  const now = new Date();
  const revoked = await prisma.partnerEsimShareToken.updateMany({
    where: {
      orderId,
      partnerId: actor.partnerId,
      revokedAt: null,
    },
    data: { revokedAt: now },
  });

  if (revoked.count === 0) {
    return { ok: true, alreadyRevoked: true };
  }

  await writeAuditLog({
    actorUserId: actor.userId,
    action: PARTNER_SHARE_REVOKED_AUDIT,
    targetType: "Order",
    targetId: orderId,
    metadata: {
      partnerId: actor.partnerId,
      orderId,
    },
  });

  return { ok: true, alreadyRevoked: false };
}

export type ResolvePartnerEsimShareTokenResult =
  | {
      ok: true;
      shareTokenId: string;
      partnerId: string;
      orderId: string;
      destination: string | null;
      planName: string | null;
    }
  | { ok: false };

/**
 * Public resolver foundation. Invalid / unknown / revoked / malformed all
 * return the same { ok: false } — no existence leak. No ICCID, wallet,
 * provider cost, discount, payment, or admin fields.
 * Does not apply time-based expiry. Age of createdAt is ignored.
 */
export async function resolvePartnerEsimShareToken(
  rawToken: string
): Promise<ResolvePartnerEsimShareTokenResult> {
  if (!isSafeRawTokenShape(rawToken)) {
    return { ok: false };
  }

  const trimmed = rawToken.trim();
  const tokenHash = hashOpaqueToken(trimmed);

  const row = await prisma.partnerEsimShareToken.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
    },
    select: {
      id: true,
      partnerId: true,
      orderId: true,
      tokenHash: true,
      order: {
        select: {
          destination: true,
          planName: true,
        },
      },
    },
  });

  if (!row || !safeEqualHex(row.tokenHash, tokenHash)) {
    return { ok: false };
  }

  return {
    ok: true,
    shareTokenId: row.id,
    partnerId: row.partnerId,
    orderId: row.orderId,
    destination: row.order.destination ?? null,
    planName: row.order.planName ?? null,
  };
}
