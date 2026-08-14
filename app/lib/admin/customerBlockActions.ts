"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  blockCustomerAccount,
  reactivateCustomerAccount,
  type CustomerBlockMutationResult,
} from "@/app/lib/admin/customerBlock";

export type CustomerBlockFormState = CustomerBlockMutationResult | null;

export async function blockCustomerAction(
  _prev: CustomerBlockFormState,
  formData: FormData
): Promise<CustomerBlockFormState> {
  const admin = await requireRole("ADMIN");
  const customerUserId = String(formData.get("customerUserId") ?? "").trim();
  const result = await blockCustomerAccount({
    adminUserId: admin.id,
    customerUserId,
    reason: formData.get("reason"),
    expectedVersion: formData.get("expectedVersion"),
  });
  if (result.ok) {
    revalidatePath(`/admin/customers/${encodeURIComponent(customerUserId)}`);
    revalidatePath("/admin/customers");
  }
  return result;
}

export async function reactivateCustomerAction(
  _prev: CustomerBlockFormState,
  formData: FormData
): Promise<CustomerBlockFormState> {
  const admin = await requireRole("ADMIN");
  const customerUserId = String(formData.get("customerUserId") ?? "").trim();
  const result = await reactivateCustomerAccount({
    adminUserId: admin.id,
    customerUserId,
    reason: formData.get("reason"),
    expectedVersion: formData.get("expectedVersion"),
  });
  if (result.ok) {
    revalidatePath(`/admin/customers/${encodeURIComponent(customerUserId)}`);
    revalidatePath("/admin/customers");
  }
  return result;
}
