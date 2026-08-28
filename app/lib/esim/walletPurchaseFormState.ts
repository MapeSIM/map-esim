export type WalletPurchaseActionState =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      fieldErrors?: {
        destination?: string;
        offerId?: string;
        confirm?: string;
        useWallet?: string;
        walletOperatorId?: string;
        customerMsisdn?: string;
      };
    };

export const initialWalletPurchaseState: WalletPurchaseActionState = {
  ok: true,
};

export const CARD_PAYMENT_UNAVAILABLE_MESSAGE =
  "Online payment will be available once payment setup is completed.";

export const SPLIT_PAYMENT_UNAVAILABLE_MESSAGE =
  "Split payment is being finalized. Please deselect wallet to continue with card payment.";
