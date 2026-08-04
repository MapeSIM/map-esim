/**
 * Client-safe form state for ADMIN wallet credit.
 * Keep this module free of the server-actions directive so object/constants can be exported.
 */

export type AdminWalletCreditActionState = {
  ok: boolean;
  error?: string;
  fieldErrors?: {
    amount?: string;
    reason?: string;
    internalReference?: string;
    confirm?: string;
  };
};

export const initialAdminWalletCreditState: AdminWalletCreditActionState = {
  ok: false,
};
