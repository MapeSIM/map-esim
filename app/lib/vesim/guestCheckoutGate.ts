import "server-only";

/**
 * Server-only authorization for public guest VeSIM provider checkout.
 * Never expose via NEXT_PUBLIC_* — clients cannot override this gate.
 *
 * Enabled only when ENABLE_GUEST_VESIM_CHECKOUT is exactly "true".
 * Missing / any other value → disabled (fail closed).
 */
export function isGuestVesimCheckoutEnabled(): boolean {
  return process.env.ENABLE_GUEST_VESIM_CHECKOUT === "true";
}

export const GUEST_CHECKOUT_UNAVAILABLE_MESSAGE =
  "Online checkout is temporarily unavailable. Please contact support for assistance.";
