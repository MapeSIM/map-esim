/**
 * Partner Public API checkout: quote + wallet-credit purchase.
 */
import "server-only";

import { prisma } from "@/app/lib/db";
import { buyPartnerEsimPurchase } from "@/app/lib/partner/partnerPurchaseBuy";
import { getPartnerApiOffer } from "@/app/lib/partnerApi/partnerApiCatalog";
import {
  getPartnerOwnedOrderInstall,
  type PartnerOrderInstallDto,
} from "@/app/lib/partner/partnerOrderInstall";
import { resolveOrderIccidPlaintext } from "@/app/lib/orders/orderIccidResolve";
import { normalizeOfferId } from "@/app/lib/vesim/server";
import { formatUsdCents } from "@/app/lib/wallet/display";
import type { PartnerApiActor } from "@/app/lib/partnerApiAuth";

export type PartnerApiQuoteResult =
  | {
      ok: true;
      offerId: string;
      quantity: number;
      unitPriceCents: number;
      unitPriceUsd: number;
      unitPriceLabel: string;
      totalPriceCents: number;
      totalPriceUsd: number;
      totalPriceLabel: string;
      currency: "USD";
      walletBalanceCents: number;
      walletBalanceLabel: string;
      sufficientBalance: boolean;
    }
  | { ok: false; code: "NOT_FOUND" | "INVALID" | "UNAVAILABLE"; error: string };

export type PartnerApiCreditResult =
  | {
      ok: true;
      orderId: string;
      purchaseId: string;
      offerId: string;
      amountCents: number;
      amountLabel: string;
      remainingBalanceCents: number;
      remainingBalanceLabel: string;
      iccid: string | null;
      lpa: string | null;
      qrUrl: string | null;
      install: PartnerOrderInstallDto | null;
      duplicate: boolean;
    }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "INVALID"
        | "INSUFFICIENT_FUNDS"
        | "UNAVAILABLE"
        | "IDEMPOTENCY_REQUIRED";
      error: string;
    };

function parseQuantity(raw: unknown): number | null {
  if (raw == null || raw === "") return 1;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > 1) return null; // Phase 1: quantity must be 1
  return n;
}

export async function quotePartnerApiCheckout(options: {
  actor: PartnerApiActor;
  offerId: unknown;
  quantity?: unknown;
}): Promise<PartnerApiQuoteResult> {
  const offerId = normalizeOfferId(String(options.offerId ?? ""));
  if (!offerId) {
    return { ok: false, code: "INVALID", error: "offerId is required." };
  }
  const quantity = parseQuantity(options.quantity);
  if (quantity == null) {
    return {
      ok: false,
      code: "INVALID",
      error: "quantity must be 1 for Phase 1.",
    };
  }

  const offer = await getPartnerApiOffer({
    offerId,
    discountBps: options.actor.discountBps,
  });
  if (!offer) {
    return { ok: false, code: "NOT_FOUND", error: "Offer not found." };
  }

  const wallet = await prisma.partnerWalletAccount.findUnique({
    where: { partnerId: options.actor.partnerId },
    select: { balanceCents: true },
  });
  const walletBalanceCents = wallet?.balanceCents ?? 0;
  const totalPriceCents = offer.partnerPriceCents * quantity;
  return {
    ok: true,
    offerId: offer.offerId,
    quantity,
    unitPriceCents: offer.partnerPriceCents,
    unitPriceUsd: offer.partnerPriceUsd,
    unitPriceLabel: offer.partnerPriceLabel,
    totalPriceCents,
    totalPriceUsd: Number((totalPriceCents / 100).toFixed(2)),
    totalPriceLabel: `${formatUsdCents(totalPriceCents)} USD`,
    currency: "USD",
    walletBalanceCents,
    walletBalanceLabel: `${formatUsdCents(walletBalanceCents)} USD`,
    sufficientBalance: walletBalanceCents >= totalPriceCents,
  };
}

function normalizeIdempotencyKey(raw: unknown): string | null {
  const key = String(raw ?? "").trim();
  if (!key || key.length < 8 || key.length > 128) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) return null;
  return key;
}

export async function creditPartnerApiCheckout(options: {
  actor: PartnerApiActor;
  offerId: unknown;
  quantity?: unknown;
  idempotencyKey: unknown;
  countryHint?: unknown;
}): Promise<PartnerApiCreditResult> {
  const offerId = normalizeOfferId(String(options.offerId ?? ""));
  if (!offerId) {
    return { ok: false, code: "INVALID", error: "offerId is required." };
  }
  const quantity = parseQuantity(options.quantity);
  if (quantity == null) {
    return {
      ok: false,
      code: "INVALID",
      error: "quantity must be 1 for Phase 1.",
    };
  }
  const idempotencyKey = normalizeIdempotencyKey(options.idempotencyKey);
  if (!idempotencyKey) {
    return {
      ok: false,
      code: "IDEMPOTENCY_REQUIRED",
      error:
        "Idempotency-Key header (or idempotencyKey body field) is required (8–128 chars).",
    };
  }

  const quote = await quotePartnerApiCheckout({
    actor: options.actor,
    offerId,
    quantity,
  });
  if (!quote.ok) {
    return { ok: false, code: quote.code === "NOT_FOUND" ? "NOT_FOUND" : "INVALID", error: quote.error };
  }
  if (!quote.sufficientBalance) {
    return {
      ok: false,
      code: "INSUFFICIENT_FUNDS",
      error: "Insufficient partner wallet balance for this purchase.",
    };
  }

  const bought = await buyPartnerEsimPurchase({
    partnerUserId: options.actor.userId,
    offerId,
    idempotencyKey,
    countryHint:
      typeof options.countryHint === "string" ? options.countryHint : null,
    useWallet: true,
  });

  if (!bought.ok) {
    if (bought.kind === "insufficient_balance") {
      return {
        ok: false,
        code: "INSUFFICIENT_FUNDS",
        error: bought.message,
      };
    }
    return {
      ok: false,
      code: bought.kind === "invalid" ? "INVALID" : "UNAVAILABLE",
      error: bought.message,
    };
  }

  if (bought.kind === "checkout_redirect") {
    return {
      ok: false,
      code: "INSUFFICIENT_FUNDS",
      error:
        "This purchase requires a card remainder. Top up the Partner wallet and retry with full wallet credit.",
    };
  }

  if (bought.kind !== "success" && bought.kind !== "duplicate_success") {
    return {
      ok: false,
      code: "UNAVAILABLE",
      error: "Purchase did not complete successfully.",
    };
  }

  const orderId = (bought.orderId ?? "").trim();
  if (!orderId) {
    return {
      ok: false,
      code: "UNAVAILABLE",
      error: "Purchase completed without a local order. Contact support.",
    };
  }

  const purchase = await prisma.partnerEsimPurchase.findFirst({
    where: { id: bought.purchaseId, partnerId: options.actor.partnerId },
    select: { partnerChargeCents: true },
  });
  const amountCents = purchase?.partnerChargeCents ?? quote.totalPriceCents;

  const wallet = await prisma.partnerWalletAccount.findUnique({
    where: { partnerId: options.actor.partnerId },
    select: { balanceCents: true },
  });
  const remainingBalanceCents = wallet?.balanceCents ?? 0;

  const iccid = await resolveOrderIccidPlaintext(orderId);
  const installRes = await getPartnerOwnedOrderInstall(
    options.actor.userId,
    orderId
  );
  const install = installRes.ok ? installRes.dto : null;

  return {
    ok: true,
    orderId,
    purchaseId: bought.purchaseId,
    offerId,
    amountCents,
    amountLabel: `${formatUsdCents(amountCents)} USD`,
    remainingBalanceCents,
    remainingBalanceLabel: `${formatUsdCents(remainingBalanceCents)} USD`,
    iccid,
    lpa: install?.lpa ?? null,
    qrUrl: install?.qrViewHref ?? install?.qrDownloadHref ?? null,
    install,
    duplicate: bought.kind === "duplicate_success",
  };
}
