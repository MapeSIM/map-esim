/**
 * Client-safe form state for Partner Admin UI.
 * Keep this file free of the Server Actions directive and server-only imports so
 * Client Components can import initial state / types without crossing that boundary.
 */

export type PartnersFormState =
  | null
  | { ok: true; message: string }
  | {
      ok: false;
      error?: string;
      fieldErrors?: Partial<
        Record<
          | "name"
          | "email"
          | "discountPercent"
          | "expectedVersion"
          | "reason"
          | "amount"
          | "idempotencyKey",
          string
        >
      >;
    };

/** Flat shape (matches Admin wallet credit form state) so Client Components can read fields without narrowing. */
export type PartnerWalletActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Partial<
    Record<
      "amount" | "idempotencyKey" | "reason" | "confirm" | "internalReference",
      string
    >
  >;
};

export const initialPartnerWalletActionState: PartnerWalletActionState = {
  ok: false,
};
