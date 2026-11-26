/** Client-safe sandbox partner shapes (no server-only imports). */

export type SandboxPartnerPublic = {
  id: string;
  name: string;
  email: string;
  balanceCents: number;
  initialBalanceCents: number;
  /** Per-partner Sandbox API access (AND with globalSandboxApiEnabled). */
  apiEnabled: boolean;
  /** Partner discount percent on retail (default 3). */
  discountPercent: number;
  shareCompanyName: string | null;
  shareSupportEmail: string | null;
  shareLogoUrl: string | null;
  shareButtonBackground: string | null;
  shareButtonTextColor: string | null;
  disabledAt: Date | string | null;
  createdAt: Date | string;
  apiKeyPrefix: string | null;
};
