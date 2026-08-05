/**
 * Safe late backfill of Order ICCID fields from the provider.
 *
 * Defaults to dry-run (no writes). Pass --apply to persist fill-once updates.
 * Reports counts only — never prints ICCID values (full or masked).
 *
 * Usage:
 *   npx tsx scripts/backfill-order-iccids.ts
 *   npx tsx scripts/backfill-order-iccids.ts --apply
 *   npx tsx scripts/backfill-order-iccids.ts --apply --limit=50
 */
import { extractInstallDetails } from "../app/lib/email/extract";
import { prisma } from "../app/lib/db";
import { captureIccidForProviderOrder } from "../app/lib/orders/iccidCaptureCore";
import {
  hashIccid,
  isIccidEncryptionConfigured,
  normalizeIccid,
  validateIccid,
} from "../app/lib/orders/iccidCryptoCore";
import {
  getBrokerToken,
  getVesimBaseUrl,
  readJsonSafe,
} from "../app/lib/vesim/server";

type Counts = {
  checked: number;
  eligible: number;
  filled: number;
  still_missing: number;
  conflict: number;
  failed: number;
};

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  let limit = 200;
  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) limit = Math.min(Math.floor(n), 2000);
    }
  }
  return { apply, limit };
}

async function fetchProviderPayload(
  providerOrderId: string
): Promise<Record<string, unknown> | null> {
  const token = await getBrokerToken();
  const baseUrl = getVesimBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/broker/orders/${encodeURIComponent(providerOrderId)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `${token.tokenType} ${token.accessToken}`,
      },
      cache: "no-store",
    }
  );
  const data = await readJsonSafe(response);
  if (!response.ok) return null;
  return data;
}

async function classifyWithoutWrite(options: {
  orderId: string;
  providerOrderId: string;
  iccid: string;
}): Promise<"would_fill" | "still_missing" | "conflict" | "failed"> {
  const normalized = normalizeIccid(options.iccid);
  if (!validateIccid(normalized)) return "still_missing";

  try {
    const hash = hashIccid(normalized);
    const order = await prisma.order.findUnique({
      where: { providerOrderId: options.providerOrderId },
      select: { id: true, iccidHash: true },
    });
    if (!order) return "failed";
    if (order.iccidHash) {
      return order.iccidHash === hash ? "would_fill" : "conflict";
    }
    const other = await prisma.order.findFirst({
      where: {
        iccidHash: hash,
        NOT: { id: order.id },
      },
      select: { id: true },
    });
    if (other) return "conflict";
    return "would_fill";
  } catch {
    return "failed";
  }
}

async function main() {
  const { apply, limit } = parseArgs(process.argv.slice(2));
  const counts: Counts = {
    checked: 0,
    eligible: 0,
    filled: 0,
    still_missing: 0,
    conflict: 0,
    failed: 0,
  };

  console.log(
    `ICCID backfill mode=${apply ? "APPLY" : "DRY_RUN"} limit=${limit}`
  );

  if (!isIccidEncryptionConfigured()) {
    console.error("ICCID_ENCRYPTION_KEY is missing or invalid — aborting");
    process.exitCode = 1;
    return;
  }

  const orders = await prisma.order.findMany({
    where: {
      providerOrderId: { not: "" },
      iccidEncrypted: null,
    },
    select: {
      id: true,
      providerOrderId: true,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  counts.eligible = orders.length;

  for (const order of orders) {
    counts.checked += 1;
    try {
      const payload = await fetchProviderPayload(order.providerOrderId);
      if (!payload) {
        counts.failed += 1;
        continue;
      }

      const extracted = extractInstallDetails(payload).iccid;
      if (!extracted) {
        counts.still_missing += 1;
        continue;
      }

      if (!apply) {
        const preview = await classifyWithoutWrite({
          orderId: order.id,
          providerOrderId: order.providerOrderId,
          iccid: extracted,
        });
        if (preview === "would_fill") counts.filled += 1;
        else if (preview === "conflict") counts.conflict += 1;
        else if (preview === "still_missing") counts.still_missing += 1;
        else counts.failed += 1;
        continue;
      }

      const result = await captureIccidForProviderOrder(
        {
          providerOrderId: order.providerOrderId,
          iccid: extracted,
          checkoutPayload: payload,
        },
        prisma
      );
      switch (result.status) {
        case "stored":
        case "already_same":
          counts.filled += 1;
          break;
        case "conflict":
        case "duplicate_other_order":
          counts.conflict += 1;
          break;
        case "skipped_empty":
        case "skipped_invalid":
          counts.still_missing += 1;
          break;
        default:
          counts.failed += 1;
      }
    } catch {
      counts.failed += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry_run",
        checked: counts.checked,
        eligible: counts.eligible,
        filled: counts.filled,
        still_missing: counts.still_missing,
        conflict: counts.conflict,
        failed: counts.failed,
      },
      null,
      2
    )
  );
}

main()
  .catch(() => {
    console.error("ICCID backfill failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
