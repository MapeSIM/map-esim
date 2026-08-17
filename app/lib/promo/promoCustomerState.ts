export type PromoCheckoutActionState =
  | { ok: true }
  | { ok: false; error: string };

export const initialPromoCheckoutState: PromoCheckoutActionState = { ok: true };
