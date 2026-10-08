/**
 * Offline QA for admin Void / Cancel of stuck pending WALLET_ESIM_PURCHASE debits.
 * Does not mutate balances or call Prisma.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isAdminVoidablePendingWalletDebit } from "../app/lib/admin/walletPendingVoidShared";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  assert.ok(existsSync(join(root, "app/lib/admin/walletPendingVoidShared.ts")));
  assert.ok(existsSync(join(root, "app/lib/admin/walletPendingVoid.ts")));
  assert.ok(existsSync(join(root, "app/lib/admin/walletPendingVoidActions.ts")));
  assert.ok(
    existsSync(join(root, "app/components/admin/AdminVoidPendingWalletForm.tsx"))
  );

  const eligible = {
    type: "PURCHASE_DEBIT",
    status: "PENDING",
    referenceType: "WALLET_ESIM_PURCHASE",
    purchaseStatus: "PROVIDER_PENDING",
    orderId: null,
    providerOrderId: null,
    providerResultKind: null,
  };
  assert.equal(isAdminVoidablePendingWalletDebit(eligible), true);
  assert.equal(
    isAdminVoidablePendingWalletDebit({
      ...eligible,
      purchaseStatus: "FUNDS_RESERVED",
    }),
    true
  );
  assert.equal(
    isAdminVoidablePendingWalletDebit({
      ...eligible,
      purchaseStatus: "AWAITING_GATEWAY_PAYMENT",
    }),
    true
  );
  assert.equal(
    isAdminVoidablePendingWalletDebit({
      ...eligible,
      status: "COMPLETED",
    }),
    false
  );
  assert.equal(
    isAdminVoidablePendingWalletDebit({
      ...eligible,
      status: "REVERSED",
    }),
    false
  );
  assert.equal(
    isAdminVoidablePendingWalletDebit({
      ...eligible,
      purchaseStatus: "READY",
    }),
    false
  );
  assert.equal(
    isAdminVoidablePendingWalletDebit({
      ...eligible,
      orderId: "ord_1",
    }),
    false
  );
  assert.equal(
    isAdminVoidablePendingWalletDebit({
      ...eligible,
      providerOrderId: "prov_1",
    }),
    false
  );
  assert.equal(
    isAdminVoidablePendingWalletDebit({
      ...eligible,
      providerResultKind: "success",
    }),
    false
  );
  assert.equal(
    isAdminVoidablePendingWalletDebit({
      ...eligible,
      purchaseStatus: "RECONCILIATION_REQUIRED",
    }),
    false
  );
  console.log("PASS eligibility_matrix");

  const service = read("app/lib/admin/walletPendingVoid.ts");
  const actions = read("app/lib/admin/walletPendingVoidActions.ts");
  const form = read("app/components/admin/AdminVoidPendingWalletForm.tsx");
  const customer = read("app/admin/customers/[id]/page.tsx");
  const ledgerPage = read("app/admin/customers/[id]/wallet/page.tsx");
  const ledger = read("app/lib/admin/walletLedger.ts");
  const wallet = read("app/lib/admin/wallet.ts");
  const pkg = read("package.json");

  assert.match(service, /refundReservedFundsInTx/);
  assert.match(service, /restoreReady:\s*true/);
  assert.match(service, /assisted:\s*true/);
  assert.match(service, /healReleasedPendingPurchaseDebit/);
  assert.match(service, /forceReverseReleasedPurchaseDebit/);
  assert.match(service, /forceReverseKnownStuckReleasedDebit/);
  assert.match(service, /markAlreadyReleased|alreadyReleased: true/);
  assert.match(service, /WalletTransactionStatus\.REVERSED|status: WalletTransactionStatus\.REVERSED/);
  assert.match(wallet, /forceReverseKnownStuckReleasedDebit/);
  assert.match(wallet, /hzh8bfhx/);
  assert.match(wallet, /cmsogxr4d0000jp04412uopyy/);
  assert.match(form, /router\.refresh/);
  const purchaseLib = read("app/lib/esim/walletPurchase.ts");
  assert.match(purchaseLib, /reversePendingWalletPurchaseDebitInTx/);
  assert.match(actions, /actorHasAdminPermission/);
  assert.match(actions, /WALLET_ADJUST/);
  assert.match(actions, /voidPendingWalletEsimPurchaseReservation/);
  assert.match(actions, /VoidPendingWalletFormState/);
  assert.match(form, /useActionState/);
  assert.match(form, /voidPendingWalletReservationAction/);
  assert.match(form, /Processing/);
  assert.match(form, /Void \/ Cancel pending/);
  assert.match(form, /role="alert"/);
  assert.match(customer, /AdminVoidPendingWalletForm/);
  assert.match(customer, /canVoidPending/);
  assert.match(ledgerPage, /AdminVoidPendingWalletForm/);
  assert.match(ledgerPage, /canVoidPending/);
  assert.match(wallet, /canVoidPending/);
  assert.match(ledger, /canVoidPending/);
  assert.doesNotMatch(ledger, /refundReservedFundsInTx/);
  assert.doesNotMatch(ledger, /prisma\.\$transaction/);
  assert.match(pkg, /qa:admin-wallet-pending-void/);
  console.log("PASS wiring_and_permissions");

  console.log("ALL PASS qa-admin-wallet-pending-void");
}

main();
