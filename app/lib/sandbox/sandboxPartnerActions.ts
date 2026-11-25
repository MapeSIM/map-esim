"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import { readAppDomain } from "@/app/lib/domain/readAppDomain";
import {
  SANDBOX_SESSION_COOKIE,
  authenticateSandboxPartner,
  createSandboxPartner,
  deleteSandboxPartner,
  getSandboxPartnerById,
  listSandboxPartners,
  resetSandboxPartnerDemoData,
  rotateSandboxApiKey,
  setSandboxPartnerBalance,
  signSandboxSession,
  topUpSandboxPartner,
  verifySandboxSession,
} from "@/app/lib/sandbox/sandboxPartnerDb";
import type { SandboxPartnerPublic } from "@/app/lib/sandbox/sandboxPartnerTypes";

export type SandboxActionState = {
  ok: boolean;
  error?: string;
  message?: string;
  rawApiKey?: string;
  partnerId?: string;
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

export async function sandboxPartnerLoginAction(
  _prev: SandboxActionState,
  formData: FormData
): Promise<SandboxActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = await authenticateSandboxPartner({ email, password });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
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
  };
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
  const balanceRaw = String(formData.get("initialBalanceUsd") ?? "1250").trim();
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
