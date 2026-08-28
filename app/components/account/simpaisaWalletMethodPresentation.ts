import {
  SIMPAISA_WALLET_OPERATORS,
  type SimpaisaWalletOperatorId,
} from "@/app/lib/payments/simpaisaPolicy";
import { SIMPAISA_WALLET_OPERATOR_OPTIONS } from "@/app/lib/payments/simpaisaPkrQuote";

/**
 * UI-only presentation for PK mobile wallet methods. Operator IDs unchanged.
 *
 * placeholderMarkSrc values point at temporary sandbox monograms in /public/payments.
 * They are NOT official Easypaisa or JazzCash brand assets — replace with approved
 * artwork before production launch.
 */
export type MobileWalletMethodPresentation = {
  id: SimpaisaWalletOperatorId;
  label: string;
  /** Temporary sandbox placeholder mark — not an official brand logo. */
  placeholderMarkSrc: string;
  placeholderMarkAlt: string;
  accentClass: string;
  description: string;
};

const MOBILE_WALLET_PRESENTATION: Record<
  SimpaisaWalletOperatorId,
  Omit<MobileWalletMethodPresentation, "id" | "label">
> = {
  [SIMPAISA_WALLET_OPERATORS.EASYPAISA]: {
    placeholderMarkSrc: "/payments/easypaisa-sandbox-placeholder.svg",
    placeholderMarkAlt:
      "Temporary sandbox placeholder mark for Easypaisa — not an official logo",
    accentClass: "from-emerald-500/15 to-emerald-600/5",
    description: "Pay with your Easypaisa mobile wallet",
  },
  [SIMPAISA_WALLET_OPERATORS.JAZZCASH]: {
    placeholderMarkSrc: "/payments/jazzcash-sandbox-placeholder.svg",
    placeholderMarkAlt:
      "Temporary sandbox placeholder mark for JazzCash — not an official logo",
    accentClass: "from-rose-500/15 to-rose-600/5",
    description: "Pay with your JazzCash mobile wallet",
  },
};

export const SIMPAISA_MOBILE_WALLET_METHODS: MobileWalletMethodPresentation[] =
  SIMPAISA_WALLET_OPERATOR_OPTIONS.map((option) => ({
    id: option.id as SimpaisaWalletOperatorId,
    label: option.label,
    ...MOBILE_WALLET_PRESENTATION[option.id as SimpaisaWalletOperatorId],
  }));

/** Reserved slot shape for a future card gateway option (not implemented). */
export const FUTURE_CARD_PAYMENT_METHOD_LABEL = "Card — Visa / Mastercard";
