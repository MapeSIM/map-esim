export type WalletPurchaseActionState =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      fieldErrors?: {
        destination?: string;
        offerId?: string;
        confirm?: string;
      };
    };

export const initialWalletPurchaseState: WalletPurchaseActionState = {
  ok: true,
};
