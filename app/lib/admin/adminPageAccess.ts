/**
 * Map admin URLs to required permissions. Unknown /admin paths are Super Admin only.
 */
import {
  hasAdminPermission,
  type AdminPermissionName,
} from "@/app/lib/admin/adminPermissions";

export type AdminPathAccess =
  | { mode: "any-admin" }
  | { mode: "any-of"; permissions: AdminPermissionName[] }
  | { mode: "super-only" };

function normalizeAdminPath(pathname: string): string {
  const raw = String(pathname ?? "").trim().split("?")[0] || "/";
  if (raw.length > 1 && raw.endsWith("/")) {
    return raw.slice(0, -1);
  }
  return raw;
}

export function requiredAdminAccessForPath(pathname: string): AdminPathAccess {
  const path = normalizeAdminPath(pathname);
  if (path === "/admin") return { mode: "any-admin" };

  if (path.startsWith("/admin/admin-users")) {
    return { mode: "any-of", permissions: ["MANAGE_ADMINS"] };
  }
  if (path.startsWith("/admin/settings")) {
    return { mode: "any-of", permissions: ["SETTINGS_MANAGE"] };
  }
  if (path.startsWith("/admin/audit-logs")) {
    return { mode: "any-of", permissions: ["AUDIT_LOGS"] };
  }
  if (path.startsWith("/admin/alerts")) {
    return { mode: "any-of", permissions: ["ALERTS_VIEW"] };
  }
  if (path.startsWith("/admin/reconciliation")) {
    return { mode: "any-of", permissions: ["RECONCILIATION"] };
  }
  if (path.startsWith("/admin/operations")) {
    return {
      mode: "any-of",
      permissions: ["OPERATIONS_CONTROLS", "INSTALL_ISSUES"],
    };
  }
  if (path.startsWith("/admin/promo-codes")) {
    return { mode: "any-of", permissions: ["PROMO_CODES"] };
  }
  if (path.startsWith("/admin/email-campaigns")) {
    return {
      mode: "any-of",
      permissions: ["EMAIL_CAMPAIGNS", "CUSTOMER_ANNOUNCEMENTS"],
    };
  }
  if (path.startsWith("/admin/emails")) {
    return { mode: "any-of", permissions: ["SUPPORT_EMAILS"] };
  }
  if (path.startsWith("/admin/refund-requests")) {
    return { mode: "any-of", permissions: ["REFUNDS_MANAGE"] };
  }
  if (path.startsWith("/admin/partners")) {
    return { mode: "any-of", permissions: ["PARTNERS_MANAGE"] };
  }
  if (path.startsWith("/admin/revenue")) {
    return { mode: "any-of", permissions: ["REVENUE_VIEW"] };
  }
  if (path.startsWith("/admin/wallet-topups")) {
    return { mode: "any-of", permissions: ["TRANSACTIONS_VIEW"] };
  }
  if (path.startsWith("/admin/payments")) {
    return {
      mode: "any-of",
      permissions: ["TRANSACTIONS_VIEW", "PAYMENTS_MANAGE"],
    };
  }
  if (path.startsWith("/admin/orders")) {
    return { mode: "any-of", permissions: ["ORDERS_VIEW", "ORDERS_MANAGE"] };
  }
  if (path.startsWith("/admin/customers")) {
    if (path.includes("/esim/")) {
      return { mode: "any-of", permissions: ["ESIM_FULFILLMENT"] };
    }
    if (path.includes("/wallet/credit") || path.includes("/wallet/debit")) {
      return { mode: "any-of", permissions: ["WALLET_ADJUST"] };
    }
    if (path.includes("/wallet")) {
      return {
        mode: "any-of",
        permissions: ["CUSTOMERS_VIEW", "TRANSACTIONS_VIEW"],
      };
    }
    return { mode: "any-of", permissions: ["CUSTOMERS_VIEW"] };
  }

  if (path.startsWith("/admin/")) {
    return { mode: "super-only" };
  }
  return { mode: "super-only" };
}

export function canAccessAdminPath(
  owned: Iterable<string>,
  pathname: string
): boolean {
  const access = requiredAdminAccessForPath(pathname);
  if (access.mode === "any-admin") return true;
  if (access.mode === "super-only") {
    return hasAdminPermission(owned, "MANAGE_ADMINS");
  }
  return hasAdminPermission(owned, access.permissions);
}

export const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/revenue", label: "Revenue", exact: false },
  { href: "/admin/orders", label: "Orders", exact: false },
  { href: "/admin/customers", label: "Customers", exact: false },
  { href: "/admin/partners", label: "Partners", exact: false },
  { href: "/admin/wallet-topups", label: "Wallet top-ups", exact: false },
  { href: "/admin/payments", label: "Payments", exact: true },
  { href: "/admin/payments/pending", label: "Pending payments", exact: false },
  { href: "/admin/payments/failed", label: "Failed payments", exact: false },
  { href: "/admin/payments/recovery", label: "Payment recovery", exact: false },
  { href: "/admin/payments/webhooks", label: "Webhook receipts", exact: false },
  { href: "/admin/refund-requests", label: "Refund requests", exact: false },
  { href: "/admin/emails", label: "Email Center", exact: false },
  { href: "/admin/email-campaigns", label: "Email Campaigns", exact: false },
  { href: "/admin/promo-codes", label: "Promo Codes", exact: false },
  { href: "/admin/reconciliation", label: "Reconciliation", exact: false },
  { href: "/admin/operations", label: "Operations", exact: false },
  { href: "/admin/alerts", label: "Alerts", exact: false },
  { href: "/admin/audit-logs", label: "Audit logs", exact: false },
  { href: "/admin/admin-users", label: "Admin Users", exact: false },
  { href: "/admin/settings", label: "Settings", exact: false },
] as const;
