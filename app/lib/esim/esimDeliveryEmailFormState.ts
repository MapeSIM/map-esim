export type DeliveryEmailActionState =
  | { ok: true; mode: "account_default" | "confirmed_alternate" }
  | { ok: false; error: string };

export const initialDeliveryEmailActionState: DeliveryEmailActionState = {
  ok: true,
  mode: "account_default",
};
