export type PromoAdminActionState =
  | { ok: true; message?: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
    };

export const initialPromoAdminState: PromoAdminActionState = { ok: true };
