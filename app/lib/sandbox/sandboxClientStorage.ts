/** Client-only sandbox persistence keys (localStorage). */

export const SANDBOX_WALLET_KEY = "mapesim_sandbox_wallet_cents";
export const SANDBOX_ORDERS_KEY = "mapesim_sandbox_demo_orders";
export const SANDBOX_API_KEY_KEY = "mapesim_sandbox_api_key";
export const SANDBOX_TX_KEY = "mapesim_sandbox_wallet_tx";
export const SANDBOX_BRANDING_KEY = "mapesim_sandbox_share_branding";

export const SANDBOX_DEFAULT_BUTTON_BG = "#84cc16";
export const SANDBOX_DEFAULT_BUTTON_FG = "#ffffff";

export type SandboxStoredOrder = {
  orderId: string;
  planName: string;
  region: string;
  totalCents: number;
  iccid: string;
  activationCode: string;
  createdAt: string;
  status: "COMPLETED";
};

export type SandboxWalletTx = {
  id: string;
  label: string;
  amountCents: number;
  createdAt: string;
  kind: "credit" | "debit";
};

/** White-label QR share branding persisted in the browser (sandbox only). */
export type SandboxShareBranding = {
  companyName: string;
  supportEmail: string;
  buttonBackground: string;
  buttonTextColor: string;
};

export const SANDBOX_DEFAULT_BRANDING: SandboxShareBranding = {
  companyName: "MAP Partner Co",
  supportEmail: "support@example.com",
  buttonBackground: SANDBOX_DEFAULT_BUTTON_BG,
  buttonTextColor: SANDBOX_DEFAULT_BUTTON_FG,
};

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function normalizeSandboxShareBranding(
  raw: unknown
): SandboxShareBranding {
  const src =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  const companyName =
    typeof src.companyName === "string" && src.companyName.trim()
      ? src.companyName.trim().slice(0, 30)
      : SANDBOX_DEFAULT_BRANDING.companyName;
  const supportEmail =
    typeof src.supportEmail === "string" && src.supportEmail.trim()
      ? src.supportEmail.trim().slice(0, 254)
      : SANDBOX_DEFAULT_BRANDING.supportEmail;
  const buttonBackground =
    typeof src.buttonBackground === "string" && HEX6.test(src.buttonBackground)
      ? src.buttonBackground.toLowerCase()
      : SANDBOX_DEFAULT_BUTTON_BG;
  const buttonTextColor =
    typeof src.buttonTextColor === "string" && HEX6.test(src.buttonTextColor)
      ? src.buttonTextColor.toLowerCase()
      : SANDBOX_DEFAULT_BUTTON_FG;
  return {
    companyName,
    supportEmail,
    buttonBackground,
    buttonTextColor,
  };
}

export function readSandboxShareBranding(): SandboxShareBranding {
  if (typeof window === "undefined") return { ...SANDBOX_DEFAULT_BRANDING };
  try {
    const raw = localStorage.getItem(SANDBOX_BRANDING_KEY);
    if (!raw) return { ...SANDBOX_DEFAULT_BRANDING };
    return normalizeSandboxShareBranding(JSON.parse(raw) as unknown);
  } catch {
    return { ...SANDBOX_DEFAULT_BRANDING };
  }
}

export function writeSandboxShareBranding(
  branding: SandboxShareBranding
): SandboxShareBranding {
  const next = normalizeSandboxShareBranding(branding);
  try {
    localStorage.setItem(SANDBOX_BRANDING_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}
