/**
 * Client-safe form state for ADMIN wallet debit.
 * Keep this module free of the server-actions directive so object/constants can be exported.
 */

export type AdminWalletDebitActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: {
    amount?: string;
    reason?: string;
    internalReference?: string;
    confirm?: string;
  };
};

export const initialAdminWalletDebitState: AdminWalletDebitActionState = {
  ok: false,
};
