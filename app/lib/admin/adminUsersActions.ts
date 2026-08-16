"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  deactivateAdminUser,
  inviteAdminUser,
  reactivateAdminUser,
  resendAdminInviteSetup,
  type AdminUsersMutationResult,
} from "@/app/lib/admin/adminUsers";

export type AdminUsersFormState = AdminUsersMutationResult | null;

export async function inviteAdminAction(
  _prev: AdminUsersFormState,
  formData: FormData
): Promise<AdminUsersFormState> {
  const admin = await requireRole("ADMIN");
  const result = await inviteAdminUser({
    adminUserId: admin.id,
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (result.ok) {
    revalidatePath("/admin/admin-users");
  }
  return result;
}

export async function resendAdminInviteAction(
  _prev: AdminUsersFormState,
  formData: FormData
): Promise<AdminUsersFormState> {
  const admin = await requireRole("ADMIN");
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const result = await resendAdminInviteSetup({
    adminUserId: admin.id,
    targetUserId,
  });
  if (result.ok) {
    revalidatePath("/admin/admin-users");
  }
  return result;
}

export async function deactivateAdminAction(
  _prev: AdminUsersFormState,
  formData: FormData
): Promise<AdminUsersFormState> {
  const admin = await requireRole("ADMIN");
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const result = await deactivateAdminUser({
    adminUserId: admin.id,
    targetUserId,
    expectedVersion: formData.get("expectedVersion"),
  });
  if (result.ok) {
    revalidatePath("/admin/admin-users");
  }
  return result;
}

export async function reactivateAdminAction(
  _prev: AdminUsersFormState,
  formData: FormData
): Promise<AdminUsersFormState> {
  const admin = await requireRole("ADMIN");
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const result = await reactivateAdminUser({
    adminUserId: admin.id,
    targetUserId,
    expectedVersion: formData.get("expectedVersion"),
  });
  if (result.ok) {
    revalidatePath("/admin/admin-users");
  }
  return result;
}
