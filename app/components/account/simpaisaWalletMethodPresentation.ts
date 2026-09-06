import {
  SIMPAISA_WALLET_OPERATORS,
  type SimpaisaWalletOperatorId,
} from "@/app/lib/payments/simpaisaPolicy";
import { SIMPAISA_WALLET_OPERATOR_OPTIONS } from "@/app/lib/payments/simpaisaPkrQuote";

/**
 * UI-only presentation for PK mobile wallet methods. Operator IDs unchanged.
 *
 * Easypaisa uses the provided official wordmark.
 * JazzCash uses the provided current branding mark as a sandbox placeholder.
 */
export type MobileWalletMethodPresentation = {
  id: SimpaisaWalletOperatorId;
  label: string;
  logoSrc: string;
  logoAlt: string;
  /** object-contain sizing — keeps original aspect ratio, no stretch. */
  logoClassName: string;
};

const MOBILE_WALLET_PRESENTATION: Record<
  SimpaisaWalletOperatorId,
  Omit<MobileWalletMethodPresentation, "id" | "label">
> = {
  [SIMPAISA_WALLET_OPERATORS.EASYPAISA]: {
    logoSrc: "/payments/easypaisa-logo.svg",
    logoAlt: "Easypaisa",
    logoClassName:
      "h-auto max-h-[3.125rem] w-auto max-w-[15.625rem] object-contain sm:max-h-[3.75rem]",
  },
  [SIMPAISA_WALLET_OPERATORS.JAZZCASH]: {
    logoSrc: "/payments/jazzcash-logo.png",
    logoAlt: "JazzCash",
    logoClassName:
      "h-auto max-h-[4.05rem] w-auto max-w-[6.41rem] object-contain sm:max-h-[4.39rem]",
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
