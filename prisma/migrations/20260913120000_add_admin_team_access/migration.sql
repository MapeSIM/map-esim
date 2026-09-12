-- CreateEnum
CREATE TYPE "AdminTeamRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT', 'OPERATIONS', 'FINANCE', 'MARKETING');

-- CreateEnum
CREATE TYPE "AdminPermission" AS ENUM ('MANAGE_ADMINS', 'CUSTOMERS_VIEW', 'ORDERS_VIEW', 'ORDERS_MANAGE', 'ESIM_FULFILLMENT', 'INSTALL_ISSUES', 'SUPPORT_EMAILS', 'REVENUE_VIEW', 'TRANSACTIONS_VIEW', 'REFUNDS_MANAGE', 'EMAIL_CAMPAIGNS', 'CUSTOMER_ANNOUNCEMENTS', 'PARTNERS_MANAGE', 'PAYMENTS_MANAGE', 'PROMO_CODES', 'RECONCILIATION', 'OPERATIONS_CONTROLS', 'ALERTS_VIEW', 'AUDIT_LOGS', 'SETTINGS_MANAGE', 'WALLET_ADJUST');

-- CreateEnum
CREATE TYPE "AdminPermissionEffect" AS ENUM ('GRANT', 'DENY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "adminTeamRole" "AdminTeamRole" NOT NULL DEFAULT 'SUPER_ADMIN',
ADD COLUMN "lastAdminLoginAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminPermissionGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "AdminPermission" NOT NULL,
    "effect" "AdminPermissionEffect" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminPermissionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_adminTeamRole_idx" ON "User"("adminTeamRole");

-- CreateIndex
CREATE UNIQUE INDEX "AdminPermissionGrant_userId_permission_key" ON "AdminPermissionGrant"("userId", "permission");

-- CreateIndex
CREATE INDEX "AdminPermissionGrant_userId_idx" ON "AdminPermissionGrant"("userId");

-- AddForeignKey
ALTER TABLE "AdminPermissionGrant" ADD CONSTRAINT "AdminPermissionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
