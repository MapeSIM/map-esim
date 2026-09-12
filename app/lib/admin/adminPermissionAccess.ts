/**
 * Server-side admin permission loader and guards.
 */
import "server-only";

import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/db";
import { requireRole } from "@/app/lib/auth/session";
import { isAdminAccessDenied } from "@/app/lib/auth/adminAccessShared";
import {
  hasAdminPermission,
  resolveAdminPermissions,
  type AdminPermissionName,
  type AdminTeamRoleName,
} from "@/app/lib/admin/adminPermissions";
import { canAccessAdminPath } from "@/app/lib/admin/adminPageAccess";

export type LoadedAdminAccess = {
  userId: string;
  teamRole: AdminTeamRoleName | null;
  permissions: Set<AdminPermissionName>;
};

export async function loadAdminAccess(
  userId: string
): Promise<LoadedAdminAccess | null> {
  const id = (userId ?? "").trim();
  if (!id || id.length > 64) return null;

  const admin = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      deletedAt: true,
      adminDisabledAt: true,
      adminTeamRole: true,
      adminPermissionGrants: {
        select: { permission: true, effect: true },
      },
    },
  });

  if (!admin || isAdminAccessDenied(admin)) {
    return null;
  }

  const permissions = resolveAdminPermissions({
    teamRole: admin.adminTeamRole,
    grants: admin.adminPermissionGrants,
  });

  return {
    userId: admin.id,
    teamRole: admin.adminTeamRole,
    permissions,
  };
}

export async function actorHasAdminPermission(
  userId: string,
  required: AdminPermissionName | AdminPermissionName[]
): Promise<boolean> {
  const access = await loadAdminAccess(userId);
  if (!access) return false;
  return hasAdminPermission(access.permissions, required);
}

export async function assertAdminPermission(
  userId: string,
  required: AdminPermissionName | AdminPermissionName[]
): Promise<void> {
  const allowed = await actorHasAdminPermission(userId, required);
  if (!allowed) {
    redirect("/admin?forbidden=1");
  }
}

export async function requireAdminPermission(
  required: AdminPermissionName | AdminPermissionName[]
) {
  const user = await requireRole("ADMIN");
  await assertAdminPermission(user.id, required);
  return user;
}

export async function assertAdminPathAccess(
  userId: string,
  pathname: string
): Promise<AdminPermissionName[]> {
  const access = await loadAdminAccess(userId);
  if (!access || !canAccessAdminPath(access.permissions, pathname)) {
    redirect("/admin?forbidden=1");
  }
  return [...access.permissions];
}

export async function apiActorHasAdminPermission(
  userId: string,
  required: AdminPermissionName | AdminPermissionName[]
): Promise<boolean> {
  return actorHasAdminPermission(userId, required);
}
