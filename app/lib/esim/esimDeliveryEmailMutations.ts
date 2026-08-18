/**
 * Authenticated alternate install-email save/clear.
 * Never mutates User.email. Never trusts browser-hidden emails at purchase time.
 * Changes are CAS-guarded against fulfillment lock and non-editable status.
 */

import {
  OrderFundingSource,
  Prisma,
  WalletEsimPurchaseStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/db";
import {
  ALTERNATE_DELIVERY_EMAIL_MESSAGES,
  EsimDeliveryEmailError,
  assertMatchingAlternateDeliveryEmails,
  canEditPurchaseDeliveryEmail,
  isSameAsAccountEmail,
} from "@/app/lib/esim/esimDeliveryEmail";
import { isPurchaseDeliveryEmailLocked } from "@/app/lib/esim/esimDeliveryEmailState";

type DbClient = Prisma.TransactionClient | typeof prisma;

const EDITABLE_STATUSES: WalletEsimPurchaseStatus[] = [
  WalletEsimPurchaseStatus.READY,
  WalletEsimPurchaseStatus.AWAITING_GATEWAY_PAYMENT,
];

const CUSTOMER_FUNDING: OrderFundingSource[] = [
  OrderFundingSource.CUSTOMER_WALLET,
  OrderFundingSource.CUSTOMER_SPLIT,
  OrderFundingSource.DIRECT_PAYMENT,
];

type LoadedPurchase = {
  id: string;
  customerUserId: string;
  adminUserId: string | null;
  status: WalletEsimPurchaseStatus;
  fundingSource: OrderFundingSource;
  alternateDeliveryEmailLockedAt: Date | null;
  customer: { email: string };
};

async function loadOwnedPurchase(
  db: DbClient,
  customerUserId: string,
  purchaseId: string
): Promise<LoadedPurchase> {
  const ownerId = customerUserId.trim();
  const id = purchaseId.trim();
  if (!ownerId || ownerId.length > 64 || !id || id.length > 64) {
    throw new EsimDeliveryEmailError(
      "FORBIDDEN",
      ALTERNATE_DELIVERY_EMAIL_MESSAGES.unavailable
    );
  }

  const row = await db.walletEsimPurchase.findUnique({
    where: { id },
    select: {
      id: true,
      customerUserId: true,
      adminUserId: true,
      status: true,
      fundingSource: true,
      alternateDeliveryEmailLockedAt: true,
      customer: { select: { email: true } },
    },
  });

  if (
    !row ||
    row.customerUserId !== ownerId ||
    row.adminUserId ||
    !CUSTOMER_FUNDING.includes(row.fundingSource)
  ) {
    throw new EsimDeliveryEmailError(
      "FORBIDDEN",
      ALTERNATE_DELIVERY_EMAIL_MESSAGES.unavailable
    );
  }

  return row;
}

function throwIfNotSafelyEditable(row: LoadedPurchase): void {
  if (isPurchaseDeliveryEmailLocked(row.alternateDeliveryEmailLockedAt)) {
    throw new EsimDeliveryEmailError(
      "LOCKED",
      ALTERNATE_DELIVERY_EMAIL_MESSAGES.locked
    );
  }
  if (
    !canEditPurchaseDeliveryEmail({
      status: row.status,
      alternateDeliveryEmailLockedAt: row.alternateDeliveryEmailLockedAt,
      adminUserId: row.adminUserId,
    })
  ) {
    throw new EsimDeliveryEmailError(
      "INVALID_STATE",
      ALTERNATE_DELIVERY_EMAIL_MESSAGES.notEditable
    );
  }
}

async function throwFromFailedCas(
  db: DbClient,
  customerUserId: string,
  purchaseId: string
): Promise<never> {
  const again = await loadOwnedPurchase(db, customerUserId, purchaseId);
  throwIfNotSafelyEditable(again);
  throw new EsimDeliveryEmailError(
    "INVALID_STATE",
    ALTERNATE_DELIVERY_EMAIL_MESSAGES.notEditable
  );
}

const editableUnlockedWhere = (id: string, customerUserId: string) => ({
  id,
  customerUserId,
  adminUserId: null,
  status: { in: EDITABLE_STATUSES },
  alternateDeliveryEmailLockedAt: null,
  fundingSource: { in: CUSTOMER_FUNDING },
});

export async function saveWalletPurchaseAlternateDeliveryEmail(
  input: {
    customerUserId: string;
    purchaseId: string;
    deliveryEmail: unknown;
    confirmDeliveryEmail: unknown;
    attested: boolean;
  },
  db: DbClient = prisma
): Promise<{ mode: "account_default" | "confirmed_alternate" }> {
  if (!input.attested) {
    throw new EsimDeliveryEmailError(
      "ATTESTATION_REQUIRED",
      ALTERNATE_DELIVERY_EMAIL_MESSAGES.attestation
    );
  }

  const email = assertMatchingAlternateDeliveryEmails(
    input.deliveryEmail,
    input.confirmDeliveryEmail
  );
  const purchase = await loadOwnedPurchase(
    db,
    input.customerUserId,
    input.purchaseId
  );
  throwIfNotSafelyEditable(purchase);

  if (isSameAsAccountEmail(email, purchase.customer.email)) {
    return clearWalletPurchaseAlternateDeliveryEmail(
      {
        customerUserId: input.customerUserId,
        purchaseId: input.purchaseId,
      },
      db
    );
  }

  const confirmedAt = new Date();
  const updated = await db.walletEsimPurchase.updateMany({
    where: editableUnlockedWhere(purchase.id, purchase.customerUserId),
    data: {
      alternateDeliveryEmail: email,
      alternateDeliveryEmailConfirmedAt: confirmedAt,
    },
  });
  if (updated.count !== 1) {
    await throwFromFailedCas(db, input.customerUserId, input.purchaseId);
  }

  return { mode: "confirmed_alternate" };
}

export async function clearWalletPurchaseAlternateDeliveryEmail(
  input: {
    customerUserId: string;
    purchaseId: string;
  },
  db: DbClient = prisma
): Promise<{ mode: "account_default" }> {
  const purchase = await loadOwnedPurchase(
    db,
    input.customerUserId,
    input.purchaseId
  );
  throwIfNotSafelyEditable(purchase);

  const updated = await db.walletEsimPurchase.updateMany({
    where: editableUnlockedWhere(purchase.id, purchase.customerUserId),
    data: {
      alternateDeliveryEmail: null,
      alternateDeliveryEmailConfirmedAt: null,
    },
  });
  if (updated.count !== 1) {
    await throwFromFailedCas(db, input.customerUserId, input.purchaseId);
  }

  return { mode: "account_default" };
}
