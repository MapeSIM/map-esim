"use server";

import { requireRole } from "@/app/lib/auth/session";
import {
  createPartnerEsimShareToken,
  hasActivePartnerEsimShareToken,
  revokePartnerEsimShareToken,
} from "@/app/lib/partner/partnerEsimShareToken";

export type PartnerShareLinkCreateState =
  | {
      ok: true;
      sharePath: string;
      rawToken: string;
      rotated: boolean;
    }
  | { ok: false; error: string };

export type PartnerShareLinkRevokeState =
  | { ok: true; alreadyRevoked: boolean }
  | { ok: false; error: string };

export async function hasActivePartnerShareLinkAction(
  orderId: string
): Promise<boolean> {
  const user = await requireRole("PARTNER");
  return hasActivePartnerEsimShareToken({
    partnerUserId: user.id,
    orderId,
  });
}

/**
 * Mint or rotate a share token. Raw token is returned once and is never stored.
 * If an active token already exists, this rotates it (old link stops working).
 */
export async function createOrRegeneratePartnerShareLinkAction(
  orderId: string
): Promise<PartnerShareLinkCreateState> {
  const user = await requireRole("PARTNER");
  const hadActive = await hasActivePartnerEsimShareToken({
    partnerUserId: user.id,
    orderId,
  });
  const created = await createPartnerEsimShareToken({
    partnerUserId: user.id,
    orderId,
  });
  if (!created.ok) return { ok: false, error: created.error };
  return {
    ok: true,
    sharePath: created.sharePath,
    rawToken: created.rawToken,
    rotated: hadActive,
  };
}

export async function revokePartnerShareLinkAction(
  orderId: string
): Promise<PartnerShareLinkRevokeState> {
  const user = await requireRole("PARTNER");
  return revokePartnerEsimShareToken({
    partnerUserId: user.id,
    orderId,
  });
}
