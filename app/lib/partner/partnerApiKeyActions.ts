"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import {
  adminRevokePartnerApiKey,
  createPartnerApiKey,
  revokePartnerApiKey,
} from "@/app/lib/partner/partnerApiKeys";
import { headers } from "next/headers";

async function assertSameOriginPartnerRequest(): Promise<boolean> {
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") || h.get("host") || "").trim();
    const origin = (h.get("origin") || "").trim();
    if (!host || !origin) return false;
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}

export type PartnerApiKeyCreateState =
  | null
  | { ok: true; rawToken: string; prefix: string; name: string; message: string }
  | { ok: false; error: string };

export type PartnerApiKeyRevokeState =
  | null
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function createPartnerApiKeyAction(
  _prev: PartnerApiKeyCreateState,
  formData: FormData
): Promise<PartnerApiKeyCreateState> {
  if (!(await assertSameOriginPartnerRequest())) {
    return { ok: false, error: "This request could not be verified." };
  }
  const user = await requireRole("PARTNER");
  const result = await createPartnerApiKey({
    partnerUserId: user.id,
    name: formData.get("name"),
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/partner/account");
  return {
    ok: true,
    rawToken: result.rawToken,
    prefix: result.prefix,
    name: result.name,
    message:
      "API key created. Copy it now — it will not be shown again.",
  };
}

export async function revokePartnerApiKeyAction(
  _prev: PartnerApiKeyRevokeState,
  formData: FormData
): Promise<PartnerApiKeyRevokeState> {
  if (!(await assertSameOriginPartnerRequest())) {
    return { ok: false, error: "This request could not be verified." };
  }
  const user = await requireRole("PARTNER");
  const result = await revokePartnerApiKey({
    partnerUserId: user.id,
    keyId: formData.get("keyId"),
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/partner/account");
  return { ok: true, message: "API key revoked." };
}

export async function adminRevokePartnerApiKeyAction(
  _prev: PartnerApiKeyRevokeState,
  formData: FormData
): Promise<PartnerApiKeyRevokeState> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: "This request could not be verified." };
  }
  const admin = await requireRole("ADMIN");
  await assertAdminPermission(admin.id, "PARTNERS_MANAGE");
  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const keyId = String(formData.get("keyId") ?? "").trim();
  const result = await adminRevokePartnerApiKey({
    adminUserId: admin.id,
    partnerId,
    keyId,
  });
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath(`/admin/partners/${encodeURIComponent(partnerId)}`);
  return { ok: true, message: "API key revoked." };
}
