"use server";

import { redirect } from "next/navigation";
import { assertAdminPermission } from "@/app/lib/admin/adminPermissionAccess";
import { voidPendingWalletEsimPurchaseReservation } from "@/app/lib/admin/walletPendingVoid";
import { requireRole } from "@/app/lib/auth/session";

function safeReturnPath(customerUserId: string, returnToRaw: string): string {
  const fallback = `/admin/customers/${encodeURIComponent(customerUserId)}`;
  const returnTo = (returnToRaw ?? "").trim();
  if (!returnTo.startsWith("/admin/customers/")) return fallback;
  if (returnTo.includes("//") || returnTo.includes("\\")) return fallback;
  if (!returnTo.includes(encodeURIComponent(customerUserId)) &&
      !returnTo.includes(customerUserId)) {
    return fallback;
  }
  if (returnTo.length > 512) return fallback;
  return returnTo;
}

function withQuery(path: string, key: string, value: string): string {
  const url = new URL(path, "https://admin.local");
  url.searchParams.delete("walletVoid");
  url.searchParams.delete("walletVoidError");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

export async function voidPendingWalletReservationAction(
  formData: FormData
): Promise<void> {
  const admin = await requireRole("ADMIN");
  await assertAdminPermission(admin.id, "WALLET_ADJUST");

  const customerUserId = String(formData.get("customerUserId") ?? "").trim();
  const walletTransactionId = String(
    formData.get("walletTransactionId") ?? ""
  ).trim();
  const returnTo = safeReturnPath(
    customerUserId,
    String(formData.get("returnTo") ?? "")
  );
  const confirmed = formData.get("confirm") === "on";

  if (!customerUserId || customerUserId.length > 64) {
    redirect(withQuery(returnTo, "walletVoidError", "customer_unavailable"));
  }
  if (!confirmed) {
    redirect(withQuery(returnTo, "walletVoidError", "confirm_required"));
  }

  const result = await voidPendingWalletEsimPurchaseReservation({
    adminUserId: admin.id,
    customerUserId,
    walletTransactionId,
  });

  if (!result.ok) {
    redirect(withQuery(returnTo, "walletVoidError", "void_failed"));
  }

  redirect(
    withQuery(
      returnTo,
      "walletVoid",
      result.alreadyReleased ? "already" : "ok"
    )
  );
}
