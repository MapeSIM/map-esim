/**
 * Isolated LOCAL Partner share-token foundation QA (Phase 3 Slice 1).
 * DATABASE_URL must be 127.0.0.1:55440 / map_esim_partner_phase3_uat.
 * No live VeSIM. No share-page UI. No ICCID reveal.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  OrderFundingSource,
  OrderStatus,
  PartnerEsimPurchaseStatus,
  PrismaClient,
  Role,
} from "@prisma/client";
import { hashPassword } from "../app/lib/auth/password";
import {
  createPartnerEsimShareToken,
  resolvePartnerEsimShareToken,
  revokePartnerEsimShareToken,
} from "../app/lib/partner/partnerEsimShareToken";

function assertLocalPhase3Db(url: string): void {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing non-local host: ${host}`);
  }
  const port = parsed.port || "5432";
  const db = parsed.pathname.replace(/^\//, "");
  if (port !== "55440" || db !== "map_esim_partner_phase3_uat") {
    throw new Error(`Refusing unexpected Phase 3 target port=${port} db=${db}`);
  }
  console.log(`CONFIRMED_LOCAL_DB host=${host} port=${port} db=${db}`);
}

function idem(tag: string): string {
  return `pep_share_${tag}_${randomBytes(8).toString("hex")}`.slice(0, 128);
}

function read(rel: string): string {
  return readFileSync(path.join(__dirname, "..", rel), "utf8");
}

function assertNoSensitive(value: unknown): void {
  const json = JSON.stringify(value);
  assert.equal(json.includes("discountBps"), false);
  assert.equal(json.includes("discountVersion"), false);
  assert.equal(json.includes("providerCost"), false);
  assert.equal(json.includes("providerCostCents"), false);
  assert.equal(json.includes("balanceCents"), false);
  assert.equal(json.includes("iccid"), false);
  assert.equal(json.includes("ICCID"), false);
  assert.equal(json.includes("tokenHash"), false);
  assert.equal(json.includes("passwordHash"), false);
}

async function seedCompletedOrder(
  prisma: PrismaClient,
  options: {
    partnerId: string;
    email: string;
    tag: string;
    status?: PartnerEsimPurchaseStatus;
    withOrder?: boolean;
  }
): Promise<{ orderId: string | null; purchaseId: string }> {
  const withOrder = options.withOrder !== false;
  const purchaseStatus =
    options.status ?? PartnerEsimPurchaseStatus.COMPLETED;

  if (!withOrder) {
    const purchase = await prisma.partnerEsimPurchase.create({
      data: {
        partnerId: options.partnerId,
        offerId: `ESIM-SHARE-${options.tag}`,
        destinationCode: "PK",
        destinationName: "Pakistan",
        planName: "QA Share pending",
        dataAllowance: "1 GB",
        validity: "7 Days",
        retailPriceCents: 1000,
        discountBps: 1000,
        discountVersion: 1,
        partnerChargeCents: 900,
        providerCostCents: 800,
        fundingSource: OrderFundingSource.PARTNER_BALANCE,
        status: purchaseStatus,
        idempotencyKey: idem(options.tag),
      },
      select: { id: true },
    });
    return { orderId: null, purchaseId: purchase.id };
  }

  const order = await prisma.order.create({
    data: {
      providerOrderId: `PO-SHARE-${options.tag}-${randomBytes(4).toString("hex")}`,
      customerEmail: options.email,
      offerId: `ESIM-SHARE-${options.tag}`,
      destination: "Pakistan",
      planName: "QA Share 1GB",
      dataAllowance: "1 GB",
      validity: "7 Days",
      fundingSource: OrderFundingSource.PARTNER_BALANCE,
      status: OrderStatus.COMPLETED,
      partnerEsimPurchase: {
        create: {
          partnerId: options.partnerId,
          offerId: `ESIM-SHARE-${options.tag}`,
          destinationCode: "PK",
          destinationName: "Pakistan",
          planName: "QA Share 1GB",
          dataAllowance: "1 GB",
          validity: "7 Days",
          retailPriceCents: 1000,
          discountBps: 1000,
          discountVersion: 1,
          partnerChargeCents: 900,
          providerCostCents: 800,
          fundingSource: OrderFundingSource.PARTNER_BALANCE,
          status: purchaseStatus,
          idempotencyKey: idem(options.tag),
          completedAt:
            purchaseStatus === PartnerEsimPurchaseStatus.COMPLETED
              ? new Date()
              : null,
        },
      },
    },
    select: {
      id: true,
      partnerEsimPurchase: { select: { id: true } },
    },
  });

  return {
    orderId: order.id,
    purchaseId: order.partnerEsimPurchase!.id,
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  assertLocalPhase3Db(url);

  const src = read("app/lib/partner/partnerEsimShareToken.ts");
  assert.match(src, /RAW_TOKEN_BYTES\s*=\s*32/);
  assert.match(src, /randomBytes\(RAW_TOKEN_BYTES\)/);
  assert.match(src, /createHash\(["']sha256["']\)/);
  assert.match(src, /toString\(["']base64url["']\)/);
  assert.match(src, /import ["']server-only["']/);
  assert.doesNotMatch(src, /console\.(?:log|info|warn)\([^\)]*rawToken/);
  const auditBlocks = src.match(/writeAuditLog\(\{[\s\S]*?\}\);/g) ?? [];
  assert.ok(auditBlocks.length >= 2);
  for (const block of auditBlocks) {
    assert.doesNotMatch(block, /\brawToken\b/);
    assert.doesNotMatch(block, /\btokenHash\b/);
    assert.doesNotMatch(block, /\biccid\b/i);
  }
  assert.match(src, /\/share\/\$\{rawToken\}|\/share\/\$\{/);
  assert.doesNotMatch(src, /searchParams\.set\(["']token["']/);

  const robots = read("app/robots.ts");
  assert.match(robots, /["']\/share\/["']/);

  const migration = read(
    "prisma/migrations/20260816020000_add_partner_esim_share_token/migration.sql"
  );
  assert.match(migration, /CREATE TABLE "PartnerEsimShareToken"/);
  assert.match(migration, /tokenHash/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM/i);
  assert.doesNotMatch(migration, /rawToken|raw_token/i);
  console.log("PASS offline_source_robots_migration");

  const prisma = new PrismaClient();
  const stamp = Date.now();
  const pw = await hashPassword(`Uat${randomBytes(18).toString("base64url")}!9`);

  try {
    const partnerA = await prisma.user.create({
      data: {
        name: "P3 Share Partner A",
        email: `p3.share.a.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 1000,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 50_000, version: 0 } },
          },
        },
      },
      select: { id: true, partnerProfile: { select: { id: true } } },
    });
    const partnerAUserId = partnerA.id;
    const partnerAId = partnerA.partnerProfile!.id;

    const partnerB = await prisma.user.create({
      data: {
        name: "P3 Share Partner B",
        email: `p3.share.b.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 500,
            discountVersion: 1,
            walletAccount: { create: { balanceCents: 40_000, version: 0 } },
          },
        },
      },
      select: { id: true, partnerProfile: { select: { id: true } } },
    });
    const partnerBUserId = partnerB.id;
    const partnerBId = partnerB.partnerProfile!.id;

    const disabled = await prisma.user.create({
      data: {
        name: "P3 Share Disabled",
        email: `p3.share.dis.${stamp}@example.invalid`,
        passwordHash: pw,
        role: Role.PARTNER,
        emailVerifiedAt: new Date(),
        partnerProfile: {
          create: {
            discountBps: 500,
            discountVersion: 1,
            disabledAt: new Date(),
            walletAccount: { create: { balanceCents: 10_000, version: 0 } },
          },
        },
      },
      select: { id: true, partnerProfile: { select: { id: true } } },
    });

    const seededA = await seedCompletedOrder(prisma, {
      partnerId: partnerAId,
      email: `p3.share.ord.a.${stamp}@example.invalid`,
      tag: `a${stamp}`,
    });
    const orderAId = seededA.orderId!;

    const seededB = await seedCompletedOrder(prisma, {
      partnerId: partnerBId,
      email: `p3.share.ord.b.${stamp}@example.invalid`,
      tag: `b${stamp}`,
    });
    const orderBId = seededB.orderId!;

    const seededDisabled = await seedCompletedOrder(prisma, {
      partnerId: disabled.partnerProfile!.id,
      email: `p3.share.ord.dis.${stamp}@example.invalid`,
      tag: `d${stamp}`,
    });
    const orderDisabledId = seededDisabled.orderId!;

    const pendingA = await seedCompletedOrder(prisma, {
      partnerId: partnerAId,
      email: `p3.share.pend.${stamp}@example.invalid`,
      tag: `p${stamp}`,
      status: PartnerEsimPurchaseStatus.READY,
      withOrder: false,
    });

    // A + B. generate + entropy/encoding
    const created = await createPartnerEsimShareToken({
      partnerUserId: partnerAUserId,
      orderId: orderAId,
    });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("expected create success");
    assert.match(created.rawToken, /^[A-Za-z0-9_-]+$/);
    assert.ok(created.rawToken.length >= 43);
    assert.equal(created.sharePath, `/share/${created.rawToken}`);
    assert.equal(created.orderId, orderAId);
    console.log("PASS A_B_generate_url_safe_256bit");

    // C. hash at rest only
    const stored = await prisma.partnerEsimShareToken.findUniqueOrThrow({
      where: { id: created.shareTokenId },
    });
    const expectedHash = createHash("sha256")
      .update(created.rawToken)
      .digest("hex");
    assert.equal(stored.tokenHash, expectedHash);
    assert.notEqual(stored.tokenHash, created.rawToken);
    const rowJson = JSON.stringify(stored);
    assert.equal(rowJson.includes(created.rawToken), false);
    assert.equal(stored.revokedAt, null);
    console.log("PASS C_db_stores_hash_only");

    // D. resolver accepts valid token
    const resolved = await resolvePartnerEsimShareToken(created.rawToken);
    assert.equal(resolved.ok, true);
    if (!resolved.ok) throw new Error("expected resolve success");
    assert.equal(resolved.orderId, orderAId);
    assert.equal(resolved.partnerId, partnerAId);
    assert.equal(resolved.shareTokenId, created.shareTokenId);
    assert.equal(resolved.destination, "Pakistan");
    assert.equal(resolved.planName, "QA Share 1GB");
    assertNoSensitive(resolved);
    console.log("PASS D_resolver_accepts_valid");

    // E. malformed rejected generically
    const malformed = await Promise.all([
      resolvePartnerEsimShareToken(""),
      resolvePartnerEsimShareToken("short"),
      resolvePartnerEsimShareToken("not valid token!!!"),
      resolvePartnerEsimShareToken("a".repeat(200)),
    ]);
    for (const result of malformed) {
      assert.deepEqual(result, { ok: false });
    }
    console.log("PASS E_malformed_generic");

    // F. unknown rejected generically
    const unknownRaw = randomBytes(32).toString("base64url");
    const unknown = await resolvePartnerEsimShareToken(unknownRaw);
    assert.deepEqual(unknown, { ok: false });
    console.log("PASS F_unknown_generic");

    // G. revoked rejected generically
    const revoked = await revokePartnerEsimShareToken({
      partnerUserId: partnerAUserId,
      orderId: orderAId,
    });
    assert.equal(revoked.ok, true);
    if (!revoked.ok) throw new Error("expected revoke success");
    assert.equal(revoked.alreadyRevoked, false);
    const afterRevoke = await resolvePartnerEsimShareToken(created.rawToken);
    assert.deepEqual(afterRevoke, { ok: false });
    console.log("PASS G_revoked_generic");

    // H. Partner A cannot generate for Partner B Order
    const crossCreate = await createPartnerEsimShareToken({
      partnerUserId: partnerAUserId,
      orderId: orderBId,
    });
    assert.equal(crossCreate.ok, false);
    const bTokensAfterCross = await prisma.partnerEsimShareToken.count({
      where: { orderId: orderBId },
    });
    assert.equal(bTokensAfterCross, 0);
    console.log("PASS H_no_cross_partner_create");

    // I. Partner A cannot revoke Partner B token
    const createdB = await createPartnerEsimShareToken({
      partnerUserId: partnerBUserId,
      orderId: orderBId,
    });
    assert.equal(createdB.ok, true);
    if (!createdB.ok) throw new Error("expected B create");
    const crossRevoke = await revokePartnerEsimShareToken({
      partnerUserId: partnerAUserId,
      orderId: orderBId,
    });
    assert.equal(crossRevoke.ok, false);
    const stillB = await resolvePartnerEsimShareToken(createdB.rawToken);
    assert.equal(stillB.ok, true);
    console.log("PASS I_no_cross_partner_revoke");

    // J. disabled Partner cannot create
    const disabledCreate = await createPartnerEsimShareToken({
      partnerUserId: disabled.id,
      orderId: orderDisabledId,
    });
    assert.equal(disabledCreate.ok, false);
    const disabledCount = await prisma.partnerEsimShareToken.count({
      where: { orderId: orderDisabledId },
    });
    assert.equal(disabledCount, 0);
    console.log("PASS J_disabled_cannot_mint");

    // K. rotate: old invalid, new works, one active
    const first = await createPartnerEsimShareToken({
      partnerUserId: partnerAUserId,
      orderId: orderAId,
    });
    assert.equal(first.ok, true);
    if (!first.ok) throw new Error("expected first rotate create");
    const second = await createPartnerEsimShareToken({
      partnerUserId: partnerAUserId,
      orderId: orderAId,
    });
    assert.equal(second.ok, true);
    if (!second.ok) throw new Error("expected second rotate create");
    assert.notEqual(first.rawToken, second.rawToken);
    const oldResolved = await resolvePartnerEsimShareToken(first.rawToken);
    assert.deepEqual(oldResolved, { ok: false });
    const newResolved = await resolvePartnerEsimShareToken(second.rawToken);
    assert.equal(newResolved.ok, true);
    const activeCount = await prisma.partnerEsimShareToken.count({
      where: { orderId: orderAId, revokedAt: null },
    });
    assert.equal(activeCount, 1);
    console.log("PASS K_rotate_one_active");

    // L. repeated revoke idempotent
    const revoke1 = await revokePartnerEsimShareToken({
      partnerUserId: partnerAUserId,
      orderId: orderAId,
    });
    const revoke2 = await revokePartnerEsimShareToken({
      partnerUserId: partnerAUserId,
      orderId: orderAId,
    });
    assert.equal(revoke1.ok, true);
    assert.equal(revoke2.ok, true);
    if (!revoke1.ok || !revoke2.ok) throw new Error("expected revoke");
    assert.equal(revoke1.alreadyRevoked, false);
    assert.equal(revoke2.alreadyRevoked, true);
    console.log("PASS L_revoke_idempotent");

    // M. non-completed cannot generate
    const pendingCreate = await createPartnerEsimShareToken({
      partnerUserId: partnerAUserId,
      orderId: pendingA.purchaseId,
    });
    assert.equal(pendingCreate.ok, false);
    const missingCreate = await createPartnerEsimShareToken({
      partnerUserId: partnerAUserId,
      orderId: "ord_does_not_exist",
    });
    assert.equal(missingCreate.ok, false);
    console.log("PASS M_non_completed_cannot_generate");

    // N. AuditLog IDs/action only
    const audits = await prisma.auditLog.findMany({
      where: {
        action: { in: ["partner.share_created", "partner.share_revoked"] },
        actorUserId: { in: [partnerAUserId, partnerBUserId, disabled.id] },
      },
    });
    assert.ok(audits.length >= 2);
    const auditJson = JSON.stringify(audits);
    assert.equal(auditJson.includes(created.rawToken), false);
    assert.equal(auditJson.includes(first.rawToken), false);
    assert.equal(auditJson.includes(second.rawToken), false);
    if (createdB.ok) {
      assert.equal(auditJson.includes(createdB.rawToken), false);
    }
    assert.equal(auditJson.includes("tokenHash"), false);
    assert.equal(auditJson.includes(expectedHash), false);
    assert.equal(auditJson.includes("iccid"), false);
    assert.equal(auditJson.includes("providerCost"), false);
    assert.equal(auditJson.includes("discountBps"), false);
    for (const row of audits) {
      assert.match(row.action, /^partner\.share_(created|revoked)$/);
    }
    console.log("PASS N_audit_ids_only");

    // O. resolver does not expose sensitive fields — already asserted on D;
    // also confirm return keys are allowlisted.
    const recreate = await createPartnerEsimShareToken({
      partnerUserId: partnerAUserId,
      orderId: orderAId,
    });
    assert.equal(recreate.ok, true);
    if (!recreate.ok) throw new Error("expected recreate");
    const safe = await resolvePartnerEsimShareToken(recreate.rawToken);
    assert.equal(safe.ok, true);
    if (!safe.ok) throw new Error("expected safe resolve");
    assert.deepEqual(Object.keys(safe).sort(), [
      "destination",
      "ok",
      "orderId",
      "partnerId",
      "planName",
      "shareTokenId",
    ]);
    assertNoSensitive(safe);
    console.log("PASS O_resolver_no_sensitive_fields");

    // P. robots disallow
    assert.match(read("app/robots.ts"), /["']\/share\/["']/);
    console.log("PASS P_robots_disallow_share");

    console.log("ALL_QA_PASSED=partner-share-token");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
