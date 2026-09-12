/**
 * Shared Admin Users list/types (client-safe).
 */
import type {
  AdminPermissionName,
  AdminTeamRoleName,
} from "@/app/lib/admin/adminPermissions";

export type AdminUserListStatus =
  | "DELETED"
  | "DISABLED"
  | "INVITED"
  | "ACTIVE";

export type AdminUserListRow = {
  id: string;
  name: string;
  email: string;
  status: AdminUserListStatus;
  createdAt: Date;
  adminStatusVersion: number;
  isSelf: boolean;
  teamRole: AdminTeamRoleName;
  teamRoleLabel: string;
  lastAdminLoginLabel: string;
  permissions: AdminPermissionName[];
};
