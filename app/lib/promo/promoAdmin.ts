import "server-only";

import { PromoDiscountType, Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/db";
import { writeAuditLog } from "@/app/lib/auth/audit";
import { formatUsdCents } from "@/app/lib/wallet/display";
import {
  assertPromoDateRange,
  assertUsageLimits,
  parseDestinationCodes,
  parseDiscountType,
  parseDiscountValue,
  parseOfferIds,
  parseOptionalDate,
  parseOptionalDescription,
  parseOptionalMinimumOrderCents,
  parseOptionalPositiveInt,
  parseRequiredPromoCode,
  PromoValidationError,
} from "@/app/lib/promo/promoCode";
import { PROMO_AUDIT } from "@/app/lib/promo/promoMessages";

export type PromoAdminListRow = {
  id: string;
  code: string;
  typeLabel: string;
  discountLabel: string;
  statusLabel: string;
  isActive: boolean;
  startsAtLabel: string;
  endsAtLabel: string;
  usesLabel: string;
  usageLimitLabel: string;
  minimumOrderLabel: string;
  applicabilityLabel: string;
};

export type PromoAdminDetail = {
  id: string;
  code: string;
  description: string;
  discountType: PromoDiscountType;
  discountValueInput: string;
  isActive: boolean;
  startsAtInput: string;
  endsAtInput: string;
  totalUsageLimit: string;
  perCustomerUsageLimit: string;
  minimumOrderInput: string;
  firstOrderOnly: boolean;
  destinationsInput: string;
  offersInput: string;
  usageCount: number;
  hasUsageHistory: boolean;
};

function formatAdminDate(value: Date | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value) + " UTC";
}

function toDateTimeLocal(value: Date | null): string {
  if (!value) return "";
  const iso = value.toISOString();
  return iso.slice(0, 16);
}

function centsToUsdInput(cents: number | null | undefined): string {
  if (cents == null || !Number.isInteger(cents)) return "";
  return (cents / 100).toFixed(2);
}

function discountLabel(type: PromoDiscountType, value: number): string {
  if (type === PromoDiscountType.PERCENT) return `${value}%`;
  return formatUsdCents(value);
}

function applicabilityLabel(
  destinations: { destinationCode: string }[],
  offers: { offerId: string }[]
): string {
  if (destinations.length === 0 && offers.length === 0) return "All plans";
  const parts: string[] = [];
  if (destinations.length > 0) {
    parts.push(destinations.map((row) => row.destinationCode).join(", "));
  }
  if (offers.length > 0) {
    parts.push(
      offers.length === 1 ? "1 selected plan" : `${offers.length} selected plans`
    );
  }
  return parts.join(" · ");
}

export async function listAdminPromoCodes(): Promise<PromoAdminListRow[]> {
  const rows = await prisma.promoCode.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      destinations: { select: { destinationCode: true } },
      offers: { select: { offerId: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    typeLabel: row.discountType === PromoDiscountType.PERCENT ? "Percent" : "Fixed USD",
    discountLabel: discountLabel(row.discountType, row.discountValue),
    statusLabel: row.isActive ? "Active" : "Inactive",
    isActive: row.isActive,
    startsAtLabel: formatAdminDate(row.startsAt),
    endsAtLabel: formatAdminDate(row.endsAt),
    usesLabel: String(row.usageCount),
    usageLimitLabel:
      row.totalUsageLimit != null ? String(row.totalUsageLimit) : "Unlimited",
    minimumOrderLabel:
      row.minimumOrderCents != null
        ? formatUsdCents(row.minimumOrderCents)
        : "—",
    applicabilityLabel: applicabilityLabel(row.destinations, row.offers),
  }));
}

export async function getAdminPromoCode(
  id: string
): Promise<PromoAdminDetail | null> {
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > 64) return null;
  const row = await prisma.promoCode.findUnique({
    where: { id: trimmed },
    include: {
      destinations: { select: { destinationCode: true } },
      offers: { select: { offerId: true } },
      _count: { select: { redemptions: true } },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    code: row.code,
    description: row.description ?? "",
    discountType: row.discountType,
    discountValueInput:
      row.discountType === PromoDiscountType.PERCENT
        ? String(row.discountValue)
        : centsToUsdInput(row.discountValue),
    isActive: row.isActive,
    startsAtInput: toDateTimeLocal(row.startsAt),
    endsAtInput: toDateTimeLocal(row.endsAt),
    totalUsageLimit:
      row.totalUsageLimit != null ? String(row.totalUsageLimit) : "",
    perCustomerUsageLimit:
      row.perCustomerUsageLimit != null
        ? String(row.perCustomerUsageLimit)
        : "",
    minimumOrderInput: centsToUsdInput(row.minimumOrderCents),
    firstOrderOnly: row.firstOrderOnly,
    destinationsInput: row.destinations.map((d) => d.destinationCode).join("\n"),
    offersInput: row.offers.map((o) => o.offerId).join("\n"),
    usageCount: row.usageCount,
    hasUsageHistory: row._count.redemptions > 0 || row.usageCount > 0,
  };
}

function parseAdminPromoFields(formData: FormData) {
  const code = parseRequiredPromoCode(formData.get("code"));
  const description = parseOptionalDescription(formData.get("description"));
  const discountType = parseDiscountType(formData.get("discountType"));
  const discountValue = parseDiscountValue(
    discountType,
    formData.get("discountValue")
  );
  const isActive = formData.get("isActive") === "on";
  const startsAt = parseOptionalDate(formData.get("startsAt"));
  const endsAt = parseOptionalDate(formData.get("endsAt"));
  assertPromoDateRange(startsAt, endsAt);
  const totalUsageLimit = parseOptionalPositiveInt(
    formData.get("totalUsageLimit")
  );
  const perCustomerUsageLimit = parseOptionalPositiveInt(
    formData.get("perCustomerUsageLimit")
  );
  assertUsageLimits(totalUsageLimit, perCustomerUsageLimit);
  const minimumOrderCents = parseOptionalMinimumOrderCents(
    formData.get("minimumOrder")
  );
  const firstOrderOnly = formData.get("firstOrderOnly") === "on";
  const destinations = parseDestinationCodes(formData.get("destinations"));
  const offers = parseOfferIds(formData.get("offers"));
  return {
    code,
    description,
    discountType,
    discountValue,
    isActive,
    startsAt,
    endsAt,
    totalUsageLimit,
    perCustomerUsageLimit,
    minimumOrderCents,
    firstOrderOnly,
    destinations,
    offers,
  };
}

export async function createAdminPromoCode(options: {
  adminUserId: string;
  formData: FormData;
}): Promise<{ id: string }> {
  const fields = parseAdminPromoFields(options.formData);

  try {
    const created = await prisma.promoCode.create({
      data: {
        code: fields.code,
        description: fields.description,
        discountType: fields.discountType,
        discountValue: fields.discountValue,
        isActive: fields.isActive,
        startsAt: fields.startsAt,
        endsAt: fields.endsAt,
        totalUsageLimit: fields.totalUsageLimit,
        perCustomerUsageLimit: fields.perCustomerUsageLimit,
        minimumOrderCents: fields.minimumOrderCents,
        firstOrderOnly: fields.firstOrderOnly,
        createdByAdminId: options.adminUserId,
        destinations: {
          create: fields.destinations.map((destinationCode) => ({
            destinationCode,
          })),
        },
        offers: {
          create: fields.offers.map((offerId) => ({ offerId })),
        },
      },
      select: { id: true, code: true },
    });

    await writeAuditLog({
      actorUserId: options.adminUserId,
      action: PROMO_AUDIT.created,
      targetType: "PromoCode",
      targetId: created.id,
      metadata: { promoId: created.id, code: created.code },
    });

    return { id: created.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new PromoValidationError(
        "code",
        "A promo code with this name already exists."
      );
    }
    throw error;
  }
}

export async function updateAdminPromoCode(options: {
  adminUserId: string;
  promoId: string;
  formData: FormData;
}): Promise<void> {
  const id = options.promoId.trim();
  if (!id || id.length > 64) {
    throw new PromoValidationError("id", "Promo is unavailable.");
  }
  const fields = parseAdminPromoFields(options.formData);

  const existing = await prisma.promoCode.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });
  if (!existing) {
    throw new PromoValidationError("id", "Promo is unavailable.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.promoCodeDestination.deleteMany({ where: { promoCodeId: id } });
      await tx.promoCodeOffer.deleteMany({ where: { promoCodeId: id } });
      await tx.promoCode.update({
        where: { id },
        data: {
          code: fields.code,
          description: fields.description,
          discountType: fields.discountType,
          discountValue: fields.discountValue,
          isActive: fields.isActive,
          startsAt: fields.startsAt,
          endsAt: fields.endsAt,
          totalUsageLimit: fields.totalUsageLimit,
          perCustomerUsageLimit: fields.perCustomerUsageLimit,
          minimumOrderCents: fields.minimumOrderCents,
          firstOrderOnly: fields.firstOrderOnly,
          destinations: {
            create: fields.destinations.map((destinationCode) => ({
              destinationCode,
            })),
          },
          offers: {
            create: fields.offers.map((offerId) => ({ offerId })),
          },
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new PromoValidationError(
        "code",
        "A promo code with this name already exists."
      );
    }
    throw error;
  }

  await writeAuditLog({
    actorUserId: options.adminUserId,
    action: PROMO_AUDIT.updated,
    targetType: "PromoCode",
    targetId: id,
    metadata: { promoId: id, code: fields.code },
  });

  if (existing.isActive !== fields.isActive) {
    await writeAuditLog({
      actorUserId: options.adminUserId,
      action: fields.isActive ? PROMO_AUDIT.enabled : PROMO_AUDIT.disabled,
      targetType: "PromoCode",
      targetId: id,
      metadata: { promoId: id, code: fields.code },
    });
  }
}

export async function setAdminPromoActive(options: {
  adminUserId: string;
  promoId: string;
  isActive: boolean;
}): Promise<void> {
  const id = options.promoId.trim();
  if (!id || id.length > 64) {
    throw new PromoValidationError("id", "Promo is unavailable.");
  }

  const updated = await prisma.promoCode.updateMany({
    where: { id, isActive: !options.isActive },
    data: { isActive: options.isActive },
  });
  if (updated.count !== 1) {
    const exists = await prisma.promoCode.findUnique({
      where: { id },
      select: { id: true, isActive: true, code: true },
    });
    if (!exists) {
      throw new PromoValidationError("id", "Promo is unavailable.");
    }
    return;
  }

  const row = await prisma.promoCode.findUnique({
    where: { id },
    select: { code: true },
  });

  await writeAuditLog({
    actorUserId: options.adminUserId,
    action: options.isActive ? PROMO_AUDIT.enabled : PROMO_AUDIT.disabled,
    targetType: "PromoCode",
    targetId: id,
    metadata: { promoId: id, code: row?.code ?? null },
  });
}
