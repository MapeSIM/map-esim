"use server";

import { revalidatePath } from "next/cache";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import { assertSameOriginAdminRequest } from "@/app/lib/admin/reconciliationCaseManagement";
import { requireRole } from "@/app/lib/auth/session";
import { setPartnerApiEnabled } from "@/app/lib/partner/partnerApiAccessAdmin";
import { adminRevokePartnerApiKey } from "@/app/lib/partner/partnerApiKeys";

export type PartnerApiAccessActionState =
  | null
  | { ok: true; message: string; apiEnabled?: boolean }
  | { ok: false; error: string };

export async function setPartnerApiEnabledAction(
  _prev: PartnerApiAccessActionState,
  formData: FormData
): Promise<PartnerApiAccessActionState> {
  if (!(await assertSameOriginAdminRequest())) {
    return { ok: false, error: "This request could not be verified." };
  }
  const admin = await requireRole("ADMIN");
  await assertAdminPermission(admin.id, "PARTNERS_MANAGE");

  const partnerId = String(formData.get("partnerId") ?? "").trim();
  const enabledRaw = String(formData.get("enabled") ?? "").trim();
  const enabled = enabledRaw === "1" || enabledRaw === "true";

  const result = await setPartnerApiEnabled({
    adminUserId: admin.id,
    partnerId,
    enabled,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/partners");
  revalidatePath(`/admin/partners/${encodeURIComponent(partnerId)}`);
  return {
    ok: true,
    apiEnabled: result.apiEnabled,
    message: result.apiEnabled
      ? "Partner API access enabled."
      : "Partner API access disabled.",
  };
}

export async function adminRevokePartnerApiKeyFormAction(
  _prev: PartnerApiAccessActionState,
  formData: FormData
): Promise<PartnerApiAccessActionState> {
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
