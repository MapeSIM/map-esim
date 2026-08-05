export type AdminWalletPurchaseActionState =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      fieldErrors?: {
        destination?: string;
        offerId?: string;
        reason?: string;
        confirm?: string;
        confirmPhrase?: string;
      };
    };

export const initialAdminWalletPurchaseState = {
  ok: true,
} as AdminWalletPurchaseActionState;
