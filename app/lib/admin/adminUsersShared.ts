/**
 * Shared Admin Users list/types (client-safe).
 */
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
};
