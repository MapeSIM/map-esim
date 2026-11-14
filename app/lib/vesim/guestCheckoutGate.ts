import "server-only";

import { cache } from "react";
import { prisma } from "@/app/lib/db";

export const GUEST_CHECKOUT_UNAVAILABLE_MESSAGE =
  "Guest checkout is temporarily unavailable. Please sign in or create an account to buy an eSIM.";

export const GUEST_CHECKOUT_SIGN_IN_MESSAGE =
  "Please sign in or create an account to continue checkout.";

/**
 * Emergency env kill switch. Exact "false" forces guest checkout off
 * regardless of the admin DB toggle. Never expose via NEXT_PUBLIC_*.
 */
function isGuestCheckoutEnvForcedOff(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.ENABLE_GUEST_VESIM_CHECKOUT === "false";
}

/**
 * Server-only guest checkout authorization (public /checkout + guest APIs).
 * Authoritative source: GuestCheckoutConfig.enabled (default true when missing).
 * Env ENABLE_GUEST_VESIM_CHECKOUT=false is an emergency hard-off.
 * Fail closed on DB read failure. Account and partner purchases do not use this gate.
 */
export const isGuestVesimCheckoutEnabled = cache(
  async function isGuestVesimCheckoutEnabled(): Promise<boolean> {
    if (isGuestCheckoutEnvForcedOff()) return false;

    try {
      const row = await prisma.guestCheckoutConfig.findUnique({
        where: { id: "default" },
        select: { enabled: true },
      });
      // Missing row → default ON (matches schema default / seed).
      if (!row) return true;
      return row.enabled === true;
    } catch {
      return false;
    }
  }
);

/** Soft read for admin dashboards — never throws. */
export async function getGuestCheckoutConfigView(): Promise<{
  enabled: boolean;
  updatedAt: string | null;
}> {
  if (isGuestCheckoutEnvForcedOff()) {
    return { enabled: false, updatedAt: null };
  }
  try {
    const row = await prisma.guestCheckoutConfig.findUnique({
      where: { id: "default" },
      select: { enabled: true, updatedAt: true },
    });
    return {
      enabled: row ? row.enabled === true : true,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  } catch {
    return { enabled: false, updatedAt: null };
  }
}
