"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import { parseProviderRefreshReason } from "@/app/lib/admin/providerRefreshShared";
import {
  refreshProviderOrderStatus,
  type ProviderRefreshActionResult,
} from "@/app/lib/admin/providerRefresh";

export type ProviderRefreshFormState = ProviderRefreshActionResult | null;

/**
 * Controlled GET-only provider status refresh.
 * Never accepts a browser-supplied providerOrderId as the lookup target.
 */
export async function refreshProviderStatusAction(
  _prev: ProviderRefreshFormState,
  formData: FormData
): Promise<ProviderRefreshFormState> {
  const admin = await requireRole("ADMIN");

  const sourceType = String(formData.get("sourceType") ?? "").trim();
  const attemptId = String(formData.get("attemptId") ?? "").trim();
  const expectedProviderOrderId = String(
    formData.get("expectedProviderOrderId") ?? ""
  ).trim();
  const reasonParsed = parseProviderRefreshReason(formData.get("reason"));

  // Explicitly ignore any browser-supplied lookup id field.
  void formData.get("providerOrderId");
  void formData.get("orderId");

  if (!reasonParsed.ok) {
    return {
      ok: false,
      error: reasonParsed.error,
      fieldErrors: { reason: reasonParsed.error },
    };
  }

  const result = await refreshProviderOrderStatus({
    adminUserId: admin.id,
    sourceType,
    attemptId,
    reason: reasonParsed.reason,
    expectedProviderOrderId,
  });

  if (result.ok) {
    revalidatePath(
      `/admin/reconciliation/${encodeURIComponent(sourceType)}/${encodeURIComponent(attemptId)}`
    );
    revalidatePath("/admin/reconciliation");
  }

  return result;
}
