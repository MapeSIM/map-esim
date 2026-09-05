export type PartnerWalletTopupActionState =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      fieldErrors?: {
        amount?: string;
        walletOperatorId?: string;
        customerMsisdn?: string;
      };
    };

export const initialPartnerWalletTopupState: PartnerWalletTopupActionState = {
  ok: true,
};
