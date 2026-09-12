/**
 * Pure admin team-permission helpers (safe for offline QA).
 * Guards must check permissions, not team role names.
 */

export const ADMIN_TEAM_ROLES = [
  "SUPER_ADMIN",
  "SUPPORT",
  "OPERATIONS",
  "FINANCE",
  "MARKETING",
] as const;

export type AdminTeamRoleName = (typeof ADMIN_TEAM_ROLES)[number];

export const ADMIN_PERMISSIONS = [
  "MANAGE_ADMINS",
  "CUSTOMERS_VIEW",
  "ORDERS_VIEW",
  "ORDERS_MANAGE",
  "ESIM_FULFILLMENT",
  "INSTALL_ISSUES",
  "SUPPORT_EMAILS",
  "REVENUE_VIEW",
  "TRANSACTIONS_VIEW",
  "REFUNDS_MANAGE",
  "EMAIL_CAMPAIGNS",
  "CUSTOMER_ANNOUNCEMENTS",
  "PARTNERS_MANAGE",
  "PAYMENTS_MANAGE",
  "PROMO_CODES",
  "RECONCILIATION",
  "OPERATIONS_CONTROLS",
  "ALERTS_VIEW",
  "AUDIT_LOGS",
  "SETTINGS_MANAGE",
  "WALLET_ADJUST",
] as const;

export type AdminPermissionName = (typeof ADMIN_PERMISSIONS)[number];

export type AdminPermissionGrantInput = {
  permission: string;
  effect: string;
};

export const ADMIN_TEAM_ROLE_LABELS: Record<AdminTeamRoleName, string> = {
  SUPER_ADMIN: "Super Admin",
  SUPPORT: "Support",
  OPERATIONS: "Operations",
  FINANCE: "Finance",
  MARKETING: "Marketing",
};

export const ADMIN_PERMISSION_LABELS: Record<AdminPermissionName, string> = {
  MANAGE_ADMINS: "Manage admin users",
  CUSTOMERS_VIEW: "Customers",
  ORDERS_VIEW: "Orders (view)",
  ORDERS_MANAGE: "Orders (manage)",
  ESIM_FULFILLMENT: "eSIM fulfillment",
  INSTALL_ISSUES: "Install issues",
  SUPPORT_EMAILS: "Support emails",
  REVENUE_VIEW: "Revenue",
  TRANSACTIONS_VIEW: "Transactions",
  REFUNDS_MANAGE: "Refunds",
  EMAIL_CAMPAIGNS: "Email campaigns",
  CUSTOMER_ANNOUNCEMENTS: "Customer announcements",
  PARTNERS_MANAGE: "Partners",
  PAYMENTS_MANAGE: "Payments",
  PROMO_CODES: "Promo codes",
  RECONCILIATION: "Reconciliation",
  OPERATIONS_CONTROLS: "Operations controls",
  ALERTS_VIEW: "Alerts",
  AUDIT_LOGS: "Audit logs",
  SETTINGS_MANAGE: "Settings",
  WALLET_ADJUST: "Wallet adjustments",
};

const SUPPORT_DEFAULTS: AdminPermissionName[] = [
  "CUSTOMERS_VIEW",
  "ORDERS_VIEW",
  "SUPPORT_EMAILS",
];

const OPERATIONS_DEFAULTS: AdminPermissionName[] = [
  "ORDERS_VIEW",
  "ORDERS_MANAGE",
  "ESIM_FULFILLMENT",
  "INSTALL_ISSUES",
  "OPERATIONS_CONTROLS",
];

const FINANCE_DEFAULTS: AdminPermissionName[] = [
  "REVENUE_VIEW",
  "TRANSACTIONS_VIEW",
  "REFUNDS_MANAGE",
];

const MARKETING_DEFAULTS: AdminPermissionName[] = [
  "EMAIL_CAMPAIGNS",
  "CUSTOMER_ANNOUNCEMENTS",
];

export const ADMIN_TEAM_ROLE_DEFAULTS: Record<
  AdminTeamRoleName,
  readonly AdminPermissionName[]
> = {
  SUPER_ADMIN: ADMIN_PERMISSIONS,
  SUPPORT: SUPPORT_DEFAULTS,
  OPERATIONS: OPERATIONS_DEFAULTS,
  FINANCE: FINANCE_DEFAULTS,
  MARKETING: MARKETING_DEFAULTS,
};

export function isAdminTeamRole(value: unknown): value is AdminTeamRoleName {
  return (
    typeof value === "string" &&
    (ADMIN_TEAM_ROLES as readonly string[]).includes(value)
  );
}

export function isAdminPermission(value: unknown): value is AdminPermissionName {
  return (
    typeof value === "string" &&
    (ADMIN_PERMISSIONS as readonly string[]).includes(value)
  );
}

export function parseAdminTeamRole(
  raw: unknown
): AdminTeamRoleName | null {
  const value = String(raw ?? "").trim();
  return isAdminTeamRole(value) ? value : null;
}

export function hasAdminPermission(
  owned: Iterable<string>,
  required: AdminPermissionName | AdminPermissionName[]
): boolean {
  const set = owned instanceof Set ? owned : new Set(owned);
  const needed = Array.isArray(required) ? required : [required];
  return needed.some((permission) => set.has(permission));
}

/**
 * Resolve effective permissions from team role + optional GRANT/DENY overrides.
 * SUPER_ADMIN always receives every permission. MANAGE_ADMINS cannot be granted
 * to any other role.
 */
export function resolveAdminPermissions(input: {
  teamRole: string;
  grants?: AdminPermissionGrantInput[] | null;
}): Set<AdminPermissionName> {
  const teamRole = isAdminTeamRole(input.teamRole)
    ? input.teamRole
    : null;
  if (!teamRole) {
    return new Set();
  }

  if (teamRole === "SUPER_ADMIN") {
    return new Set(ADMIN_PERMISSIONS);
  }

  const effective = new Set<AdminPermissionName>(
    ADMIN_TEAM_ROLE_DEFAULTS[teamRole]
  );

  for (const grant of input.grants ?? []) {
    if (!isAdminPermission(grant.permission)) continue;
    if (grant.permission === "MANAGE_ADMINS") continue;
    if (grant.effect === "GRANT") {
      effective.add(grant.permission);
    } else if (grant.effect === "DENY") {
      effective.delete(grant.permission);
    }
  }

  effective.delete("MANAGE_ADMINS");
  return effective;
}

export function grantsFromPermissionSelection(input: {
  teamRole: AdminTeamRoleName;
  selected: Iterable<string>;
}): Array<{ permission: AdminPermissionName; effect: "GRANT" | "DENY" }> {
  if (input.teamRole === "SUPER_ADMIN") {
    return [];
  }

  const selected = new Set(
    [...input.selected].filter(
      (value): value is AdminPermissionName =>
        isAdminPermission(value) && value !== "MANAGE_ADMINS"
    )
  );
  const defaults = new Set(ADMIN_TEAM_ROLE_DEFAULTS[input.teamRole]);
  const grants: Array<{
    permission: AdminPermissionName;
    effect: "GRANT" | "DENY";
  }> = [];

  for (const permission of ADMIN_PERMISSIONS) {
    if (permission === "MANAGE_ADMINS") continue;
    const isSelected = selected.has(permission);
    const inDefault = defaults.has(permission);
    if (isSelected && !inDefault) {
      grants.push({ permission, effect: "GRANT" });
    } else if (!isSelected && inDefault) {
      grants.push({ permission, effect: "DENY" });
    }
  }

  return grants;
}
