/**
 * Idempotent backfill: set Order.paymentMethod = MANUAL for historical rows
 * that were stuck on the schema default SAFEPAY after Manual / WhatsApp fulfill.
 *
 * Defaults to dry-run (no writes). Pass --apply to persist.
 *
 * Usage:
 *   npx tsx scripts/backfill-manual-order-payment-method.ts
 *   npx tsx scripts/backfill-manual-order-payment-method.ts --apply
 *   npx tsx scripts/backfill-manual-order-payment-method.ts --apply --limit=200
 *   npx tsx scripts/backfill-manual-order-payment-method.ts --id=cmwjd5rp20009jn089pbmbg2p
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../app/lib/db";
import {
  ADMIN_ORDER_PAYMENT_METHOD_MANUAL,
  shouldBackfillOrderPaymentMethodToManual,
} from "../app/lib/admin/orderPaymentMethodShared";

type Counts = {
  scanned: number;
  eligible: number;
  updated: number;
  skipped: number;
};

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  let limit = 500;
  let id: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) limit = Math.min(Math.floor(n), 5000);
    }
    if (arg.startsWith("--id=")) {
      const v = arg.slice("--id=".length).trim();
      if (v) id = v.slice(0, 64);
    }
  }
  return { apply, limit, id };
}

async function main() {
  const { apply, limit, id } = parseArgs(process.argv.slice(2));
  const counts: Counts = {
    scanned: 0,
    eligible: 0,
    updated: 0,
    skipped: 0,
  };

  const where: Prisma.OrderWhereInput = id
    ? { id }
    : {
        OR: [
          { paymentMethod: null },
          { paymentMethod: "" },
          { paymentMethod: "SAFEPAY" },
          { paymentMethod: "safepay" },
        ],
      };

  const rows = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      paymentMethod: true,
      fundingSource: true,
      providerOrderId: true,
      senderName: true,
      paymentProofUrl: true,
      whatsAppCheckoutOrder: {
        select: {
          id: true,
          paymentMethod: true,
          senderName: true,
          paymentProofUrl: true,
        },
      },
      adminPackageAssignment: {
        select: {
          id: true,
          whatsAppCheckoutOrder: {
            select: {
              id: true,
              paymentMethod: true,
              senderName: true,
              paymentProofUrl: true,
            },
          },
        },
      },
      walletEsimPurchase: {
        select: {
          paymentAttempts: {
            where: { gatewayProvider: { not: null } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  for (const row of rows) {
    counts.scanned += 1;
    const wa =
      row.whatsAppCheckoutOrder ??
      row.adminPackageAssignment?.whatsAppCheckoutOrder ??
      null;
    const eligible = shouldBackfillOrderPaymentMethodToManual({
      paymentMethod: row.paymentMethod,
      fundingSource: row.fundingSource,
      providerOrderId: row.providerOrderId,
      senderName: row.senderName,
      paymentProofUrl: row.paymentProofUrl,
      whatsappPaymentMethod: wa?.paymentMethod,
      whatsappSenderName: wa?.senderName,
      whatsappPaymentProofUrl: wa?.paymentProofUrl,
      hasWhatsappCheckoutLink: Boolean(wa?.id),
      hasAdminPackageAssignment: Boolean(row.adminPackageAssignment),
      hasGatewayPaymentAttempt: Boolean(
        row.walletEsimPurchase?.paymentAttempts?.length
      ),
    });

    if (!eligible) {
      counts.skipped += 1;
      continue;
    }

    counts.eligible += 1;
    if (!apply) continue;

    const updated = await prisma.order.updateMany({
      where: {
        id: row.id,
        NOT: { paymentMethod: ADMIN_ORDER_PAYMENT_METHOD_MANUAL },
      },
      data: { paymentMethod: ADMIN_ORDER_PAYMENT_METHOD_MANUAL },
    });
    if (updated.count === 1) counts.updated += 1;
    else counts.skipped += 1;
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        limit,
        id,
        ...counts,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(
      "backfill_manual_payment_method_failed",
      error instanceof Error ? error.message : "unknown"
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
