/** Client-safe sandbox partner shapes (no server-only imports). */

export type SandboxPartnerPublic = {
  id: string;
  name: string;
  email: string;
  balanceCents: number;
  initialBalanceCents: number;
  shareCompanyName: string | null;
  shareSupportEmail: string | null;
  shareLogoUrl: string | null;
  shareButtonBackground: string | null;
  shareButtonTextColor: string | null;
  disabledAt: Date | string | null;
  createdAt: Date | string;
  apiKeyPrefix: string | null;
};
