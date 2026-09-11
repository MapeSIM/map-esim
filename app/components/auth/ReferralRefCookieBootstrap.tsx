"use client";

import { useEffect } from "react";
import {
  REFERRAL_COOKIE_MAX_AGE_SEC,
  REFERRAL_COOKIE_NAME,
} from "@/app/lib/referrals/referralConstants";
import { normalizeReferralCode } from "@/app/lib/referrals/referralCode";

/**
 * Persists ?ref= for OAuth signup attribution (email signup uses a hidden field).
 */
export default function ReferralRefCookieBootstrap({
  code,
}: {
  code: string | null;
}) {
  useEffect(() => {
    const normalized = normalizeReferralCode(code);
    if (!normalized) return;
    const secure =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "; Secure"
        : "";
    document.cookie = `${REFERRAL_COOKIE_NAME}=${encodeURIComponent(
      normalized
    )}; Path=/; Max-Age=${REFERRAL_COOKIE_MAX_AGE_SEC}; SameSite=Lax${secure}`;
  }, [code]);

  return null;
}
