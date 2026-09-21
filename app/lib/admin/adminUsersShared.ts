/**
 * Shared Admin Users list/types (client-safe).
 */
import type {
  AdminPermissionName,
  AdminTeamRoleName,
} from "@/app/lib/admin/adminPermissions";
import { hasAdminPermission } from "@/app/lib/admin/adminPermissions";

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

/** Simple UX categories — display only; does not change permission resolution. */
export const ADMIN_PERMISSION_UX_CATEGORIES = [
  {
    id: "customers",
    label: "Customers",
    emoji: "👥",
    permissions: [
      "CUSTOMERS_VIEW",
      "PARTNERS_MANAGE",
      "SUPPORT_EMAILS",
    ] as const satisfies readonly AdminPermissionName[],
  },
  {
    id: "orders",
    label: "Orders",
    emoji: "📦",
    permissions: [
      "ORDERS_VIEW",
      "ORDERS_MANAGE",
      "ESIM_FULFILLMENT",
      "INSTALL_ISSUES",
    ] as const satisfies readonly AdminPermissionName[],
  },
  {
    id: "payments",
    label: "Payments",
    emoji: "💳",
    permissions: [
      "PAYMENTS_MANAGE",
      "REFUNDS_MANAGE",
      "TRANSACTIONS_VIEW",
      "REVENUE_VIEW",
      "WALLET_ADJUST",
      "PROMO_CODES",
    ] as const satisfies readonly AdminPermissionName[],
  },
  {
    id: "operations",
    label: "Operations",
    emoji: "⚙️",
    permissions: [
      "RECONCILIATION",
      "OPERATIONS_CONTROLS",
      "ALERTS_VIEW",
    ] as const satisfies readonly AdminPermissionName[],
  },
  {
    id: "security",
    label: "Security",
    emoji: "🔒",
    permissions: [
      "MANAGE_ADMINS",
      "AUDIT_LOGS",
    ] as const satisfies readonly AdminPermissionName[],
  },
  {
    id: "settings",
    label: "Settings",
    emoji: "🛠",
    permissions: [
      "SETTINGS_MANAGE",
      "EMAIL_CAMPAIGNS",
      "CUSTOMER_ANNOUNCEMENTS",
    ] as const satisfies readonly AdminPermissionName[],
  },
] as const;

export type AdminPermissionUxCategoryId =
  (typeof ADMIN_PERMISSION_UX_CATEGORIES)[number]["id"];

export type AdminPermissionUxCategorySummary = {
  id: AdminPermissionUxCategoryId;
  label: string;
  emoji: string;
  allowed: boolean;
};

export function summarizeAdminPermissionCategories(
  owned: Iterable<string>
): AdminPermissionUxCategorySummary[] {
  return ADMIN_PERMISSION_UX_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    emoji: category.emoji,
    allowed: hasAdminPermission(owned, [...category.permissions]),
  }));
}

/** Friendly status for non-technical admins. */
export function adminUserStatusDisplayLabel(
  status: AdminUserListStatus
): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "DISABLED":
    case "DELETED":
      return "Inactive";
    case "INVITED":
      return "Invited";
    default:
      return "Inactive";
  }
}

export function adminUserPermissionsSummaryLabel(
  permissions: readonly AdminPermissionName[]
): string {
  const categories = summarizeAdminPermissionCategories(permissions);
  const allowed = categories.filter((c) => c.allowed).map((c) => c.label);
  if (allowed.length === 0) return "No category access";
  if (allowed.length === categories.length) return "Full access areas";
  return allowed.join(" · ");
}
