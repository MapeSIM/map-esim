/**
 * Server-only admin test-data cleanup preview loader (Phase 1).
 * Read-only counts — never deletes, updates, or mutates wallets/payments/orders.
 */
import "server-only";

import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/db";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import { requireRole } from "@/app/lib/auth/session";
import { formatUtcTimestamp } from "@/app/lib/admin/operationsHealthShared";
import {
  TEST_DATA_CLEANUP_FAILED_ATTEMPT_STATUSES,
  TEST_DATA_CLEANUP_PENDING_ATTEMPT_STATUSES,
  type TestDataCleanupPreviewCounts,
} from "@/app/lib/admin/testDataCleanupPreviewShared";

export async function requireActiveAdminForTestDataCleanupPreview() {
  const sessionUser = await requireRole("ADMIN");
  await assertAdminPermission(sessionUser.id, "MANAGE_ADMINS");
  const admin = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      adminDisabledAt: true,
      name: true,
    },
  });
  if (
    !admin ||
    admin.deletedAt ||
    admin.role !== Role.ADMIN ||
    admin.adminDisabledAt
  ) {
    redirect("/signin");
  }
  return { sessionUser, admin };
}

export async function getTestDataCleanupPreviewCounts(): Promise<TestDataCleanupPreviewCounts> {
  const pendingStatuses = [...TEST_DATA_CLEANUP_PENDING_ATTEMPT_STATUSES];
  const failedStatuses = [...TEST_DATA_CLEANUP_FAILED_ATTEMPT_STATUSES];

  const [
    paymentWebhookReceipts,
    alertNotificationStates,
    alertNotificationDeliveries,
    paymentAttemptsTotal,
    paymentAttemptsPending,
    paymentAttemptsFailed,
    refundRequests,
    partnerRefundRequests,
    walletTopupsNonCredited,
    walletTopupsCreditedProtected,
    partnerWalletTopupsNonCredited,
    partnerWalletTopupsCreditedProtected,
    customersProtected,
    partnersProtected,
    ordersProtected,
  ] = await Promise.all([
    prisma.paymentWebhookReceipt.count(),
    prisma.alertNotificationState.count(),
    prisma.alertNotificationDelivery.count(),
    prisma.esimPurchasePaymentAttempt.count(),
    prisma.esimPurchasePaymentAttempt.count({
      where: { status: { in: pendingStatuses } },
    }),
    prisma.esimPurchasePaymentAttempt.count({
      where: { status: { in: failedStatuses } },
    }),
    prisma.refundRequest.count(),
    prisma.partnerRefundRequest.count(),
    prisma.walletTopup.count({
      where: {
        AND: [{ status: { not: "CREDITED" } }, { walletTransactionId: null }],
      },
    }),
    prisma.walletTopup.count({
      where: {
        OR: [{ status: "CREDITED" }, { walletTransactionId: { not: null } }],
      },
    }),
    prisma.partnerWalletTopup.count({
      where: {
        AND: [{ status: { not: "CREDITED" } }, { walletTransactionId: null }],
      },
    }),
    prisma.partnerWalletTopup.count({
      where: {
        OR: [{ status: "CREDITED" }, { walletTransactionId: { not: null } }],
      },
    }),
    prisma.user.count({ where: { role: Role.CUSTOMER } }),
    prisma.partnerProfile.count(),
    prisma.order.count(),
  ]);

  return {
    paymentWebhookReceipts,
    alertNotificationStates,
    alertNotificationDeliveries,
    paymentAttemptsTotal,
    paymentAttemptsPending,
    paymentAttemptsFailed,
    refundRequests,
    partnerRefundRequests,
    walletTopupsNonCredited,
    walletTopupsCreditedProtected,
    partnerWalletTopupsNonCredited,
    partnerWalletTopupsCreditedProtected,
    customersProtected,
    partnersProtected,
    ordersProtected,
    generatedAtLabel: formatUtcTimestamp(new Date()),
  };
}
