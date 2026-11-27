/**
 * Shared sandbox fixtures — safe for client + server.
 * No Next.js server imports.
 */

export const SANDBOX_TEST_KEY_PREFIX = "sb_test_";
/** Opening demo wallet for new sandbox partners ($50 USD). */
export const SANDBOX_DEFAULT_BALANCE_CENTS = 5_000;

export type SandboxCatalogItem = {
  id: string;
  region: string;
  name: string;
  dataGb: number;
  days: number;
  priceCents: number;
  currency: "USD";
  /** Demo capability flag — mirrors production catalog supportTopUp. */
  supportTopUp: boolean;
  supportTopUpType: string | null;
};

export const SANDBOX_CATALOG: SandboxCatalogItem[] = [
  {
    id: "sandbox_eu_1gb_7d",
    region: "Europe",
    name: "1 GB · 7 days",
    dataGb: 1,
    days: 7,
    priceCents: 450,
    currency: "USD",
    supportTopUp: true,
    supportTopUpType: "recharge",
  },
  {
    id: "sandbox_us_3gb_15d",
    region: "United States",
    name: "3 GB · 15 days",
    dataGb: 3,
    days: 15,
    priceCents: 900,
    currency: "USD",
    supportTopUp: true,
    supportTopUpType: "recharge",
  },
  {
    id: "sandbox_asia_10gb_30d",
    region: "Asia",
    name: "10 GB · 30 days",
    dataGb: 10,
    days: 30,
    priceCents: 1800,
    currency: "USD",
    supportTopUp: true,
    supportTopUpType: "recharge",
  },
  {
    id: "sandbox_global_5gb_30d",
    region: "Global",
    name: "5 GB · 30 days",
    dataGb: 5,
    days: 30,
    priceCents: 2200,
    currency: "USD",
    supportTopUp: false,
    supportTopUpType: null,
  },
];

export function generateSandboxTestKey(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 20)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${SANDBOX_TEST_KEY_PREFIX}${rand}`;
}
