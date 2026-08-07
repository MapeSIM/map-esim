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
      };
    };

export const initialWalletPurchaseState: WalletPurchaseActionState = {
  ok: true,
};

export const CARD_PAYMENT_UNAVAILABLE_MESSAGE =
  "Online payment will be available once payment setup is completed.";
