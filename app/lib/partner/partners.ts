/**
 * Partner admin management: create, discount, disable/reactivate, list/detail.
 */
import "server-only";

import {
  PartnerWalletTransactionType,
  Prisma,
  Role,
  WalletCurrency,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { findActiveAdminActor } from "@/app/lib/auth/adminAccess";
import { isValidEmailFormat, normalizeEmail } from "@/app/lib/auth/email";
import { sendPartnerInviteEmail } from "@/app/lib/email/sendPartnerInviteEmail";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { maskAdminEmail } from "@/app/lib/admin/display";
import {
  formatDiscountBpsAsPercent,
  parseDiscountPercentToBps,
} from "@/app/lib/partner/discount";
import {
  buildPartnerInviteSetupUrl,
  mintPartnerInviteToken,
} from "@/app/lib/partner/partnerInvite";
import { formatUsdCents, formatWalletDateTime } from "@/app/lib/wallet/display";

export const PARTNER_CREATED_AUDIT = "partner.created";
export const PARTNER_DISCOUNT_CHANGED_AUDIT = "partner.discount_changed";
export const PARTNER_DISABLED_AUDIT = "partner.disabled";
export const PARTNER_REACTIVATED_AUDIT = "partner.reactivated";
export const PARTNER_INVITATION_RESENT_AUDIT = "partner.invitation_resent";
export const PARTNER_MANAGEMENT_BLOCKED_AUDIT = "partner.management_action_blocked";
export const PARTNER_PASSWORD_SETUP_COMPLETED_AUDIT =
  "partner.password_setup_completed";

const PARTNERS_PAGE_SIZE = 20;
const NAME_MIN = 1;
const NAME_MAX = 120;

export type PartnerStatusLabel = "Active" | "Invited" | "Disabled" | "Deleted";

export type PartnerListRow = {
  id: string;
  userId: string;
  createdAtLabel: string;
  name: string;
  emailMasked: string;
  discountPercentLabel: string;
  balanceLabel: string;
  statusLabel: PartnerStatusLabel;
};

export type PartnersPageResult = {
  rows: PartnerListRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  search: string;
  status: PartnerStatusFilter;
};

export type PartnerStatusFilter = "ALL" | "ACTIVE" | "INVITED" | "DISABLED" | "DELETED";

export type PartnerWalletTxRow = {
  id: string;
  typeLabel: string;
  amountLabel: string;
  balanceBeforeLabel: string;
  balanceAfterLabel: string;
  reason: string;
  referenceLabel: string | null;
  createdAtLabel: string;
  createdByAdminLabel: string;
};

export type PartnerDetail = {
  id: string;
  userId: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  name: string;
  email: string;
  statusLabel: PartnerStatusLabel;
  discountPercentLabel: string;
  discountBps: number;
  discountVersion: number;
  statusVersion: number;
  disabledAtLabel: string;
  deletedAtLabel: string;
  credentialsAvailableLabel: "Yes" | "No";
  balanceCents: number;
  balanceLabel: string;
  hasWallet: boolean;
  totalAddedLabel: string;
  totalDeductedLabel: string;
  transactions: PartnerWalletTxRow[];
};

export type PartnersMutationResult =
  | {
      ok: true;
      message: string;
      partnerId?: string;
      discountVersion?: number;
      statusVersion?: number;
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<
        Record<
          "name" | "email" | "discountPercent" | "expectedVersion" | "reason",
          string
        >
      >;
    };

class PartnersCasConflictError extends Error {
  constructor() {
    super("partners_cas_conflict");
    this.name = "PartnersCasConflictError";
  }
}

function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "Not available";
  return formatWalletDateTime(date);
}

function resolvePartnerStatus(options: {
  deletedAt: Date | null;
  disabledAt: Date | null;
  passwordHash: string | null;
}): PartnerStatusLabel {
  if (options.deletedAt) return "Deleted";
  if (options.disabledAt) return "Disabled";
  if (!options.passwordHash) return "Invited";
  return "Active";
}

function parseExpectedVersion(
  raw: FormDataEntryValue | string | number | null | undefined
): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.trunc(raw);
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseName(raw: FormDataEntryValue | string | null | undefined): {
  ok: true;
  name: string;
} | {
  ok: false;
  error: string;
} {
  const name = String(raw ?? "").trim();
  if (name.length < NAME_MIN) {
    return { ok: false, error: "Name is required." };
  }
  if (name.length > NAME_MAX) {
    return { ok: false, error: `Name must be at most ${NAME_MAX} characters.` };
  }
  return { ok: true, name };
}

function parsePartnerStatusFilter(raw: string | undefined): PartnerStatusFilter {
  const value = (raw ?? "ALL").trim().toUpperCase();
  if (
    value === "ACTIVE" ||
    value === "INVITED" ||
    value === "DISABLED" ||
    value === "DELETED"
  ) {
    return value;
  }
  return "ALL";
}

function parsePartnersPage(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function normalizeSearch(raw: string | undefined): string {
  return (raw ?? "").trim().slice(0, 100);
}

function partnerTxTypeLabel(type: PartnerWalletTransactionType): string {
  switch (type) {
    case PartnerWalletTransactionType.ADMIN_CREDIT:
      return "Admin credit";
    case PartnerWalletTransactionType.ADMIN_DEBIT:
      return "Admin debit";
    case PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT:
      return "Purchase debit";
    case PartnerWalletTransactionType.ESIM_PURCHASE_REFUND:
      return "Purchase refund";
    default:
      return "Transaction";
  }
}

function formatPartnerTxAmount(
  amountCents: number,
  type: PartnerWalletTransactionType
): string {
  if (
    type === PartnerWalletTransactionType.ADMIN_DEBIT ||
    type === PartnerWalletTransactionType.ESIM_PURCHASE_DEBIT
  ) {
    return formatUsdCents(-Math.abs(amountCents));
  }
  const body = formatUsdCents(Math.abs(amountCents));
  if (body === "$0.00") return body;
  return `+${body}`;
}

async function auditBlocked(options: {
  actorUserId: string;
  targetId?: string | null;
  failureCode: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await writeAuditLog({
    actorUserId: options.actorUserId,
    action: PARTNER_MANAGEMENT_BLOCKED_AUDIT,
    targetType: "PartnerProfile",
    targetId: options.targetId ?? null,
    metadata: {
      failureCode: options.failureCode,
      ...(options.metadata && typeof options.metadata === "object"
        ? (options.metadata as Record<string, unknown>)
        : {}),
    },
  });
}

function buildStatusWhere(
  status: PartnerStatusFilter
): Prisma.PartnerProfileWhereInput {
  switch (status) {
    case "ACTIVE":
      return {
        disabledAt: null,
        user: { deletedAt: null, passwordHash: { not: null } },
      };
    case "INVITED":
      return {
        disabledAt: null,
        user: { deletedAt: null, passwordHash: null },
      };
    case "DISABLED":
      return { disabledAt: { not: null }, user: { deletedAt: null } };
    case "DELETED":
      return { user: { deletedAt: { not: null } } };
    default:
      return {};
  }
}

export async function listPartnersPage(options: {
  q?: string;
  status?: string;
  page?: string;
}): Promise<PartnersPageResult> {
  const search = normalizeSearch(options.q);
  const status = parsePartnerStatusFilter(options.status);
  const page = parsePartnersPage(options.page);

  const where: Prisma.PartnerProfileWhereInput = {
    ...buildStatusWhere(status),
    ...(search
      ? {
          OR: [
            { user: { name: { contains: search, mode: "insensitive" } } },
            { user: { email: { contains: search, mode: "insensitive" } } },
            { id: search },
            { userId: search },
          ],
        }
      : {}),
  };

  const totalCount = await prisma.partnerProfile.count({ where });
  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / PARTNERS_PAGE_SIZE);
  const safePage = page > totalPages ? totalPages : page;
  const skip = (safePage - 1) * PARTNERS_PAGE_SIZE;

  const rows = await prisma.partnerProfile.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip,
    take: PARTNERS_PAGE_SIZE,
    select: {
      id: true,
      userId: true,
      discountBps: true,
      disabledAt: true,
      createdAt: true,
      user: {
        select: {
          name: true,
          email: true,
          deletedAt: true,
          passwordHash: true,
        },
      },
      walletAccount: {
        select: { balanceCents: true },
      },
    },
  });

  return {
    rows: rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      createdAtLabel: formatDateTime(row.createdAt),
      name: row.user.name,
      emailMasked: maskAdminEmail(row.user.email),
      discountPercentLabel: `${formatDiscountBpsAsPercent(row.discountBps)}%`,
      balanceLabel: formatUsdCents(row.walletAccount?.balanceCents ?? 0),
      statusLabel: resolvePartnerStatus({
        deletedAt: row.user.deletedAt,
        disabledAt: row.disabledAt,
        passwordHash: row.user.passwordHash,
      }),
    })),
    page: safePage,
    pageSize: PARTNERS_PAGE_SIZE,
    totalCount,
    totalPages,
    search,
    status,
  };
}

export async function getPartnerDetail(
  partnerId: string
): Promise<PartnerDetail | null> {
  const id = (partnerId ?? "").trim();
  if (!id || id.length > 64) return null;

  const row = await prisma.partnerProfile.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      discountBps: true,
      discountVersion: true,
      statusVersion: true,
      disabledAt: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          name: true,
          email: true,
          deletedAt: true,
          passwordHash: true,
        },
      },
      walletAccount: {
        select: {
          balanceCents: true,
          transactions: {
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              id: true,
              type: true,
              amountCents: true,
              balanceBeforeCents: true,
              balanceAfterCents: true,
              reason: true,
              referenceType: true,
              referenceId: true,
              createdAt: true,
              createdByAdmin: {
                select: { name: true, email: true },
              },
            },
          },
        },
      },
    },
  });

  if (!row) return null;

  const [creditAgg, debitAgg] = await Promise.all([
    prisma.partnerWalletTransaction.aggregate({
      where: {
        type: PartnerWalletTransactionType.ADMIN_CREDIT,
        wallet: { partnerId: row.id },
      },
      _sum: { amountCents: true },
    }),
    prisma.partnerWalletTransaction.aggregate({
      where: {
        type: PartnerWalletTransactionType.ADMIN_DEBIT,
        wallet: { partnerId: row.id },
      },
      _sum: { amountCents: true },
    }),
  ]);

  const balanceCents = row.walletAccount?.balanceCents ?? 0;

  return {
    id: row.id,
    userId: row.userId,
    createdAtLabel: formatDateTime(row.createdAt),
    updatedAtLabel: formatDateTime(row.updatedAt),
    name: row.user.name,
    email: row.user.email,
    statusLabel: resolvePartnerStatus({
      deletedAt: row.user.deletedAt,
      disabledAt: row.disabledAt,
      passwordHash: row.user.passwordHash,
    }),
    discountPercentLabel: `${formatDiscountBpsAsPercent(row.discountBps)}%`,
    discountBps: row.discountBps,
    discountVersion: row.discountVersion,
    statusVersion: row.statusVersion,
    disabledAtLabel: formatDateTime(row.disabledAt),
    deletedAtLabel: formatDateTime(row.user.deletedAt),
    credentialsAvailableLabel: row.user.passwordHash ? "Yes" : "No",
    balanceCents,
    balanceLabel: formatUsdCents(balanceCents),
    hasWallet: Boolean(row.walletAccount),
    totalAddedLabel: formatUsdCents(creditAgg._sum.amountCents ?? 0),
    totalDeductedLabel: formatUsdCents(debitAgg._sum.amountCents ?? 0),
    transactions: (row.walletAccount?.transactions ?? []).map((tx) => ({
      id: tx.id,
      typeLabel: partnerTxTypeLabel(tx.type),
      amountLabel: formatPartnerTxAmount(tx.amountCents, tx.type),
      balanceBeforeLabel: formatUsdCents(tx.balanceBeforeCents),
      balanceAfterLabel: formatUsdCents(tx.balanceAfterCents),
      reason: tx.reason,
      referenceLabel:
        tx.referenceType || tx.referenceId
          ? [tx.referenceType, tx.referenceId].filter(Boolean).join(" · ")
          : null,
      createdAtLabel: formatDateTime(tx.createdAt),
      createdByAdminLabel: tx.createdByAdmin
        ? tx.createdByAdmin.name || tx.createdByAdmin.email
        : "Not available",
    })),
  };
}

export async function createPartner(options: {
  adminUserId: string;
  name: FormDataEntryValue | string | null;
  email: FormDataEntryValue | string | null;
  discountPercentRaw: FormDataEntryValue | string | null;
}): Promise<PartnersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await findActiveAdminActor(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const nameParsed = parseName(options.name);
  if (!nameParsed.ok) {
    return {
      ok: false,
      error: nameParsed.error,
      fieldErrors: { name: nameParsed.error },
    };
  }

  const email = normalizeEmail(String(options.email ?? ""));
  if (!isValidEmailFormat(email)) {
    return {
      ok: false,
      error: "Enter a valid email address.",
      fieldErrors: { email: "Enter a valid email address." },
    };
  }

  const discountParsed = parseDiscountPercentToBps(options.discountPercentRaw);
  if (!discountParsed.ok) {
    return {
      ok: false,
      error: discountParsed.error,
      fieldErrors: { discountPercent: discountParsed.error },
    };
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, deletedAt: true },
  });

  if (existing) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: existing.id,
      failureCode: "email_collision",
      metadata: { existingRole: existing.role },
    });
    return {
      ok: false,
      error:
        "This email is already registered. Partner accounts require a dedicated email.",
      fieldErrors: {
        email:
          "This email is already registered. Partner accounts require a dedicated email.",
      },
    };
  }

  const now = new Date();
  let createdPartnerId = "";

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: nameParsed.name,
          email,
          role: Role.PARTNER,
          passwordHash: null,
          emailVerifiedAt: now,
          credentialsChangedAt: now,
        },
        select: { id: true },
      });

      const profile = await tx.partnerProfile.create({
        data: {
          userId: user.id,
          discountBps: discountParsed.discountBps,
          discountVersion: 0,
          statusVersion: 0,
        },
        select: { id: true },
      });

      await tx.partnerWalletAccount.create({
        data: {
          partnerId: profile.id,
          currency: WalletCurrency.USD,
          balanceCents: 0,
          version: 0,
        },
      });

      createdPartnerId = profile.id;

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: PARTNER_CREATED_AUDIT,
          targetType: "PartnerProfile",
          targetId: profile.id,
          metadata: {
            partnerUserId: user.id,
            discountBps: discountParsed.discountBps,
            inviteMethod: "opaque_setup_link",
          },
        },
      });
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      await auditBlocked({
        actorUserId: actor.id,
        failureCode: "email_unique_conflict",
      });
      return {
        ok: false,
        error: "This email cannot be used right now. Please reload and try again.",
      };
    }
    throw err;
  }

  let inviteEmailDelivered = false;
  const user = await prisma.user.findFirst({
    where: { partnerProfile: { id: createdPartnerId } },
    select: { id: true, email: true },
  });

  if (user) {
    try {
      const minted = await mintPartnerInviteToken(user.id);
      const setupUrl = buildPartnerInviteSetupUrl(minted.rawToken);
      const sent = await sendPartnerInviteEmail({
        to: user.email,
        setupUrl,
      });
      if (sent.ok) {
        inviteEmailDelivered = true;
      } else {
        console.error("Partner invite email failed:", sent.reason);
      }
    } catch (err) {
      console.error(
        "Partner invite mint/send failed:",
        err instanceof Error ? err.name : "unknown"
      );
    }
  }

  return {
    ok: true,
    partnerId: createdPartnerId,
    message: inviteEmailDelivered
      ? "Partner invited. They will receive a password setup link by email."
      : "Partner account created, but the invitation email could not be sent. Use Resend setup link on the Partner detail page, or ask them to use Forgot Password after a link is delivered.",
  };
}

/**
 * Resend Partner setup link when passwordHash is still null (Invited).
 * Supersedes prior unused invite tokens. Never returns/logs the raw token.
 */
export async function resendPartnerInvitation(options: {
  adminUserId: string;
  partnerId: string;
}): Promise<PartnersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.partnerId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await findActiveAdminActor(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const partnerId = (options.partnerId ?? "").trim();
  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner is unavailable." };
  }

  const partner = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      disabledAt: true,
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          passwordHash: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!partner || partner.user.role !== Role.PARTNER) {
    return { ok: false, error: "Partner is unavailable." };
  }
  if (partner.user.deletedAt) {
    return { ok: false, error: "Deleted partners cannot receive invitations." };
  }
  if (partner.disabledAt) {
    return {
      ok: false,
      error: "Reactivate the Partner before resending a setup link.",
    };
  }
  if (partner.user.passwordHash) {
    return {
      ok: false,
      error:
        "This Partner already has a password. Use Forgot Password for recovery.",
    };
  }

  let inviteEmailDelivered = false;
  try {
    const minted = await mintPartnerInviteToken(partner.user.id);
    const setupUrl = buildPartnerInviteSetupUrl(minted.rawToken);
    const sent = await sendPartnerInviteEmail({
      to: partner.user.email,
      setupUrl,
    });
    inviteEmailDelivered = sent.ok;
    if (!sent.ok) {
      console.error("Partner invite resend email failed:", sent.reason);
    }
  } catch (err) {
    console.error(
      "Partner invite resend failed:",
      err instanceof Error ? err.name : "unknown"
    );
  }

  await writeAuditLog({
    actorUserId: actor.id,
    action: PARTNER_INVITATION_RESENT_AUDIT,
    targetType: "PartnerProfile",
    targetId: partner.id,
    metadata: {
      partnerUserId: partner.user.id,
      emailDelivered: inviteEmailDelivered,
    },
  });

  if (!inviteEmailDelivered) {
    return {
      ok: false,
      error:
        "Could not send the setup link email. The previous unused links were superseded; try again shortly.",
    };
  }

  return {
    ok: true,
    partnerId: partner.id,
    message: "Setup link resent. It expires in 30 minutes.",
  };
}

export async function changePartnerDiscount(options: {
  adminUserId: string;
  partnerId: string;
  discountPercentRaw: FormDataEntryValue | string | null;
  expectedVersion: FormDataEntryValue | string | number | null;
}): Promise<PartnersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.partnerId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await findActiveAdminActor(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const partnerId = (options.partnerId ?? "").trim();
  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner not found." };
  }

  const expectedVersion = parseExpectedVersion(options.expectedVersion);
  if (expectedVersion === null) {
    return {
      ok: false,
      error: "This page is out of date. Please reload and try again.",
      fieldErrors: {
        expectedVersion: "This page is out of date. Please reload and try again.",
      },
    };
  }

  const discountParsed = parseDiscountPercentToBps(options.discountPercentRaw);
  if (!discountParsed.ok) {
    return {
      ok: false,
      error: discountParsed.error,
      fieldErrors: { discountPercent: discountParsed.error },
    };
  }

  const profile = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      discountBps: true,
      discountVersion: true,
      disabledAt: true,
      user: { select: { deletedAt: true, role: true } },
    },
  });

  if (
    !profile ||
    profile.user.role !== Role.PARTNER ||
    profile.user.deletedAt ||
    profile.disabledAt
  ) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: partnerId,
      failureCode: "partner_unavailable",
    });
    return { ok: false, error: "Partner is unavailable." };
  }

  if (profile.discountBps === discountParsed.discountBps) {
    return {
      ok: true,
      message: "Discount unchanged.",
      discountVersion: profile.discountVersion,
    };
  }

  const nextVersion = expectedVersion + 1;

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.partnerProfile.updateMany({
        where: {
          id: partnerId,
          discountVersion: expectedVersion,
          disabledAt: null,
          user: { deletedAt: null, role: Role.PARTNER },
        },
        data: {
          discountBps: discountParsed.discountBps,
          discountVersion: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new PartnersCasConflictError();
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: PARTNER_DISCOUNT_CHANGED_AUDIT,
          targetType: "PartnerProfile",
          targetId: partnerId,
          metadata: {
            previousDiscountBps: profile.discountBps,
            discountBps: discountParsed.discountBps,
            discountVersion: nextVersion,
          },
        },
      });
    });
  } catch (err) {
    if (err instanceof PartnersCasConflictError) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: partnerId,
        failureCode: "stale_version",
        metadata: { expectedVersion },
      });
      return {
        ok: false,
        error: "This page is out of date. Please reload and try again.",
        fieldErrors: {
          expectedVersion: "This page is out of date. Please reload and try again.",
        },
      };
    }
    throw err;
  }

  return {
    ok: true,
    message: "Partner discount updated.",
    discountVersion: nextVersion,
  };
}

export async function disablePartner(options: {
  adminUserId: string;
  partnerId: string;
  expectedVersion: FormDataEntryValue | string | number | null;
  reason: FormDataEntryValue | string | null;
}): Promise<PartnersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.partnerId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await findActiveAdminActor(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const partnerId = (options.partnerId ?? "").trim();
  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner not found." };
  }

  const expectedVersion = parseExpectedVersion(options.expectedVersion);
  if (expectedVersion === null) {
    return {
      ok: false,
      error: "This page is out of date. Please reload and try again.",
      fieldErrors: {
        expectedVersion: "This page is out of date. Please reload and try again.",
      },
    };
  }

  const reason = String(options.reason ?? "").trim();
  if (reason.length < 8 || reason.length > 500) {
    return {
      ok: false,
      error: "Enter a reason between 8 and 500 characters.",
      fieldErrors: { reason: "Enter a reason between 8 and 500 characters." },
    };
  }

  const profile = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      userId: true,
      disabledAt: true,
      statusVersion: true,
      user: { select: { deletedAt: true, role: true } },
    },
  });

  if (!profile || profile.user.role !== Role.PARTNER || profile.user.deletedAt) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: partnerId,
      failureCode: "partner_unavailable",
    });
    return { ok: false, error: "Partner not found." };
  }

  if (profile.disabledAt) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: partnerId,
      failureCode: "already_disabled",
    });
    return { ok: false, error: "This partner is already disabled." };
  }

  const now = new Date();
  const nextVersion = expectedVersion + 1;

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.partnerProfile.updateMany({
        where: {
          id: partnerId,
          statusVersion: expectedVersion,
          disabledAt: null,
          user: { deletedAt: null, role: Role.PARTNER },
        },
        data: {
          disabledAt: now,
          statusVersion: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new PartnersCasConflictError();
      }

      await tx.user.update({
        where: { id: profile.userId },
        data: { credentialsChangedAt: now },
      });

      await tx.session.deleteMany({ where: { userId: profile.userId } });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: PARTNER_DISABLED_AUDIT,
          targetType: "PartnerProfile",
          targetId: partnerId,
          metadata: {
            reason,
            statusVersion: nextVersion,
          },
        },
      });
    });
  } catch (err) {
    if (err instanceof PartnersCasConflictError) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: partnerId,
        failureCode: "stale_version",
        metadata: { expectedVersion },
      });
      return {
        ok: false,
        error: "This page is out of date. Please reload and try again.",
        fieldErrors: {
          expectedVersion: "This page is out of date. Please reload and try again.",
        },
      };
    }
    throw err;
  }

  return {
    ok: true,
    message: "Partner disabled.",
    statusVersion: nextVersion,
  };
}

export async function reactivatePartner(options: {
  adminUserId: string;
  partnerId: string;
  expectedVersion: FormDataEntryValue | string | number | null;
  reason: FormDataEntryValue | string | null;
}): Promise<PartnersMutationResult> {
  const sameOrigin = await assertSameOriginAdminRequest();
  if (!sameOrigin) {
    await auditBlocked({
      actorUserId: options.adminUserId,
      targetId: options.partnerId,
      failureCode: "same_origin",
    });
    return { ok: false, error: "Request could not be verified. Please try again." };
  }

  const actor = await findActiveAdminActor(options.adminUserId);
  if (!actor) {
    return { ok: false, error: "Not authorized." };
  }

  const partnerId = (options.partnerId ?? "").trim();
  if (!partnerId || partnerId.length > 64) {
    return { ok: false, error: "Partner not found." };
  }

  const expectedVersion = parseExpectedVersion(options.expectedVersion);
  if (expectedVersion === null) {
    return {
      ok: false,
      error: "This page is out of date. Please reload and try again.",
      fieldErrors: {
        expectedVersion: "This page is out of date. Please reload and try again.",
      },
    };
  }

  const reason = String(options.reason ?? "").trim();
  if (reason.length < 8 || reason.length > 500) {
    return {
      ok: false,
      error: "Enter a reason between 8 and 500 characters.",
      fieldErrors: { reason: "Enter a reason between 8 and 500 characters." },
    };
  }

  const profile = await prisma.partnerProfile.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      userId: true,
      disabledAt: true,
      statusVersion: true,
      user: { select: { deletedAt: true, role: true } },
    },
  });

  if (!profile || profile.user.role !== Role.PARTNER || profile.user.deletedAt) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: partnerId,
      failureCode: "partner_unavailable",
    });
    return { ok: false, error: "Partner not found." };
  }

  if (!profile.disabledAt) {
    await auditBlocked({
      actorUserId: actor.id,
      targetId: partnerId,
      failureCode: "not_disabled",
    });
    return { ok: false, error: "Only disabled partners can be reactivated." };
  }

  const now = new Date();
  const nextVersion = expectedVersion + 1;

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.partnerProfile.updateMany({
        where: {
          id: partnerId,
          statusVersion: expectedVersion,
          disabledAt: { not: null },
          user: { deletedAt: null, role: Role.PARTNER },
        },
        data: {
          disabledAt: null,
          statusVersion: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new PartnersCasConflictError();
      }

      await tx.user.update({
        where: { id: profile.userId },
        data: { credentialsChangedAt: now },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: PARTNER_REACTIVATED_AUDIT,
          targetType: "PartnerProfile",
          targetId: partnerId,
          metadata: {
            reason,
            statusVersion: nextVersion,
          },
        },
      });
    });
  } catch (err) {
    if (err instanceof PartnersCasConflictError) {
      await auditBlocked({
        actorUserId: actor.id,
        targetId: partnerId,
        failureCode: "stale_version",
        metadata: { expectedVersion },
      });
      return {
        ok: false,
        error: "This page is out of date. Please reload and try again.",
        fieldErrors: {
          expectedVersion: "This page is out of date. Please reload and try again.",
        },
      };
    }
    throw err;
  }

  return {
    ok: true,
    message: "Partner reactivated.",
    statusVersion: nextVersion,
  };
}
