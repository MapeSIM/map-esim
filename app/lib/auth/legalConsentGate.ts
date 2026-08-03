import { cache } from "react";
import type { ConsentDbFields } from "@/app/lib/auth/legalConsentPolicy";
import { prisma } from "@/app/lib/db";

export {
  deriveNeedsLegalConsent,
  isAllowedDuringLegalConsent,
  resolveAuthMethod,
  type ConsentDbFields,
} from "@/app/lib/auth/legalConsentPolicy";

/**
 * Request-scoped cache: root layout auth() + admin requireRole/auth() often
 * reload the same user in one RSC tree — dedupe without weakening checks.
 */
export const loadConsentGateUser = cache(
  async (
    userId: string
  ): Promise<
    | (ConsentDbFields & {
        emailVerifiedAt: Date | null;
        deletedAt: Date | null;
        credentialsChangedAt: Date | null;
      })
    | null
  > => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        emailVerifiedAt: true,
        credentialsChangedAt: true,
        deletedAt: true,
        termsAcceptedAt: true,
        privacyAcknowledgedAt: true,
        termsVersion: true,
        privacyVersion: true,
        passwordHash: true,
        accounts: {
          where: { provider: "google" },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!user) return null;
    return {
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
      credentialsChangedAt: user.credentialsChangedAt,
      deletedAt: user.deletedAt,
      termsAcceptedAt: user.termsAcceptedAt,
      privacyAcknowledgedAt: user.privacyAcknowledgedAt,
      termsVersion: user.termsVersion,
      privacyVersion: user.privacyVersion,
      passwordHash: user.passwordHash,
      hasGoogleAccount: user.accounts.length > 0,
    };
  }
);
