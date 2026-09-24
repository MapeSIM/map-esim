/**
 * Offline QA for Admin UX Phase 4 visual consistency primitives.
 * Presentation only — no payment/wallet/refund mutations.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const files = [
    "app/components/admin/ui/adminSurfaceClasses.ts",
    "app/components/admin/ui/AdminPageHeader.tsx",
    "app/components/admin/ui/AdminEmptyState.tsx",
    "app/components/admin/ui/AdminFilterPanel.tsx",
    "app/components/admin/ui/AdminTableShell.tsx",
    "app/components/admin/ui/index.ts",
  ];
  for (const rel of files) {
    assert.ok(existsSync(join(root, rel)), rel);
  }
  console.log("PASS shared_ui_files_exist");

  const index = read("app/components/admin/ui/index.ts");
  assert.match(index, /AdminPageHeader/);
  assert.match(index, /AdminEmptyState/);
  assert.match(index, /AdminFilterPanel/);
  assert.match(index, /AdminTableShell/);
  assert.match(index, /ADMIN_PAGE_STACK_CLASS/);
  console.log("PASS ui_barrel_exports");

  const payments = read("app/admin/payments/page.tsx");
  assert.match(payments, /AdminPageHeader/);
  assert.match(payments, /AdminFilterPanel/);
  assert.match(payments, /AdminEmptyState/);
  assert.match(payments, /AdminTableShell/);
  assert.doesNotMatch(
    payments,
    /applyVerifiedEsimPurchasePaymentEvent|Mark paid/i
  );
  console.log("PASS payments_hub_uses_shared_ui");

  const orders = read("app/admin/orders/page.tsx");
  assert.match(orders, /AdminFilterPanel/);
  assert.match(orders, /AdminTableShell/);
  assert.match(orders, /AdminEmptyState/);
  console.log("PASS orders_uses_shared_ui");

  const pending = read("app/admin/payments/pending/page.tsx");
  const failed = read("app/admin/payments/failed/page.tsx");
  const recovery = read("app/admin/payments/recovery/page.tsx");
  const webhooks = read("app/admin/payments/webhooks/page.tsx");
  assert.match(pending, /AdminEmptyState/);
  assert.match(failed, /AdminEmptyState/);
  assert.match(recovery, /AdminEmptyState/);
  assert.match(recovery, /AdminTableShell/);
  assert.match(webhooks, /AdminEmptyState/);
  assert.match(webhooks, /AdminPageHeader/);
  assert.match(webhooks, /ADMIN_LIST_CARD_CLASS/);
  console.log("PASS payment_queues_empty_and_tables");

  const overview = read("app/admin/page.tsx");
  assert.match(overview, /AdminPageHeader/);
  assert.match(overview, /AdminEmptyState/);
  assert.match(overview, /AdminTableShell/);
  assert.match(overview, /ADMIN_SECTION_TITLE_CLASS/);
  console.log("PASS overview_uses_shared_ui");

  const detail = read("app/admin/payments/[attemptId]/page.tsx");
  assert.match(detail, /AdminPageHeader/);
  assert.match(detail, /AdminEmptyState/);
  assert.match(detail, /ADMIN_CARD_CLASS/);
  assert.doesNotMatch(detail, /\bCARD_CLASS\b|\bEMPTY_CLASS\b/);
  assert.match(detail, /PAYMENT_DETAIL_WORKBENCH_TITLE/);
  console.log("PASS payment_detail_shared_surfaces");

  const layout = read("app/admin/layout.tsx");
  assert.match(layout, /px-3 py-6/);
  assert.match(layout, /p-4 sm:p-6 lg:p-8/);
  const pill = read("app/components/admin/ui/AdminStatusPill.tsx");
  assert.match(pill, /max-w-full/);
  assert.match(pill, /break-words/);
  const nav = read("app/components/admin/AdminNav.tsx");
  assert.match(nav, /overflow-y-auto/);
  console.log("PASS mobile_layout_and_badge_polish");

  for (const rel of [
    "app/components/admin/ui/AdminPageHeader.tsx",
    "app/components/admin/ui/AdminEmptyState.tsx",
    "app/components/admin/ui/AdminFilterPanel.tsx",
    "app/components/admin/ui/AdminTableShell.tsx",
    "app/components/admin/ui/adminSurfaceClasses.ts",
  ]) {
    const src = read(rel);
    assert.doesNotMatch(src, /prisma|markPaid|applyVerified|refundReserved/i);
  }
  console.log("PASS shared_ui_no_payment_side_effects");

  console.log("ALL_QA_PASSED=admin-ui-consistency");
}

main();
