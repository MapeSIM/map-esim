export type WalletTopupActionState =
  | { ok: true }
  | {
      ok: false;
      error?: string;
      fieldErrors?: {
        amount?: string;
      };
    };

export const initialWalletTopupState: WalletTopupActionState = { ok: true };
