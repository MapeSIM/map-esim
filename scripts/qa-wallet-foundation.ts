/**
 * Offline QA for Phase 4A customer wallet ledger foundation (no DB writes, no secrets).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  clampWalletTransactionsPage,
  formatUsdCents,
  parseWalletTransactionsPage,
} from "../app/lib/wallet/display";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /enum WalletCurrency\s*\{[\s\S]*USD/);
  assert.match(schema, /enum WalletDirection\s*\{[\s\S]*CREDIT[\s\S]*DEBIT/);
  assert.match(schema, /enum WalletTransactionType/);
  assert.match(schema, /enum WalletTransactionStatus/);
  assert.match(schema, /model WalletAccount/);
  assert.match(schema, /model WalletTransaction/);
  assert.match(schema, /userId\s+String\s+@unique/);
  assert.match(schema, /balanceCents\s+Int\s+@default\(0\)/);
  assert.match(schema, /amountCents\s+Int/);
  assert.match(schema, /currency\s+WalletCurrency\s+@default\(USD\)/);
  assert.ok(!/rewardPoints|RewardPoint|loyaltyPoints/i.test(schema));
  console.log("PASS one_wallet_usd_integer_cents_schema");

  const migrationDir = join(
    root,
    "prisma/migrations/20260804140000_add_wallet_ledger_foundation"
  );
  assert.ok(existsSync(migrationDir), "migration directory missing");
  const migrationSql = read(
    "prisma/migrations/20260804140000_add_wallet_ledger_foundation/migration.sql"
  );
  assert.match(migrationSql, /CREATE TABLE "WalletAccount"/);
  assert.match(migrationSql, /CREATE TABLE "WalletTransaction"/);
  assert.match(migrationSql, /DEFAULT 0/);
  assert.match(migrationSql, /CHECK \("balanceCents" >= 0\)/);
  assert.match(migrationSql, /CHECK \("amountCents" > 0\)/);
  assert.ok(!/DROP TABLE|TRUNCATE|DELETE FROM/i.test(migrationSql));
  assert.ok(!/INSERT INTO/i.test(migrationSql));
  console.log("PASS migration_additive_only");

  const migrationsRoot = join(root, "prisma/migrations");
  const migrationDirs = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  assert.ok(
    migrationDirs.includes("20260804140000_add_wallet_ledger_foundation")
  );
  console.log("PASS migration_directory_present");

  const readSrc = read("app/lib/wallet/read.ts");
  assert.match(readSrc, /import "server-only"/);
  assert.match(readSrc, /getCustomerWalletSummary/);
  assert.match(readSrc, /getCustomerWalletTransactions/);
  assert.match(readSrc, /role !== Role\.CUSTOMER/);
  assert.match(readSrc, /findUnique/);
  assert.match(readSrc, /select:\s*\{/);
  assert.ok(!/upsert|create\(|update\(|delete\(|\$transaction/i.test(readSrc));
  assert.ok(!/Promise\.all/.test(readSrc));
  assert.match(readSrc, /hasWallet:\s*false/);
  assert.match(readSrc, /formatUsdCents\(0\)/);
  console.log("PASS read_helpers_no_mutation_missing_wallet_zero");

  const displaySrc = read("app/lib/wallet/display.ts");
  assert.match(displaySrc, /formatUsdCents/);
  assert.match(displaySrc, /Number\.isInteger/);
  assert.ok(!/parseFloat|toFixed|\/\s*100\.0/.test(displaySrc));
  assert.match(displaySrc, /Math\.trunc\(abs \/ 100\)/);
  assert.match(displaySrc, /abs % 100/);
  console.log("PASS cents_formatter_integer_only");

  assert.equal(formatUsdCents(0), "$0.00");
  assert.equal(formatUsdCents(1), "$0.01");
  assert.equal(formatUsdCents(1000), "$10.00");
  assert.equal(formatUsdCents(50000), "$500.00");
  assert.equal(formatUsdCents(-250), "-$2.50");
  assert.equal(formatUsdCents(1.5), "$0.00");
  assert.equal(formatUsdCents(NaN), "$0.00");
  assert.equal(formatUsdCents("100" as unknown as number), "$0.00");
  console.log("PASS money_formatter_usd_results");

  assert.equal(parseWalletTransactionsPage(undefined), 1);
  assert.equal(parseWalletTransactionsPage("0"), 1);
  assert.equal(parseWalletTransactionsPage("-3"), 1);
  assert.equal(parseWalletTransactionsPage("abc"), 1);
  assert.equal(parseWalletTransactionsPage("2"), 2);
  assert.deepEqual(clampWalletTransactionsPage(99, 25, 20), {
    page: 2,
    totalPages: 2,
  });
  assert.deepEqual(clampWalletTransactionsPage(1, 0, 20), {
    page: 1,
    totalPages: 1,
  });
  console.log("PASS pagination_parse_and_clamp");

  const walletPage = read("app/account/wallet/page.tsx");
  assert.match(walletPage, /requireRole\("CUSTOMER"\)/);
  assert.match(walletPage, /getCustomerWalletTransactions/);
  assert.match(walletPage, /No wallet transactions yet\./);
  assert.match(
    walletPage,
    /Wallet top-ups will become available after secure payment integration/
  );
  assert.ok(!/top.?up|Top Up|pay now|Add funds/i.test(walletPage.replace(
    /Wallet top-ups will become available after secure payment integration\./g,
    ""
  )));
  assert.ok(!/create\(|upsert|creditWallet|debitWallet/i.test(walletPage));
  console.log("PASS customer_wallet_page_readonly_protection");

  const layoutSrc = read("app/account/layout.tsx");
  assert.match(layoutSrc, /href:\s*"\/account\/wallet"/);
  assert.match(layoutSrc, /label:\s*"Wallet"/);
  console.log("PASS account_nav_wallet_link");

  const overviewSrc = read("app/account/page.tsx");
  assert.match(overviewSrc, /getCustomerWalletSummary/);
  assert.match(overviewSrc, /user\.role === "CUSTOMER"/);
  assert.match(overviewSrc, /View Wallet/);
  assert.match(overviewSrc, /\$0\.00/);
  assert.ok(!/upsert|create\(/i.test(overviewSrc));
  console.log("PASS overview_wallet_card_customer_only");

  // Wallet models/code must not store card/provider secrets (Auth.js Account tokens are out of scope).
  const walletSchemaSlice = schema.slice(schema.indexOf("model WalletAccount"));
  const forbiddenWalletFields =
    /cardNumber|\bcvv\b|\bcvc\b|\bpan\b|paymentMethodId|stripeSecret|providerPayload|passwordHash|access_token|refresh_token|metadata\s+Json/i;
  assert.ok(!forbiddenWalletFields.test(walletSchemaSlice));
  assert.ok(!forbiddenWalletFields.test(readSrc));
  assert.ok(!forbiddenWalletFields.test(displaySrc));
  assert.ok(!forbiddenWalletFields.test(walletPage));
  console.log("PASS no_secrets_or_private_payment_fields");

  assert.ok(!/rewardPoints|RewardPoint|loyaltyPoints|VeSIM wallet/i.test(walletPage));
  assert.ok(!/rewardPoints|RewardPoint|loyaltyPoints/i.test(readSrc));
  console.log("PASS no_reward_points_implementation");

  const packageJson = read("package.json");
  assert.match(packageJson, /"qa:wallet-foundation"/);
  assert.ok(!/migrate reset|db push/i.test(readSrc));
  assert.ok(!/migrate reset|db push/i.test(walletPage));
  console.log("PASS no_destructive_prisma_commands_in_wallet_code");

  // Read/display helpers remain mutation-free; Phase 4B writes live in adminCredit*.
  const walletReadOnlyFiles = [
    "read.ts",
    "display.ts",
    "amount.ts",
    "adminCreditFormState.ts",
    "adminDebitFormState.ts",
  ];
  for (const file of walletReadOnlyFiles) {
    const src = read(`app/lib/wallet/${file}`);
    assert.ok(
      !/\.create\(|\.upsert\(|\.update\(|\.delete\(|\.createMany\(/i.test(src),
      `${file} must not mutate wallet rows`
    );
  }
  assert.ok(existsSync(join(root, "app/lib/wallet/adminCredit.ts")));
  console.log("PASS read_helpers_remain_mutation_free");

  console.log("ALL_QA_PASSED=14");
}

main();
