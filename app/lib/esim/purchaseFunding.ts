/**
 * Pure server-side eSIM purchase funding breakdown (integer USD cents).
 * Never accepts browser-authoritative balances or money fields.
 */

export type PurchaseFundingInput = {
  priceCents: number;
  /** Server-loaded wallet balance only. */
  walletBalanceCents: number;
  useWallet: boolean;
};

export type PurchaseFundingBreakdown = {
  useWallet: boolean;
  walletAppliedCents: number;
  gatewayAmountCents: number;
};

export type PurchaseFundingErrorCode =
  | "INVALID_PRICE"
  | "INVALID_BALANCE"
  | "INVALID_BREAKDOWN";

export class PurchaseFundingError extends Error {
  readonly code: PurchaseFundingErrorCode;

  constructor(code: PurchaseFundingErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PurchaseFundingError";
  }
}

function assertNonNegativeInt(value: number, code: PurchaseFundingErrorCode): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new PurchaseFundingError(code, "Invalid funding amount.");
  }
}

/**
 * Calculate wallet vs gateway contribution for a package price.
 * Wallet balance must come from the server (never the browser).
 */
export function calculatePurchaseFunding(
  input: PurchaseFundingInput
): PurchaseFundingBreakdown {
  const priceCents = input.priceCents;
  const walletBalanceCents = input.walletBalanceCents;
  const useWallet = Boolean(input.useWallet);

  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    throw new PurchaseFundingError("INVALID_PRICE", "Invalid package price.");
  }
  assertNonNegativeInt(walletBalanceCents, "INVALID_BALANCE");

  const walletAppliedCents = useWallet
    ? Math.min(walletBalanceCents, priceCents)
    : 0;
  const gatewayAmountCents = priceCents - walletAppliedCents;

  assertNonNegativeInt(walletAppliedCents, "INVALID_BREAKDOWN");
  assertNonNegativeInt(gatewayAmountCents, "INVALID_BREAKDOWN");
  if (walletAppliedCents + gatewayAmountCents !== priceCents) {
    throw new PurchaseFundingError(
      "INVALID_BREAKDOWN",
      "Invalid funding breakdown."
    );
  }

  return {
    useWallet,
    walletAppliedCents,
    gatewayAmountCents,
  };
}

/** Wallet-only soft-launch persistence: full package from wallet, no gateway. */
export function walletOnlyPurchaseFunding(
  priceCents: number
): PurchaseFundingBreakdown {
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    throw new PurchaseFundingError("INVALID_PRICE", "Invalid package price.");
  }
  return {
    useWallet: true,
    walletAppliedCents: priceCents,
    gatewayAmountCents: 0,
  };
}
