/**
 * Shared Email Center delivery logging helper.
 * Writes AuditLog rows that `/admin/emails` already indexes via EMAIL_CENTER_AUDIT_ACTIONS.
 * Never throws. Never stores full secrets or raw SMTP stacks.
 */
import "server-only";

import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { sanitizeEmailHeaderValue } from "@/app/lib/email/config";
import { sanitizeFailureReason } from "@/app/lib/admin/emailCenterShared";

export type EmailCenterDeliveryStatus =
  | "sent"
  | "failed"
  | "skipped"
  | "not_configured"
  | "sending";

export type RecordEmailCenterDeliveryInput = {
  action: string;
  targetType: string;
  targetId: string;
  deliveryStatus: EmailCenterDeliveryStatus | string;
  /** Optional actor; outbound system mail uses null. */
  actorUserId?: string | null;
  orderId?: string | null;
  orderReference?: string | null;
  subject?: string | null;
  /**
   * Redacted / non-secret recipient hint only (never require full mailbox storage).
   * Prefer role labels or masked local-part@domain.
   */
  recipientHint?: string | null;
  emailEvent?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

/** Mask a mailbox for Email Center metadata — keep domain, hide local part. */
export function maskEmailCenterRecipient(
  email: string | null | undefined
): string | null {
  const raw = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!raw || !raw.includes("@")) return null;
  const [local, domain] = raw.split("@");
  if (!domain) return null;
  const localMask =
    !local || local.length <= 1
      ? "•"
      : `${local.slice(0, 1)}•••`;
  return `${localMask}@${domain.slice(0, 80)}`;
}

/**
 * Record one outbound email attempt for Admin Email Center.
 * Safe to await after SMTP; failures here never affect checkout.
 */
export async function recordEmailCenterDelivery(
  input: RecordEmailCenterDeliveryInput
): Promise<void> {
  const action = String(input.action ?? "")
    .trim()
    .slice(0, 120);
  const targetType = String(input.targetType ?? "")
    .trim()
    .slice(0, 80);
  const targetId = String(input.targetId ?? "")
    .trim()
    .slice(0, 120);
  if (!action || !targetType || !targetId) return;

  const deliveryStatus = String(input.deliveryStatus ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 40);
  if (!deliveryStatus) return;

  const subject = sanitizeEmailHeaderValue(input.subject ?? "", 160) || null;
  const recipientHint = String(input.recipientHint ?? "")
    .trim()
    .slice(0, 120) || null;
  const orderId = String(input.orderId ?? "")
    .trim()
    .slice(0, 120) || null;
  const orderReference = String(input.orderReference ?? "")
    .trim()
    .slice(0, 80) || null;
  const emailEvent = String(input.emailEvent ?? "")
    .trim()
    .slice(0, 80) || null;
  const reason = sanitizeFailureReason(input.reason);

  const metadata: Record<string, unknown> = {
    deliveryStatus,
    ...(orderId ? { orderId } : {}),
    ...(orderReference ? { orderReference } : {}),
    ...(subject ? { subject } : {}),
    ...(recipientHint ? { recipientHint } : {}),
    ...(emailEvent ? { emailEvent } : {}),
    ...(reason ? { reason } : {}),
    ...(input.metadata && typeof input.metadata === "object"
      ? input.metadata
      : {}),
  };

  await writeAuditLog({
    actorUserId: input.actorUserId ?? null,
    action,
    targetType,
    targetId,
    metadata: metadata as Prisma.InputJsonValue,
  });
}
