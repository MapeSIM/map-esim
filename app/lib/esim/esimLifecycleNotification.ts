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
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { BRAND_SITE_URL } from "@/app/lib/brand";
import { prisma } from "@/app/lib/db";
import { isEmailConfigured, sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import {
  renderEsimLifecycleEmailHtml,
  renderEsimLifecycleEmailText,
} from "@/app/lib/email/esimLifecycleTemplate";
import { sendChannelMail } from "@/app/lib/email/transport";
import {
  buildEsimLifecycleEventKey,
  ESIM_LIFECYCLE_CLAIM_TTL_MS,
  ESIM_LIFECYCLE_V1_ENABLED_KINDS,
  formatLifecycleExpiryLabel,
  lifecycleSubject,
  normalizeOpaqueLifecycleErrorCode,
  type EsimLifecycleKind,
} from "@/app/lib/esim/esimLifecycleNotificationShared";
import { isValidEmail } from "@/app/lib/vesim/server";

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
      return "Low data remaining";
    case "DATA_EXHAUSTED":
      return "Data exhausted";
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
 * Ensure a PENDING outbox row exists for this event (unique eventKey).
 * Returns false when a terminal/in-flight row already exists.
 */
export async function ensureEsimLifecycleDeliveryPending(options: {
  orderId: string;
  kind: EsimLifecycleKind;
}): Promise<{ ok: true; deliveryId: string } | { ok: false; reason: string }> {
  const orderId = options.orderId.trim();
  const eventKey = buildEsimLifecycleEventKey(orderId, options.kind);
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
        fundingSource: true,
        userId: true,
        partnerEsimPurchase: { select: { id: true } },
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
      myEsimUrl: `${BRAND_SITE_URL}/account/orders`,
      buyAnotherUrl: `${BRAND_SITE_URL}/countries`,
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
