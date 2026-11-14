import CheckoutClient from "@/app/checkout/CheckoutClient";
import { isGuestVesimCheckoutEnabled } from "@/app/lib/vesim/guestCheckoutGate";

/**
 * Server entry — guest purchase authorization is evaluated only on the server.
 * Clients cannot override GuestCheckoutConfig or the env kill switch.
 */
export default async function CheckoutPage() {
  const guestCheckoutEnabled = await isGuestVesimCheckoutEnabled();
  return <CheckoutClient guestCheckoutEnabled={guestCheckoutEnabled} />;
}
