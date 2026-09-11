import "server-only";

import { BRAND_SITE_URL } from "@/app/lib/brand";
import { buildReferralSignupUrl } from "@/app/lib/referrals/referralCode";
import { REFERRAL_COPY } from "@/app/lib/referrals/referralConstants";
import { ensureUserReferralCode } from "@/app/lib/referrals/referralService";

export type CustomerReferralSummary = {
  code: string;
  shareUrl: string;
  rewardCopy: string;
  cardTitle: string;
  cardSubtitle: string;
};

export async function getCustomerReferralSummary(
  userId: string
): Promise<CustomerReferralSummary | null> {
  const code = await ensureUserReferralCode(userId);
  if (!code) return null;
  return {
    code,
    shareUrl: buildReferralSignupUrl(BRAND_SITE_URL, code),
    rewardCopy: REFERRAL_COPY.rewardLabel,
    cardTitle: REFERRAL_COPY.cardTitle,
    cardSubtitle: REFERRAL_COPY.cardSubtitle,
  };
}
