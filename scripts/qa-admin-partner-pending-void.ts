/**
 * Offline QA for admin Void / Cancel of unprovisioned Partner eSIM holds.
 * Does not mutate balances or call Prisma.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isAdminVoidablePartnerPurchase,
  partnerPurchaseNeedsReconciliationCase,
  partnerPurchaseReconciliationHref,
} from "../app/lib/admin/partnerPendingVoidShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(existsSync(join(root, "app/lib/admin/partnerPendingVoidShared.ts")));
  assert.ok(existsSync(join(root, "app/lib/admin/partnerPendingVoid.ts")));
  assert.ok(existsSync(join(root, "app/lib/admin/partnerPendingVoidActions.ts")));
  assert.ok(
    existsSync(
      join(root, "app/components/admin/AdminVoidPendingPartnerPurchaseForm.tsx")
    )
  );

  const eligible = {
    status: "PROVIDER_PENDING",
    orderId: null,
    providerOrderId: null,
    providerResultKind: null,
    debitTransactionId: "debit_1",
    refundTransactionId: null,
    walletAppliedCents: 900,
    gatewayAmountCents: 0,
  };
  assert.equal(isAdminVoidablePartnerPurchase(eligible), true);
  assert.equal(
    isAdminVoidablePartnerPurchase({ ...eligible, status: "FUNDS_RESERVED" }),
    true
  );
  assert.equal(
    isAdminVoidablePartnerPurchase({
      ...eligible,
      status: "RECONCILIATION_REQUIRED",
    }),
    true
  );
  assert.equal(
    isAdminVoidablePartnerPurchase({
      ...eligible,
      status: "AWAITING_GATEWAY_PAYMENT",
      gatewayAmountCents: 500,
    }),
    true
  );
  assert.equal(
    isAdminVoidablePartnerPurchase({
      ...eligible,
      status: "RECONCILIATION_REQUIRED",
      gatewayAmountCents: 500,
    }),
    false
  );
  assert.equal(
    isAdminVoidablePartnerPurchase({ ...eligible, orderId: "ord_1" }),
    false
  );
  assert.equal(
    isAdminVoidablePartnerPurchase({ ...eligible, providerOrderId: "prov_1" }),
    false
  );
  assert.equal(
    isAdminVoidablePartnerPurchase({
      ...eligible,
      providerResultKind: "success",
    }),
    false
  );
  assert.equal(
    isAdminVoidablePartnerPurchase({ ...eligible, status: "COMPLETED" }),
    false
  );
  assert.equal(partnerPurchaseNeedsReconciliationCase("PROVIDER_PENDING"), true);
  assert.equal(
    partnerPurchaseNeedsReconciliationCase("RECONCILIATION_REQUIRED"),
    true
  );
  assert.equal(partnerPurchaseNeedsReconciliationCase("READY"), false);
  assert.ok(
    partnerPurchaseReconciliationHref("abc").includes(
      "admin/reconciliation/partner_purchase/abc"
    )
  );
  console.log("PASS eligibility_matrix");

  const service = read("app/lib/admin/partnerPendingVoid.ts");
  const actions = read("app/lib/admin/partnerPendingVoidActions.ts");
  const form = read("app/components/admin/AdminVoidPendingPartnerPurchaseForm.tsx");
  const page = read("app/admin/partners/[id]/page.tsx");
  const lib = read("app/lib/partner/partners.ts");
  const release = read("app/lib/partner/partnerPurchaseWallet.ts");
  const pkg = read("package.json");

  assert.match(service, /releasePartnerFullWalletStaleReservationInTx/);
  assert.match(service, /releasePartnerGatewayReservationInTx/);
  assert.match(service, /PARTNER_PENDING_VOID_AUDIT/);
  assert.match(actions, /WALLET_ADJUST/);
  assert.match(actions, /PARTNERS_MANAGE/);
  assert.match(actions, /voidPendingPartnerEsimPurchaseReservation/);
  assert.match(form, /useActionState/);
  assert.match(form, /voidPendingPartnerPurchaseAction/);
  assert.match(form, /Processing/);
  assert.match(form, /Void \/ Cancel pending/);
  assert.match(form, /role="alert"/);
  assert.match(form, /router\.refresh/);
  assert.match(page, /AdminVoidPendingPartnerPurchaseForm/);
  assert.match(page, /canVoidPartnerHolds/);
  assert.match(page, /Open reconciliation/);
  assert.match(page, /canOpenReconciliation/);
  assert.match(lib, /canVoidPending/);
  assert.match(lib, /reconciliationHref/);
  assert.match(release, /RECONCILIATION_REQUIRED/);
  assert.match(pkg, /qa:admin-partner-pending-void/);
  console.log("PASS wiring_and_permissions");
  console.log("ALL PASS qa-admin-partner-pending-void");
}

main();
