"use server";

import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { signIn } from "@/auth";
import { normalizeEmail, isValidEmailFormat } from "@/app/lib/auth/email";
import { verifyPassword } from "@/app/lib/auth/password";
import { readRequestOrigin } from "@/app/lib/auth/requestOrigin";
import { requireRole } from "@/app/lib/auth/session";
import { authPrisma } from "@/app/lib/db";
import { readAppDomain } from "@/app/lib/domain/readAppDomain";
import {
  canSandboxPartnerUseApiUi,
  setGlobalSandboxApiEnabled,
  setSandboxPartnerApiEnabled,
} from "@/app/lib/sandbox/sandboxApiControls";
import {
  SANDBOX_SESSION_COOKIE,
  authenticateSandboxPartner,
  createSandboxPartner,
  deleteSandboxPartner,
  getSandboxPartnerById,
  listSandboxPartners,
  resetAllSandboxPartnerDiscountsToDefault,
  resetSandboxPartnerDemoData,
  rotateSandboxApiKey,
  setSandboxPartnerBalance,
  setSandboxPartnerDiscountPercent,
  signSandboxSession,
  topUpSandboxPartner,
  verifySandboxSession,
} from "@/app/lib/sandbox/sandboxPartnerDb";
import {
  SANDBOX_DEFAULT_DISCOUNT_PERCENT,
  clampSandboxDiscountPercent,
} from "@/app/lib/sandbox/sandboxPricing";
import type { SandboxPartnerPublic } from "@/app/lib/sandbox/sandboxPartnerTypes";

export type SandboxActionState = {
  ok: boolean;
  error?: string;
  message?: string;
  rawApiKey?: string;
  partnerId?: string;
  /** Auth.js ADMIN signed in — client should navigate to /sandbox/admin. */
  role?: "admin" | "partner";
  redirectTo?: string;
};

async function requireSandboxAdmin() {
  const domain = await readAppDomain();
  if (domain !== "sandbox") {
    // Localhost retail default: still allow when explicitly on sandbox paths
    // via __domain cookie set by middleware for mapesim.store / ?__domain=.
  }
  const admin = await requireRole("ADMIN");
  return admin;
}

const SANDBOX_LOGIN_ERROR =
  "Invalid email or password. Need sandbox partner access? Contact partners@mapesim.com.";

export async function sandboxPartnerLoginAction(
  _prev: SandboxActionState,
  formData: FormData
): Promise<SandboxActionState> {
  const emailRaw = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!isValidEmailFormat(emailRaw) || !password) {
    return { ok: false, error: SANDBOX_LOGIN_ERROR };
  }

  // 1) Neon sandbox partner (demo portal).
  const result = await authenticateSandboxPartner({
    email: emailRaw,
    password,
  });
  if (result.ok) {
    const jar = await cookies();
    jar.set(SANDBOX_SESSION_COOKIE, signSandboxSession(result.partner.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 14,
    });
    return {
      ok: true,
      message: "Signed in",
      partnerId: result.partner.id,
      rawApiKey: result.rawApiKey ?? undefined,
      role: "partner",
      redirectTo: "/sandbox",
    };
  }

  // 2) Auth.js ADMIN — mapesim.store console at /sandbox/admin.
  const email = normalizeEmail(emailRaw);
  const admin = await authPrisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      adminDisabledAt: true,
      deletedAt: true,
    },
  });
  if (
    admin &&
    !admin.adminDisabledAt &&
    !admin.deletedAt &&
    admin.role === Role.ADMIN &&
    admin.passwordHash &&
    (await verifyPassword(password, admin.passwordHash))
  ) {
    const requestOrigin = await readRequestOrigin();
    const redirectTo =
      requestOrigin && requestOrigin.length > 0
        ? `${requestOrigin}/sandbox/admin`
        : "/sandbox/admin";
    try {
      await signIn("credentials", {
        email,
        password,
        remember: "1",
        redirectTo,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        return { ok: false, error: SANDBOX_LOGIN_ERROR };
      }
      // NEXT_REDIRECT from Auth.js success — rethrow so Next.js navigates.
      throw error;
    }
    return {
      ok: true,
      message: "Signed in",
      role: "admin",
      redirectTo: "/sandbox/admin",
    };
  }

  return { ok: false, error: SANDBOX_LOGIN_ERROR };
}

export async function sandboxPartnerLogoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SANDBOX_SESSION_COOKIE);
}

export async function getCurrentSandboxPartnerAction(): Promise<SandboxPartnerPublic | null> {
  const jar = await cookies();
  const token = jar.get(SANDBOX_SESSION_COOKIE)?.value;
  const partnerId = verifySandboxSession(token);
  if (!partnerId) return null;
  return getSandboxPartnerById(partnerId);
}

/**
 * Explicit Rotate API Key for the signed-in sandbox partner.
 * Does not rotate on login — only when this action is invoked.
 */
export async function rotateSandboxApiKeyAction(
  _prev: SandboxActionState,
  _formData: FormData
): Promise<SandboxActionState> {
  void _formData;
  const jar = await cookies();
  const token = jar.get(SANDBOX_SESSION_COOKIE)?.value;
  const partnerId = verifySandboxSession(token);
  if (!partnerId) {
    return { ok: false, error: "Sign in to rotate your sandbox API key." };
  }
  const access = await canSandboxPartnerUseApiUi(partnerId);
  if (!access.showApiUi) {
    return {
      ok: false,
      error: "API keys are disabled for this sandbox account.",
    };
  }
  const result = await rotateSandboxApiKey(partnerId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/sandbox/account");
  revalidatePath("/sandbox/docs");
  return {
    ok: true,
    message:
      "API key rotated. Copy the new key now — it is shown once. Prior keys stop working immediately.",
    partnerId: result.partner.id,
    rawApiKey: result.rawApiKey,
  };
}

export async function createSandboxPartnerAction(
  _prev: SandboxActionState,
  formData: FormData
): Promise<SandboxActionState> {
  await requireSandboxAdmin();
  const balanceRaw = String(formData.get("initialBalanceUsd") ?? "50").trim();
  const balanceUsd = Number(balanceRaw);
  const initialBalanceCents = Number.isFinite(balanceUsd)
    ? Math.round(balanceUsd * 100)
    : undefined;
  const result = await createSandboxPartner({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    initialBalanceCents,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/sandbox/admin");
  return {
    ok: true,
    message: `Created ${result.partner.name}. Copy the API key now — it is shown once.`,
    partnerId: result.partner.id,
    rawApiKey: result.rawApiKey,
  };
}

export async function setSandboxBalanceAction(
  _prev: SandboxActionState,
  formData: FormData
): Promise<SandboxActionState> {
  await requireSandboxAdmin();
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const usd = Number(String(formData.get("balanceUsd") ?? "").trim());
  if (!partnerId || !Number.isFinite(usd) || usd < 0) {
    return { ok: false, error: "Enter a valid partner and balance." };
  }
  const result = await setSandboxPartnerBalance(
    partnerId,
    Math.round(usd * 100),
    "Admin balance set"
  );
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/sandbox/admin");
  return {
    ok: true,
    message: `Balance set to $${(result.balanceCents / 100).toFixed(2)}.`,
  };
}

export async function topUpSandboxBalanceAction(
  _prev: SandboxActionState,
  formData: FormData
): Promise<SandboxActionState> {
  await requireSandboxAdmin();
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const usd = Number(String(formData.get("topUpUsd") ?? "").trim());
  if (!partnerId || !Number.isFinite(usd) || usd <= 0) {
    return { ok: false, error: "Enter a valid top-up amount." };
  }
  const result = await topUpSandboxPartner(partnerId, Math.round(usd * 100));
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/sandbox/admin");
  return {
    ok: true,
    message: `Topped up. New balance $${(result.balanceCents / 100).toFixed(2)}.`,
  };
}

export async function resetSandboxDemoAction(
  _prev: SandboxActionState,
  formData: FormData
): Promise<SandboxActionState> {
  await requireSandboxAdmin();
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  if (!partnerId) return { ok: false, error: "Missing partner." };
  const result = await resetSandboxPartnerDemoData(partnerId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/sandbox/admin");
  revalidatePath("/sandbox/orders");
  revalidatePath("/sandbox/wallet");
  return { ok: true, message: "Demo orders and wallet reset to opening balance." };
}

export async function deleteSandboxPartnerAction(
  _prev: SandboxActionState,
  formData: FormData
): Promise<SandboxActionState> {
  await requireSandboxAdmin();
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  if (!partnerId) return { ok: false, error: "Missing partner." };
  const result = await deleteSandboxPartner(partnerId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/sandbox/admin");
  return { ok: true, message: "Sandbox partner deleted." };
}

export async function listSandboxPartnersAction(): Promise<SandboxPartnerPublic[]> {
  await requireSandboxAdmin();
  return listSandboxPartners();
}

export async function setGlobalSandboxApiEnabledAction(
  _prev: SandboxActionState,
  formData: FormData
): Promise<SandboxActionState> {
  const admin = await requireSandboxAdmin();
  const enabledRaw = String(formData.get("enabled") ?? "").trim().toLowerCase();
  const enabled = enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "on";
  const result = await setGlobalSandboxApiEnabled({
    enabled,
    adminUserId: admin.id,
  });
  revalidatePath("/sandbox/admin");
  revalidatePath("/sandbox");
  revalidatePath("/sandbox/docs");
  revalidatePath("/sandbox/account");
  return {
    ok: true,
    message: result.globalSandboxApiEnabled
      ? "Global Sandbox API is ON."
      : "Global Sandbox API is OFF — all /api/sandbox/v1 calls return 503.",
  };
}

export async function setSandboxPartnerApiEnabledAction(
  _prev: SandboxActionState,
  formData: FormData
): Promise<SandboxActionState> {
  await requireSandboxAdmin();
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const enabledRaw = String(formData.get("enabled") ?? "").trim().toLowerCase();
  const enabled = enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "on";
  const result = await setSandboxPartnerApiEnabled({ partnerId, enabled });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/sandbox/admin");
  revalidatePath("/sandbox/docs");
  revalidatePath("/sandbox/account");
  return {
    ok: true,
    message: result.apiEnabled
      ? "Partner API access enabled."
      : "Partner API access disabled (403 on API calls).",
  };
}

export async function setSandboxPartnerDiscountAction(
  _prev: SandboxActionState,
  formData: FormData
): Promise<SandboxActionState> {
  await requireSandboxAdmin();
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const raw = String(formData.get("discountPercent") ?? "").trim();
  const parsed = Number(raw);
  if (!partnerId || !Number.isFinite(parsed)) {
    return { ok: false, error: "Enter a valid partner and discount %." };
  }
  const pct = clampSandboxDiscountPercent(parsed);
  const result = await setSandboxPartnerDiscountPercent(partnerId, pct);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/sandbox/admin");
  revalidatePath("/sandbox/catalog");
  revalidatePath("/sandbox/buy");
  return {
    ok: true,
    message: `Discount set to ${result.discountPercent}% off.`,
  };
}

export async function resetAllSandboxDiscountsAction(
  _prev: SandboxActionState,
  _formData: FormData
): Promise<SandboxActionState> {
  void _formData;
  await requireSandboxAdmin();
  const result = await resetAllSandboxPartnerDiscountsToDefault();
  revalidatePath("/sandbox/admin");
  revalidatePath("/sandbox/catalog");
  revalidatePath("/sandbox/buy");
  return {
    ok: true,
    message: `Reset ${result.updated} partner(s) to ${SANDBOX_DEFAULT_DISCOUNT_PERCENT}% off.`,
  };
}
