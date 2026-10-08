/**
 * Durable customer eSIM lifecycle email delivery (orders channel).
 * CAS claim on EsimLifecycleNotificationDelivery.eventKey — never guesses expiry.
 */
import "server-only";

import {
  EsimLifecycleNotificationDeliveryStatus,
  EsimLifecycleNotificationKind,
  OrderFundingSource,
  Role,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/app/lib/db";
import { isEmailConfigured, sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import {
  buildEsimLifecycleBrowseDestinationsUrl,
  renderEsimLifecycleEmailHtml,
  renderEsimLifecycleEmailText,
  resolveEsimLifecyclePrimaryCta,
} from "@/app/lib/email/esimLifecycleTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";
import {
  ADD_DATA_IDEMPOTENCY_PREFIX,
  parseAddDataSourceOrderId,
} from "@/app/lib/esim/addDataPurchaseLabelShared";
import {
  buildEsimLifecycleEventKey,
  ESIM_LIFECYCLE_CLAIM_TTL_MS,
  ESIM_LIFECYCLE_V1_ENABLED_KINDS,
  evaluateEsimLifecycleEvents,
  formatLifecycleExpiryLabel,
  lifecycleSubject,
  normalizeOpaqueLifecycleErrorCode,
  resolveEsimLifecycleAlertCycleToken,
  type EsimLifecycleKind,
  type EsimLifecycleUsageInput,
} from "@/app/lib/esim/esimLifecycleNotificationShared";
import { isValidEmail, normalizeOfferId } from "@/app/lib/vesim/server";

export type EsimLifecycleNotifyResult =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "not_configured" };

function newClaimToken(): string {
  return randomBytes(16).toString("hex");
}

function toPrismaKind(kind: EsimLifecycleKind): EsimLifecycleNotificationKind {
  return kind as EsimLifecycleNotificationKind;
}

function statusLabelFor(kind: EsimLifecycleKind): string {
  switch (kind) {
    case "EXPIRY_SOON_24H":
      return "Expires in about 24 hours";
    case "EXPIRED":
      return "Expired";
    case "LOW_DATA":
      return "Low data remaining (≤20%)";
    case "DATA_EXHAUSTED":
      return "Data depleted";
    default:
      return "Plan update";
  }
}

function remainingDataLabel(options: {
  remainingDataGB: number | null;
  initialDataGB: number | null;
}): string | null {
  if (
    typeof options.remainingDataGB !== "number" ||
    !Number.isFinite(options.remainingDataGB)
  ) {
    return null;
  }
  const rem = options.remainingDataGB;
  if (
    typeof options.initialDataGB === "number" &&
    Number.isFinite(options.initialDataGB) &&
    options.initialDataGB > 0
  ) {
    return `${rem} GB of ${options.initialDataGB} GB`;
  }
  return `${rem} GB`;
}

/**
 * Count COMPLETED customer Add More Data purchases sourced from this order.
 * Used to scope lifecycle outbox keys so top-ups can re-arm alerts.
 */
export async function countCompletedAddDataForSourceOrder(
  orderId: string
): Promise<number> {
  const id = (orderId ?? "").trim();
  if (!id || id.length > 64) return 0;
  const rows = await prisma.walletEsimPurchase.findMany({
    where: {
      status: WalletEsimPurchaseStatus.COMPLETED,
      idempotencyKey: {
        startsWith: ADD_DATA_IDEMPOTENCY_PREFIX,
        endsWith: `_${id}`,
      },
    },
    select: { idempotencyKey: true },
    take: 200,
  });
  let count = 0;
  for (const row of rows) {
    if (parseAddDataSourceOrderId(row.idempotencyKey) === id) {
      count += 1;
    }
  }
  return count;
}

/**
 * Ensure a PENDING outbox row exists for this event (unique eventKey).
 * Returns false when a terminal/in-flight row already exists.
 */
export async function ensureEsimLifecycleDeliveryPending(options: {
  orderId: string;
  kind: EsimLifecycleKind;
  /** Alert cycle token; omit/"0" keeps legacy unsuffixed eventKey. */
  cycleToken?: string | null;
}): Promise<{ ok: true; deliveryId: string } | { ok: false; reason: string }> {
  const orderId = options.orderId.trim();
  const eventKey = buildEsimLifecycleEventKey(
    orderId,
    options.kind,
    options.cycleToken
  );
  if (!orderId) return { ok: false, reason: "invalid_order" };

  const existing = await prisma.esimLifecycleNotificationDelivery.findUnique({
    where: { eventKey },
    select: { id: true, status: true },
  });
  if (existing) {
    if (
      existing.status === EsimLifecycleNotificationDeliveryStatus.SENT ||
      existing.status === EsimLifecycleNotificationDeliveryStatus.SKIPPED ||
      existing.status === EsimLifecycleNotificationDeliveryStatus.CLAIMED
    ) {
      return { ok: false, reason: "already_handled" };
    }
    if (existing.status === EsimLifecycleNotificationDeliveryStatus.PENDING) {
      return { ok: true, deliveryId: existing.id };
    }
    // FAILED → allow retry by resetting to PENDING if claim expired path reuses row
    if (existing.status === EsimLifecycleNotificationDeliveryStatus.FAILED) {
      const reset = await prisma.esimLifecycleNotificationDelivery.updateMany({
        where: {
          id: existing.id,
          status: EsimLifecycleNotificationDeliveryStatus.FAILED,
        },
        data: {
          status: EsimLifecycleNotificationDeliveryStatus.PENDING,
          claimToken: null,
          claimedAt: null,
          claimExpiresAt: null,
          lastErrorCode: null,
        },
      });
      if (reset.count === 1) {
        return { ok: true, deliveryId: existing.id };
      }
      return { ok: false, reason: "already_handled" };
    }
  }

  try {
    const created = await prisma.esimLifecycleNotificationDelivery.create({
      data: {
        eventKey,
        orderId,
        kind: toPrismaKind(options.kind),
        status: EsimLifecycleNotificationDeliveryStatus.PENDING,
      },
      select: { id: true },
    });
    return { ok: true, deliveryId: created.id };
  } catch {
    // Unique race — treat as already handled / concurrent create.
    const raced = await prisma.esimLifecycleNotificationDelivery.findUnique({
      where: { eventKey },
      select: { id: true, status: true },
    });
    if (
      raced &&
      raced.status === EsimLifecycleNotificationDeliveryStatus.PENDING
    ) {
      return { ok: true, deliveryId: raced.id };
    }
    return { ok: false, reason: "already_handled" };
  }
}

async function claimDelivery(
  deliveryId: string,
  now: Date
): Promise<{ ok: true; claimToken: string } | { ok: false }> {
  const claimToken = newClaimToken();
  const claimExpiresAt = new Date(
    now.getTime() + ESIM_LIFECYCLE_CLAIM_TTL_MS
  );
  const claimed = await prisma.esimLifecycleNotificationDelivery.updateMany({
    where: {
      id: deliveryId,
      OR: [
        { status: EsimLifecycleNotificationDeliveryStatus.PENDING },
        {
          status: EsimLifecycleNotificationDeliveryStatus.CLAIMED,
          claimExpiresAt: { lte: now },
        },
        {
          status: EsimLifecycleNotificationDeliveryStatus.FAILED,
          claimExpiresAt: { lte: now },
        },
      ],
    },
    data: {
      status: EsimLifecycleNotificationDeliveryStatus.CLAIMED,
      claimToken,
      claimedAt: now,
      claimExpiresAt,
      attemptCount: { increment: 1 },
    },
  });
  if (claimed.count !== 1) return { ok: false };
  return { ok: true, claimToken };
}

/**
 * Claim + send one lifecycle notification for an order/kind.
 * Partner-owned orders are skipped. Never throws to callers.
 */
export async function notifyEsimLifecycleEmail(options: {
  orderId: string;
  kind: EsimLifecycleKind;
  expiresAt: string | null;
  remainingDataGB: number | null;
  initialDataGB: number | null;
  now?: Date;
  /** Alert cycle token; omit/"0" keeps legacy unsuffixed eventKey. */
  cycleToken?: string | null;
}): Promise<EsimLifecycleNotifyResult> {
  const orderId = options.orderId.trim();
  if (!orderId) return { status: "skipped", reason: "invalid_order" };
  const now = options.now instanceof Date ? options.now : new Date();

  if (
    !(ESIM_LIFECYCLE_V1_ENABLED_KINDS as readonly string[]).includes(
      options.kind
    )
  ) {
    return { status: "skipped", reason: "kind_disabled_v1" };
  }

  try {
    const ensured = await ensureEsimLifecycleDeliveryPending({
      orderId,
      kind: options.kind,
      cycleToken: options.cycleToken,
    });
    if (!ensured.ok) {
      return { status: "skipped", reason: ensured.reason };
    }

    const claimed = await claimDelivery(ensured.deliveryId, now);
    if (!claimed.ok) {
      return { status: "skipped", reason: "claim_failed" };
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        customerEmail: true,
        destination: true,
        planName: true,
        dataAllowance: true,
        offerId: true,
        providerOrderId: true,
        fundingSource: true,
        userId: true,
        partnerEsimPurchase: { select: { id: true } },
        walletEsimPurchase: { select: { offerId: true } },
        adminPackageAssignment: { select: { offerId: true } },
        user: {
          select: {
            email: true,
            name: true,
            role: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!order || order.status !== "COMPLETED") {
      await markSkipped(ensured.deliveryId, claimed.claimToken, "order_not_ready");
      return { status: "skipped", reason: "order_not_ready" };
    }

    if (
      order.fundingSource === OrderFundingSource.PARTNER_BALANCE ||
      order.partnerEsimPurchase
    ) {
      await markSkipped(ensured.deliveryId, claimed.claimToken, "partner_owned");
      return { status: "skipped", reason: "partner_owned" };
    }

    if (order.user?.role === Role.PARTNER) {
      await markSkipped(ensured.deliveryId, claimed.claimToken, "partner_user");
      return { status: "skipped", reason: "partner_user" };
    }

    const recipient =
      order.user && !order.user.deletedAt
        ? order.user.email.trim()
        : order.customerEmail.trim();
    if (!recipient || !isValidEmail(recipient)) {
      await markSkipped(ensured.deliveryId, claimed.claimToken, "invalid_email");
      return { status: "skipped", reason: "invalid_email" };
    }

    if (!isEmailConfigured("orders")) {
      await markFailed(
        ensured.deliveryId,
        claimed.claimToken,
        "not_configured"
      );
      return { status: "not_configured" };
    }

    const customerName =
      (order.user?.name ?? "").trim() || "Customer";
    const planParts = [order.planName, order.dataAllowance]
      .map((v) => (v ?? "").trim())
      .filter(Boolean);
    const planLabel = planParts.length > 0 ? planParts.join(" · ") : null;
    const destinationLabel = (order.destination ?? "").trim() || null;
    const expiryDateLabel = formatLifecycleExpiryLabel(options.expiresAt, now.getTime());
    const offerId =
      normalizeOfferId(order.offerId) ||
      normalizeOfferId(order.walletEsimPurchase?.offerId) ||
      normalizeOfferId(order.adminPackageAssignment?.offerId) ||
      null;
    const providerOrderId = (order.providerOrderId ?? "").trim() || null;
    // Soft gate only — full catalog supportTopUp is enforced on the add-data page.
    const addDataApplicable = Boolean(offerId && providerOrderId);
    const primaryCta = resolveEsimLifecyclePrimaryCta({
      kind: options.kind,
      orderId: order.id,
      addDataApplicable,
    });
    const payload = {
      kind: options.kind,
      customerName,
      destinationLabel,
      planLabel,
      expiryStatusLabel: statusLabelFor(options.kind),
      expiryDateLabel,
      remainingDataLabel: remainingDataLabel({
        remainingDataGB: options.remainingDataGB,
        initialDataGB: options.initialDataGB,
      }),
      primaryCtaUrl: primaryCta.url,
      primaryCtaLabel: primaryCta.label,
      browseDestinationsUrl: buildEsimLifecycleBrowseDestinationsUrl(),
    };

    const subject = sanitizeEmailHeaderValue(
      lifecycleSubject(options.kind),
      180
    );
    const result = await sendChannelMail({
      channel: "orders",
      to: recipient,
      subject: subject || lifecycleSubject(options.kind),
      html: renderEsimLifecycleEmailHtml(payload),
      text: renderEsimLifecycleEmailText(payload),
    });

    if (!result.ok) {
      const code = normalizeOpaqueLifecycleErrorCode(result.reason);
      if (code === "not_configured") {
        await markFailed(ensured.deliveryId, claimed.claimToken, code);
        return { status: "not_configured" };
      }
      await markFailed(ensured.deliveryId, claimed.claimToken, code);
      return { status: "failed", reason: code };
    }

    await prisma.esimLifecycleNotificationDelivery.updateMany({
      where: {
        id: ensured.deliveryId,
        claimToken: claimed.claimToken,
        status: EsimLifecycleNotificationDeliveryStatus.CLAIMED,
      },
      data: {
        status: EsimLifecycleNotificationDeliveryStatus.SENT,
        sentAt: now,
        claimToken: null,
        claimExpiresAt: null,
        lastErrorCode: null,
      },
    });
    return { status: "sent" };
  } catch {
    console.error("esim_lifecycle_email", "dispatch_error");
    return { status: "failed", reason: "dispatch_error" };
  }
}

/**
 * On-demand path after a successful customer/admin usage refresh.
 * Best-effort — never throws; CAS outbox prevents duplicate sends.
 * Pass prior Order lifecycle cache (before persist) so top-up re-arm works.
 */
export async function maybeDeliverEsimLifecycleNotificationsFromUsage(options: {
  orderId: string;
  usage: {
    expiresAt: string | null;
    daysRemaining?: number | null;
    isExpired: boolean | null;
    isUnlimited: boolean;
    reportsDataAllowance: boolean;
    initialDataGB: number | null;
    remainingDataGB: number | null;
  };
  now?: Date;
  previousRemainingDataGB?: number | null;
  previousInitialDataGB?: number | null;
  previousExpiresAtMs?: number | null;
  completedAddDataCount?: number;
}): Promise<void> {
  const orderId = (options.orderId ?? "").trim();
  if (!orderId || orderId.length > 64) return;
  const now = options.now instanceof Date ? options.now : new Date();
  try {
    const usageInput: EsimLifecycleUsageInput = {
      expiresAt: options.usage.expiresAt,
      daysRemaining: options.usage.daysRemaining ?? null,
      isExpired: options.usage.isExpired,
      isUnlimited: options.usage.isUnlimited,
      reportsDataAllowance: options.usage.reportsDataAllowance,
      initialDataGB: options.usage.initialDataGB,
      remainingDataGB: options.usage.remainingDataGB,
    };
    const completedAddDataCount =
      typeof options.completedAddDataCount === "number" &&
      Number.isFinite(options.completedAddDataCount)
        ? Math.max(0, Math.floor(options.completedAddDataCount))
        : await countCompletedAddDataForSourceOrder(orderId);
    const cycleToken = resolveEsimLifecycleAlertCycleToken({
      completedAddDataCount,
      previousRemainingDataGB: options.previousRemainingDataGB,
      previousInitialDataGB: options.previousInitialDataGB,
      previousExpiresAtMs: options.previousExpiresAtMs,
      currentRemainingDataGB: usageInput.remainingDataGB,
      currentInitialDataGB: usageInput.initialDataGB,
      currentExpiresAt: usageInput.expiresAt,
    });
    const kinds = evaluateEsimLifecycleEvents(usageInput, now.getTime());
    for (const kind of kinds) {
      await notifyEsimLifecycleEmail({
        orderId,
        kind,
        expiresAt: usageInput.expiresAt,
        remainingDataGB: usageInput.remainingDataGB,
        initialDataGB: usageInput.initialDataGB,
        now,
        cycleToken,
      });
    }
  } catch {
    // Manual usage UX must not fail because of notification side effects.
  }
}

async function markSkipped(
  deliveryId: string,
  claimToken: string,
  reason: string
) {
  await prisma.esimLifecycleNotificationDelivery.updateMany({
    where: {
      id: deliveryId,
      claimToken,
      status: EsimLifecycleNotificationDeliveryStatus.CLAIMED,
    },
    data: {
      status: EsimLifecycleNotificationDeliveryStatus.SKIPPED,
      claimToken: null,
      claimExpiresAt: null,
      lastErrorCode: normalizeOpaqueLifecycleErrorCode(reason),
    },
  });
}

async function markFailed(
  deliveryId: string,
  claimToken: string,
  reason: string
) {
  await prisma.esimLifecycleNotificationDelivery.updateMany({
    where: {
      id: deliveryId,
      claimToken,
      status: EsimLifecycleNotificationDeliveryStatus.CLAIMED,
    },
    data: {
      status: EsimLifecycleNotificationDeliveryStatus.FAILED,
      claimToken: null,
      claimExpiresAt: null,
      lastErrorCode: normalizeOpaqueLifecycleErrorCode(reason),
    },
  });
}
