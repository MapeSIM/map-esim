"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/app/lib/auth/session";
import {
  assignAdminTeamRole,
  deactivateAdminUser,
  inviteAdminUser,
  reactivateAdminUser,
  resendAdminInviteSetup,
  updateAdminPermissions,
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
    teamRole: formData.get("teamRole"),
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

export async function assignAdminTeamRoleAction(
  _prev: AdminUsersFormState,
  formData: FormData
): Promise<AdminUsersFormState> {
  const admin = await requireRole("ADMIN");
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const result = await assignAdminTeamRole({
    adminUserId: admin.id,
    targetUserId,
    teamRole: formData.get("teamRole"),
    expectedVersion: formData.get("expectedVersion"),
  });
  if (result.ok) {
    revalidatePath("/admin/admin-users");
  }
  return result;
}

export async function updateAdminPermissionsAction(
  _prev: AdminUsersFormState,
  formData: FormData
): Promise<AdminUsersFormState> {
  const admin = await requireRole("ADMIN");
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const result = await updateAdminPermissions({
    adminUserId: admin.id,
    targetUserId,
    selectedPermissions: formData.getAll("permission"),
    expectedVersion: formData.get("expectedVersion"),
  });
  if (result.ok) {
    revalidatePath("/admin/admin-users");
  }
  return result;
}
