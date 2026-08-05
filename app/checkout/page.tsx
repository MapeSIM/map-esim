import CheckoutClient from "@/app/checkout/CheckoutClient";
import { isGuestVesimCheckoutEnabled } from "@/app/lib/vesim/guestCheckoutGate";

/**
 * Server entry — guest purchase authorization is evaluated only on the server.
 * Clients cannot override ENABLE_GUEST_VESIM_CHECKOUT.
 */
export default function CheckoutPage() {
  return (
    <CheckoutClient guestCheckoutEnabled={isGuestVesimCheckoutEnabled()} />
  );
}
