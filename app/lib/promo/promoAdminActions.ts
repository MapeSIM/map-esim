"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/app/lib/auth/session";
import {
  createAdminPromoCode,
  setAdminPromoActive,
  updateAdminPromoCode,
} from "@/app/lib/promo/promoAdmin";
import { PromoValidationError } from "@/app/lib/promo/promoCode";
import type { PromoAdminActionState } from "@/app/lib/promo/promoAdminState";

export async function createPromoCodeAction(
  _prev: PromoAdminActionState,
  formData: FormData
): Promise<PromoAdminActionState> {
  const admin = await requireRole("ADMIN");
  try {
    const created = await createAdminPromoCode({
      adminUserId: admin.id,
      formData,
    });
    redirect(`/admin/promo-codes/${created.id}`);
  } catch (error) {
    if (error instanceof PromoValidationError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: { [error.field]: error.message },
      };
    }
    if (isRedirectError(error)) throw error;
    return { ok: false, error: "Promo could not be saved. Please try again." };
  }
}

export async function updatePromoCodeAction(
  _prev: PromoAdminActionState,
  formData: FormData
): Promise<PromoAdminActionState> {
  const admin = await requireRole("ADMIN");
  const promoId = String(formData.get("promoId") ?? "").trim();
  try {
    await updateAdminPromoCode({
      adminUserId: admin.id,
      promoId,
      formData,
    });
    return { ok: true, message: "Promo updated." };
  } catch (error) {
    if (error instanceof PromoValidationError) {
      return {
        ok: false,
        error: error.message,
        fieldErrors: { [error.field]: error.message },
      };
    }
    return { ok: false, error: "Promo could not be saved. Please try again." };
  }
}

export async function setPromoCodeActiveAction(
  formData: FormData
): Promise<void> {
  const admin = await requireRole("ADMIN");
  const promoId = String(formData.get("promoId") ?? "").trim();
  const isActive = String(formData.get("isActive") ?? "") === "true";
  await setAdminPromoActive({
    adminUserId: admin.id,
    promoId,
    isActive,
  });
  redirect("/admin/promo-codes");
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}
