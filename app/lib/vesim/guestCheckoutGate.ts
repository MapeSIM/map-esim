import "server-only";

import { cache } from "react";
import { prisma } from "@/app/lib/db";

export const GUEST_CHECKOUT_UNAVAILABLE_MESSAGE =
  "Guest checkout is temporarily unavailable. Please sign in or create an account to buy an eSIM.";

export const GUEST_CHECKOUT_SIGN_IN_MESSAGE =
  "Please sign in or create an account to continue checkout.";

/**
 * Emergency env kill switch only.
 * Exact `GUEST_CHECKOUT_FORCE_OFF=true` forces guest checkout off regardless of
 * the admin DB toggle. Never expose via NEXT_PUBLIC_*.
 *
 * Legacy `ENABLE_GUEST_VESIM_CHECKOUT=false` is intentionally ignored — that was
 * the old fail-closed default and would keep /checkout blocked even when Admin
 * shows Guest Checkout ON.
 */
export function isGuestCheckoutEnvForcedOff(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.GUEST_CHECKOUT_FORCE_OFF === "true";
}

/**
 * Server-only guest checkout authorization (public /checkout + guest APIs).
 * Authoritative source: GuestCheckoutConfig.enabled (default true when missing).
 * Env GUEST_CHECKOUT_FORCE_OFF=true is an emergency hard-off.
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

/** Soft read for admin dashboards — never throws. Reflects effective status. */
export async function getGuestCheckoutConfigView(): Promise<{
  /** Effective: env force-off wins, else DB (missing row = ON). */
  enabled: boolean;
  /** Raw DB enabled (true when row missing). */
  dbEnabled: boolean;
  /** True when GUEST_CHECKOUT_FORCE_OFF=true. */
  envForcedOff: boolean;
  updatedAt: string | null;
}> {
  const envForcedOff = isGuestCheckoutEnvForcedOff();
  try {
    const row = await prisma.guestCheckoutConfig.findUnique({
      where: { id: "default" },
      select: { enabled: true, updatedAt: true },
    });
    const dbEnabled = row ? row.enabled === true : true;
    return {
      enabled: envForcedOff ? false : dbEnabled,
      dbEnabled,
      envForcedOff,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  } catch {
    return {
      enabled: false,
      dbEnabled: false,
      envForcedOff,
      updatedAt: null,
    };
  }
}
