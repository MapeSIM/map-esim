import "server-only";

import {
  AdminPackageAssignmentStatus,
  OrderFundingSource,
  Role,
} from "@prisma/client";
import { maskAdminEmail } from "@/app/lib/admin/display";
import { prisma } from "@/app/lib/db";
import { formatProviderCostLabel } from "@/app/lib/esim/adminPackageAssignment";
import {
  fetchDestinations,
  fetchOffersForCountry,
  sanitizeCountryHint,
  toVerifiedCheckoutOffer,
} from "@/app/lib/vesim/server";
import { formatUsdCents } from "@/app/lib/wallet/display";

function formatDateTime(date: Date): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

export type AdminAssignableCustomer = {
  id: string;
  name: string;
  emailMasked: string;
  accountActive: boolean;
};

export async function getAdminAssignableCustomer(
  customerUserId: string
): Promise<AdminAssignableCustomer | null> {
  const id = (customerUserId ?? "").trim();
  if (!id || id.length > 64) return null;

  const customer = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      deletedAt: true,
    },
  });

  if (!customer || customer.role !== Role.CUSTOMER) {
    return null;
  }

  return {
    id: customer.id,
    name: customer.name,
    emailMasked: maskAdminEmail(customer.email),
    accountActive: !customer.deletedAt,
  };
}

export type AdminDestinationOption = {
  code: string;
  name: string;
  kind: string;
};

export type AdminOfferOption = {
  offerId: string;
  name: string;
  dataLabel: string;
  validityLabel: string;
  costLabel: string;
  destinationLabel: string;
};

export async function listAdminAssignmentDestinations(): Promise<
  AdminDestinationOption[]
> {
  try {
    const destinations = await fetchDestinations();
    return destinations
      .filter((d) => Boolean(d.code?.trim()))
      .slice(0, 400)
      .map((d) => ({
        code: d.code,
        name: d.name,
        kind: d.kind,
      }));
  } catch {
    return [];
  }
}

export async function listAdminAssignmentOffers(
  destinationCode: string
): Promise<AdminOfferOption[]> {
  const code = sanitizeCountryHint(destinationCode);
  if (!code) return [];

  try {
    const offers = await fetchOffersForCountry(code);
    const out: AdminOfferOption[] = [];
    for (const offer of offers) {
      const verified = toVerifiedCheckoutOffer(offer, code);
      if (!verified) continue;
      out.push({
        offerId: verified.offerId,
        name: verified.name,
        dataLabel: verified.dataFormatted || "Not available",
        validityLabel:
          verified.durationDays != null
            ? `${verified.durationDays} Days`
            : "Not available",
        costLabel: `${formatUsdCents(Math.round(verified.providerPriceUSD * 100))} USD`,
        destinationLabel:
          verified.countryName || verified.countryCode || code,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export type AdminAssignmentReview = {
  assignmentId: string;
  customerId: string;
  customerName: string;
  customerEmailMasked: string;
  destination: string;
  planName: string;
  dataAllowance: string;
  validity: string;
  offerId: string;
  fundingLabel: "Company-funded";
  providerCostLabel: string;
  walletBeforeLabel: string;
  walletAfterLabel: string;
  reason: string;
  internalReference: string | null;
  idempotencyKey: string;
  status: AdminPackageAssignmentStatus;
};

export async function getAdminAssignmentReview(
  customerUserId: string,
  assignmentId: string
): Promise<AdminAssignmentReview | null> {
  const customerId = (customerUserId ?? "").trim();
  const id = (assignmentId ?? "").trim();
  if (!customerId || !id || customerId.length > 64 || id.length > 64) {
    return null;
  }

  const row = await prisma.adminPackageAssignment.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      offerId: true,
      destinationCode: true,
      destinationName: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      fundingSource: true,
      providerCostCents: true,
      reason: true,
      internalReference: true,
      idempotencyKey: true,
      status: true,
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          deletedAt: true,
          walletAccount: { select: { balanceCents: true } },
        },
      },
    },
  });

  if (
    !row ||
    row.customerUserId !== customerId ||
    row.customer.role !== Role.CUSTOMER ||
    row.fundingSource !== OrderFundingSource.COMPANY_FUNDED
  ) {
    return null;
  }

  const balanceCents = row.customer.walletAccount?.balanceCents ?? 0;
  const balanceLabel = formatUsdCents(balanceCents);

  return {
    assignmentId: row.id,
    customerId: row.customer.id,
    customerName: row.customer.name,
    customerEmailMasked: maskAdminEmail(row.customer.email),
    destination:
      row.destinationName || row.destinationCode || "Not available",
    planName: row.planName || "Not available",
    dataAllowance: row.dataAllowance || "Not available",
    validity: row.validity || "Not available",
    offerId: row.offerId,
    fundingLabel: "Company-funded",
    providerCostLabel: formatProviderCostLabel(row.providerCostCents),
    walletBeforeLabel: balanceLabel,
    walletAfterLabel: balanceLabel,
    reason: row.reason,
    internalReference: row.internalReference,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
  };
}

export type AdminAssignmentSuccess = {
  assignmentId: string;
  customerId: string;
  customerName: string;
  customerEmailMasked: string;
  destination: string;
  planName: string;
  dataAllowance: string;
  validity: string;
  fundingLabel: "Company-funded";
  orderId: string;
  walletUnchangedLabel: string;
  completedAtLabel: string;
};

export async function getAdminCompletedAssignment(
  customerUserId: string,
  assignmentId: string
): Promise<AdminAssignmentSuccess | null> {
  const customerId = (customerUserId ?? "").trim();
  const id = (assignmentId ?? "").trim();
  if (!customerId || !id || customerId.length > 64 || id.length > 64) {
    return null;
  }

  const row = await prisma.adminPackageAssignment.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      destinationName: true,
      destinationCode: true,
      planName: true,
      dataAllowance: true,
      validity: true,
      fundingSource: true,
      status: true,
      orderId: true,
      completedAt: true,
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          walletAccount: { select: { balanceCents: true } },
        },
      },
    },
  });

  if (
    !row ||
    row.customerUserId !== customerId ||
    row.customer.role !== Role.CUSTOMER ||
    row.status !== AdminPackageAssignmentStatus.COMPLETED ||
    row.fundingSource !== OrderFundingSource.COMPANY_FUNDED ||
    !row.orderId
  ) {
    return null;
  }

  const balanceCents = row.customer.walletAccount?.balanceCents ?? 0;

  return {
    assignmentId: row.id,
    customerId: row.customer.id,
    customerName: row.customer.name,
    customerEmailMasked: maskAdminEmail(row.customer.email),
    destination:
      row.destinationName || row.destinationCode || "Not available",
    planName: row.planName || "Not available",
    dataAllowance: row.dataAllowance || "Not available",
    validity: row.validity || "Not available",
    fundingLabel: "Company-funded",
    orderId: row.orderId,
    walletUnchangedLabel: `${formatUsdCents(balanceCents)} USD`,
    completedAtLabel: row.completedAt
      ? formatDateTime(row.completedAt)
      : "Not available",
  };
}
