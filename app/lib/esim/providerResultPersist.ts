/**
 * Safe persistence of observed provider order references on durable attempts.
 * Never stores raw provider payloads. Never triggers a second checkout.
 */
import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";

export const PROVIDER_RESULT_SUCCESS = "success";
export const PROVIDER_RESULT_DECLINED = "declined";
export const PROVIDER_RESULT_UNCERTAIN = "uncertain";
export const PROVIDER_RESULT_NONE = "none";

export type ProviderResultKind =
  | typeof PROVIDER_RESULT_SUCCESS
  | typeof PROVIDER_RESULT_DECLINED
  | typeof PROVIDER_RESULT_UNCERTAIN
  | typeof PROVIDER_RESULT_NONE;

export type PersistProviderObservationInput = {
  providerOrderId?: string | null;
  providerResultKind: ProviderResultKind;
  safeProviderStatusCode?: string | null;
};

export type PersistProviderObservationResult =
  | { ok: true; stored: boolean; providerOrderId: string | null }
  | { ok: false; reason: "conflict_existing_different" | "conflict_other_attempt" | "invalid_id" };

function normalizeProviderOrderId(raw: string | null | undefined): string | null {
  const id = (raw ?? "").trim();
  if (!id) return null;
  if (id.length > 128) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) return null;
  return id;
}

function normalizeStatusCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").trim().slice(0, 64);
  if (!code) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(code)) return null;
  return code;
}

/**
 * Persist observed providerOrderId + safe result metadata on a wallet purchase.
 * Idempotent same-id updates. Refuses to overwrite a different stored id.
 */
export async function persistWalletPurchaseProviderObservation(
  purchaseId: string,
  input: PersistProviderObservationInput,
  tx?: Prisma.TransactionClient
): Promise<PersistProviderObservationResult> {
  const client = tx ?? prisma;
  const id = (purchaseId ?? "").trim();
  if (!id) return { ok: false, reason: "invalid_id" };

  const providerOrderId = normalizeProviderOrderId(input.providerOrderId);
  const safeCode = normalizeStatusCode(input.safeProviderStatusCode);
  const now = new Date();

  const current = await client.walletEsimPurchase.findUnique({
    where: { id },
    select: { id: true, providerOrderId: true },
  });
  if (!current) return { ok: false, reason: "invalid_id" };

  if (
    providerOrderId &&
    current.providerOrderId &&
    current.providerOrderId !== providerOrderId
  ) {
    return { ok: false, reason: "conflict_existing_different" };
  }

  if (providerOrderId) {
    const otherPurchase = await client.walletEsimPurchase.findFirst({
      where: {
        providerOrderId,
        NOT: { id },
      },
      select: { id: true },
    });
    if (otherPurchase) {
      return { ok: false, reason: "conflict_other_attempt" };
    }
    const otherAssignment = await client.adminPackageAssignment.findFirst({
      where: { providerOrderId },
      select: { id: true },
    });
    if (otherAssignment) {
      return { ok: false, reason: "conflict_other_attempt" };
    }
  }

  await client.walletEsimPurchase.update({
    where: { id },
    data: {
      ...(providerOrderId && !current.providerOrderId
        ? { providerOrderId }
        : {}),
      providerResultKind: input.providerResultKind,
      providerObservedAt: now,
      ...(safeCode ? { safeProviderStatusCode: safeCode } : {}),
    },
  });

  return {
    ok: true,
    stored: Boolean(providerOrderId),
    providerOrderId: providerOrderId || current.providerOrderId,
  };
}

/**
 * Persist observed providerOrderId + safe result metadata on an assignment.
 */
export async function persistAssignmentProviderObservation(
  assignmentId: string,
  input: PersistProviderObservationInput,
  tx?: Prisma.TransactionClient
): Promise<PersistProviderObservationResult> {
  const client = tx ?? prisma;
  const id = (assignmentId ?? "").trim();
  if (!id) return { ok: false, reason: "invalid_id" };

  const providerOrderId = normalizeProviderOrderId(input.providerOrderId);
  const safeCode = normalizeStatusCode(input.safeProviderStatusCode);
  const now = new Date();

  const current = await client.adminPackageAssignment.findUnique({
    where: { id },
    select: { id: true, providerOrderId: true },
  });
  if (!current) return { ok: false, reason: "invalid_id" };

  if (
    providerOrderId &&
    current.providerOrderId &&
    current.providerOrderId !== providerOrderId
  ) {
    return { ok: false, reason: "conflict_existing_different" };
  }

  if (providerOrderId) {
    const otherAssignment = await client.adminPackageAssignment.findFirst({
      where: {
        providerOrderId,
        NOT: { id },
      },
      select: { id: true },
    });
    if (otherAssignment) {
      return { ok: false, reason: "conflict_other_attempt" };
    }
    const otherPurchase = await client.walletEsimPurchase.findFirst({
      where: { providerOrderId },
      select: { id: true },
    });
    if (otherPurchase) {
      return { ok: false, reason: "conflict_other_attempt" };
    }
  }

  await client.adminPackageAssignment.update({
    where: { id },
    data: {
      ...(providerOrderId && !current.providerOrderId
        ? { providerOrderId }
        : {}),
      providerResultKind: input.providerResultKind,
      providerObservedAt: now,
      ...(safeCode ? { safeProviderStatusCode: safeCode } : {}),
    },
  });

  return {
    ok: true,
    stored: Boolean(providerOrderId),
    providerOrderId: providerOrderId || current.providerOrderId,
  };
}
