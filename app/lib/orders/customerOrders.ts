import "server-only";

import { OrderStatus, Role } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  buildCustomerSessionInstallActions,
  fetchBrokerOrderPayload,
  type CustomerSessionInstallActions,
} from "@/app/lib/orders/customerOrderInstall";

function displayOrUnavailable(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : "Not available";
}

function formatOrderDate(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

function planPackageLabel(
  planName: string | null | undefined,
  dataAllowance: string | null | undefined
): string {
  const plan = (planName ?? "").trim();
  const data = (dataAllowance ?? "").trim();
  if (plan && data) return `${plan} · ${data}`;
  if (plan) return plan;
  if (data) return data;
  return "Not available";
}

export type CustomerOrderListRow = {
  id: string;
  destination: string;
  planPackage: string;
  statusLabel: string;
  createdAtLabel: string;
};

/**
 * Orders linked to this CUSTOMER userId only — never by email.
 * Read-only. Never creates orders or wallets.
 */
export async function listCustomerOrders(
  userId: string
): Promise<CustomerOrderListRow[]> {
  const id = (userId ?? "").trim();
  if (!id || id.length > 64) return [];

  const rows = await prisma.order.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      destination: true,
      planName: true,
      dataAllowance: true,
      status: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    destination: displayOrUnavailable(row.destination),
    planPackage: planPackageLabel(row.planName, row.dataAllowance),
    statusLabel: displayOrUnavailable(row.status),
    createdAtLabel: formatOrderDate(row.createdAt),
  }));
}

export type CustomerOrderDetail = {
  id: string;
  destination: string;
  planPackage: string;
  validity: string;
  statusLabel: string;
  createdAtLabel: string;
  installActions: CustomerSessionInstallActions | null;
  installAvailable: boolean;
};

/**
 * Load one order only when it belongs to the signed-in CUSTOMER.
 * Install hrefs use session-authenticated local-order routes only
 * (no access tokens in URLs).
 */
export async function getCustomerOwnedOrderDetail(
  userId: string,
  orderId: string
): Promise<CustomerOrderDetail | null> {
  const ownerId = (userId ?? "").trim();
  const localOrderId = (orderId ?? "").trim();
  if (
    !ownerId ||
    !localOrderId ||
    ownerId.length > 64 ||
    localOrderId.length > 64 ||
    !/^[A-Za-z0-9_-]+$/.test(localOrderId)
  ) {
    return null;
  }

  const owner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, role: true, deletedAt: true },
  });
  if (!owner || owner.deletedAt || owner.role !== Role.CUSTOMER) {
    return null;
  }

  const order = await prisma.order.findFirst({
    where: {
      id: localOrderId,
      userId: owner.id,
    },
    select: {
      id: true,
      providerOrderId: true,
      destination: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      status: true,
      createdAt: true,
    },
  });

  if (!order) {
    return null;
  }

  let installActions: CustomerSessionInstallActions | null = null;
  if (order.status === OrderStatus.COMPLETED) {
    const brokerPayload = await fetchBrokerOrderPayload(order.providerOrderId);
    if (brokerPayload) {
      const actions = buildCustomerSessionInstallActions(
        order.id,
        brokerPayload
      );
      if (actions.hasInstallDetails) {
        installActions = actions;
      }
    }
  }

  return {
    id: order.id,
    destination: displayOrUnavailable(order.destination),
    planPackage: planPackageLabel(order.planName, order.dataAllowance),
    validity: displayOrUnavailable(order.validity),
    statusLabel: displayOrUnavailable(order.status),
    createdAtLabel: formatOrderDate(order.createdAt),
    installActions,
    installAvailable: Boolean(installActions?.hasInstallDetails),
  };
}
