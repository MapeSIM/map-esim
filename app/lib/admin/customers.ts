import "server-only";

import { Prisma, Role } from "@prisma/client";
import {
  ADMIN_CUSTOMERS_PAGE_SIZE,
  maskAdminEmail,
  normalizeAdminSearchQuery,
  parseAdminCustomerAccountFilter,
  parseAdminCustomerAuthFilter,
  parseAdminCustomersPage,
  parseAdminCustomerVerificationFilter,
  resolveAdminCustomersPageSize,
  type AdminCustomerAccountFilter,
  type AdminCustomerAuthFilter,
  type AdminCustomerVerificationFilter,
} from "@/app/lib/admin/display";
import { prisma } from "@/app/lib/db";
import { resolveCustomerAccountStatus } from "@/app/lib/auth/customerAccountStatus";

export type AdminCustomerAuthMethodLabel =
  | "Google"
  | "Credentials"
  | "Google + Credentials"
  | "Not available";

export type AdminCustomerListRow = {
  id: string;
  createdAtLabel: string;
  name: string;
  emailMasked: string;
  authMethodLabel: AdminCustomerAuthMethodLabel;
  emailVerifiedLabel: string;
  accountStatusLabel: "Active" | "Blocked" | "Deleted";
  localOrderCount: number;
};

export type AdminCustomersPageResult = {
  rows: AdminCustomerListRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  search: string;
  verification: AdminCustomerVerificationFilter;
  auth: AdminCustomerAuthFilter;
  account: AdminCustomerAccountFilter;
};

export type AdminCustomerDetail = {
  id: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  name: string;
  email: string;
  roleLabel: string;
  emailVerifiedLabel: string;
  emailVerifiedAtLabel: string;
  accountStatusLabel: "Active" | "Blocked" | "Deleted";
  deletedAtLabel: string;
  blockedAtLabel: string;
  blockedReasonLabel: string;
  accountStatusVersion: number;
  authMethodLabel: AdminCustomerAuthMethodLabel;
  googleLinkedLabel: "Yes" | "No";
  credentialsAvailableLabel: "Yes" | "No";
  legalConsentStatusLabel: string;
  termsAcceptedAtLabel: string;
  termsVersionLabel: string;
  privacyAcknowledgedAtLabel: string;
  privacyVersionLabel: string;
  legalConsentSourceLabel: string;
  localOrderCount: number;
  completedOrderCount: number;
  claimedOrderCount: number;
};

function displayOrUnavailable(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : "Not available";
}

function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "Not available";
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

function authMethodLabel(
  hasGoogle: boolean,
  hasCredentials: boolean
): AdminCustomerAuthMethodLabel {
  if (hasGoogle && hasCredentials) return "Google + Credentials";
  if (hasGoogle) return "Google";
  if (hasCredentials) return "Credentials";
  return "Not available";
}

function buildCustomerWhere(options: {
  search: string;
  verification: AdminCustomerVerificationFilter;
  auth: AdminCustomerAuthFilter;
  account: AdminCustomerAccountFilter;
}): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    role: Role.CUSTOMER,
  };

  if (options.account === "ACTIVE") {
    where.deletedAt = null;
    where.blockedAt = null;
  } else if (options.account === "BLOCKED") {
    where.deletedAt = null;
    where.blockedAt = { not: null };
  } else if (options.account === "DELETED") {
    where.deletedAt = { not: null };
  }

  if (options.verification === "VERIFIED") {
    where.emailVerifiedAt = { not: null };
  } else if (options.verification === "UNVERIFIED") {
    where.emailVerifiedAt = null;
  }

  if (options.auth === "GOOGLE") {
    where.accounts = { some: { provider: "google" } };
  } else if (options.auth === "CREDENTIALS") {
    where.passwordHash = { not: null };
  }

  const q = options.search;
  if (q) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : []),
      {
        OR: [
          { id: { equals: q } },
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
    ];
  }

  return where;
}

export type AdminCustomersQueryInput = {
  q?: string | null;
  verification?: string | null;
  auth?: string | null;
  account?: string | null;
  page?: string | null;
};

/**
 * Paginated CUSTOMER-only admin list. Call only after requireRole("ADMIN").
 * Sequential count → findMany → credential id lookup (no Promise.all fan-out).
 * Never selects password hashes, OAuth tokens, or provider account IDs.
 */
export async function getAdminCustomersPage(
  input: AdminCustomersQueryInput = {}
): Promise<AdminCustomersPageResult> {
  const search = normalizeAdminSearchQuery(input.q);
  const verification = parseAdminCustomerVerificationFilter(input.verification);
  const auth = parseAdminCustomerAuthFilter(input.auth);
  const account = parseAdminCustomerAccountFilter(input.account);
  const pageSize = resolveAdminCustomersPageSize(ADMIN_CUSTOMERS_PAGE_SIZE);
  let page = parseAdminCustomersPage(input.page);

  const where = buildCustomerWhere({ search, verification, auth, account });

  const totalCount = await prisma.user.count({ where });
  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);
  if (page > totalPages) page = totalPages;

  const skip = (page - 1) * pageSize;
  const pageRows = await prisma.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize,
    skip,
    select: {
      id: true,
      createdAt: true,
      name: true,
      email: true,
      emailVerifiedAt: true,
      deletedAt: true,
      blockedAt: true,
      accounts: {
        where: { provider: "google" },
        select: { provider: true },
        take: 1,
      },
      _count: {
        select: { orders: true },
      },
    },
  });

  const pageIds = pageRows.map((row) => row.id);
  const credentialIds = new Set<string>();
  if (pageIds.length > 0) {
    // Detect credentials without selecting passwordHash into the result set.
    const withCredentials = await prisma.user.findMany({
      where: {
        id: { in: pageIds },
        passwordHash: { not: null },
      },
      select: { id: true },
    });
    for (const row of withCredentials) {
      credentialIds.add(row.id);
    }
  }

  const rows: AdminCustomerListRow[] = pageRows.map((row) => {
    const hasGoogle = row.accounts.length > 0;
    const hasCredentials = credentialIds.has(row.id);
    return {
      id: row.id,
      createdAtLabel: formatDateTime(row.createdAt),
      name: displayOrUnavailable(row.name),
      emailMasked: maskAdminEmail(row.email),
      authMethodLabel: authMethodLabel(hasGoogle, hasCredentials),
      emailVerifiedLabel: row.emailVerifiedAt ? "Verified" : "Unverified",
      accountStatusLabel: (() => {
        const s = resolveCustomerAccountStatus(row);
        if (s === "DELETED") return "Deleted";
        if (s === "BLOCKED") return "Blocked";
        return "Active";
      })(),
      localOrderCount: row._count.orders,
    };
  });

  return {
    rows,
    page,
    pageSize,
    totalCount,
    totalPages,
    search,
    verification,
    auth,
    account,
  };
}

/**
 * CUSTOMER-only detail. Missing / ADMIN / invalid id → null (caller notFound).
 */
export async function getAdminCustomerDetail(
  id: string
): Promise<AdminCustomerDetail | null> {
  const customerId = (id ?? "").trim();
  if (!customerId || customerId.length > 64) return null;

  const row = await prisma.user.findFirst({
    where: {
      id: customerId,
      role: Role.CUSTOMER,
    },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      name: true,
      email: true,
      role: true,
      emailVerifiedAt: true,
      deletedAt: true,
      blockedAt: true,
      blockedReason: true,
      accountStatusVersion: true,
      termsAcceptedAt: true,
      termsVersion: true,
      privacyAcknowledgedAt: true,
      privacyVersion: true,
      legalConsentSource: true,
      accounts: {
        where: { provider: "google" },
        select: { provider: true },
        take: 1,
      },
      _count: {
        select: { orders: true },
      },
    },
  });

  if (!row) return null;

  const credentialsRow = await prisma.user.findFirst({
    where: {
      id: row.id,
      passwordHash: { not: null },
    },
    select: { id: true },
  });

  const completedOrderCount = await prisma.order.count({
    where: { userId: row.id, status: "COMPLETED" },
  });
  const claimedOrderCount = await prisma.order.count({
    where: { userId: row.id, claimStatus: "CLAIMED" },
  });

  const hasGoogle = row.accounts.length > 0;
  const hasCredentials = Boolean(credentialsRow);
  const consentComplete =
    Boolean(row.termsAcceptedAt) && Boolean(row.privacyAcknowledgedAt);

  return {
    id: row.id,
    createdAtLabel: formatDateTime(row.createdAt),
    updatedAtLabel: formatDateTime(row.updatedAt),
    name: displayOrUnavailable(row.name),
    email: displayOrUnavailable(row.email),
    roleLabel: row.role,
    emailVerifiedLabel: row.emailVerifiedAt ? "Verified" : "Unverified",
    emailVerifiedAtLabel: formatDateTime(row.emailVerifiedAt),
    accountStatusLabel: (() => {
      const s = resolveCustomerAccountStatus(row);
      if (s === "DELETED") return "Deleted";
      if (s === "BLOCKED") return "Blocked";
      return "Active";
    })(),
    deletedAtLabel: formatDateTime(row.deletedAt),
    blockedAtLabel: formatDateTime(row.blockedAt),
    blockedReasonLabel: displayOrUnavailable(row.blockedReason),
    accountStatusVersion: row.accountStatusVersion,
    authMethodLabel: authMethodLabel(hasGoogle, hasCredentials),
    googleLinkedLabel: hasGoogle ? "Yes" : "No",
    credentialsAvailableLabel: hasCredentials ? "Yes" : "No",
    legalConsentStatusLabel: consentComplete
      ? "Complete"
      : "Incomplete / missing",
    termsAcceptedAtLabel: formatDateTime(row.termsAcceptedAt),
    termsVersionLabel: displayOrUnavailable(row.termsVersion),
    privacyAcknowledgedAtLabel: formatDateTime(row.privacyAcknowledgedAt),
    privacyVersionLabel: displayOrUnavailable(row.privacyVersion),
    legalConsentSourceLabel: displayOrUnavailable(row.legalConsentSource),
    localOrderCount: row._count.orders,
    completedOrderCount,
    claimedOrderCount,
  };
}
