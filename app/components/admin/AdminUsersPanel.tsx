"use client";

import { useActionState, useId, useState } from "react";
import {
  assignAdminTeamRoleAction,
  deactivateAdminAction,
  inviteAdminAction,
  reactivateAdminAction,
  resendAdminInviteAction,
  updateAdminPermissionsAction,
  type AdminUsersFormState,
} from "@/app/lib/admin/adminUsersActions";
import {
  adminUserPermissionsSummaryLabel,
  adminUserStatusDisplayLabel,
  summarizeAdminPermissionCategories,
  type AdminUserListRow,
} from "@/app/lib/admin/adminUsersShared";
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_LABELS,
  ADMIN_TEAM_ROLES,
  ADMIN_TEAM_ROLE_LABELS,
} from "@/app/lib/admin/adminPermissions";

function FormMessage({ state }: { state: AdminUsersFormState }) {
  if (!state) return null;
  if (state.ok) {
    return (
      <p
        className="mt-2 text-sm font-medium text-[var(--accent-strong)]"
        role="status"
      >
        {state.message}
      </p>
    );
  }
  return (
    <p
      className="mt-2 text-sm font-medium text-red-700 dark:text-red-300"
      role="alert"
    >
      {state.error}
    </p>
  );
}

function statusBadgeClass(status: AdminUserListRow["status"]): string {
  if (status === "ACTIVE") {
    return "bg-[var(--accent-strong)]/12 text-[var(--accent-strong)]";
  }
  if (status === "INVITED") {
    return "bg-[var(--surface-2)] text-[var(--heading)] ring-1 ring-[var(--border-strong)]";
  }
  if (status === "DISABLED") {
    return "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200";
  }
  return "bg-[var(--surface-2)] text-[var(--text-muted)]";
}

function RoleSelect({
  name,
  defaultValue,
  id,
}: {
  name: string;
  defaultValue: string;
  id?: string;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={defaultValue}
      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
    >
      {ADMIN_TEAM_ROLES.map((role) => (
        <option key={role} value={role}>
          {ADMIN_TEAM_ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}

export function InviteAdminForm() {
  const formId = useId();
  const [state, formAction, pending] = useActionState(inviteAdminAction, null);

  return (
    <section
      className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 sm:px-5"
      aria-labelledby={`${formId}-heading`}
    >
      <div>
        <h2
          id={`${formId}-heading`}
          className="text-base font-semibold tracking-tight text-[var(--heading)]"
        >
          Create admin user
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Creates a dedicated admin account, assigns a team role, and emails a
          one-time password setup link that expires in 30 minutes. Customer
          emails cannot be promoted.
        </p>
      </div>

      <form action={formAction} className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Name
          </span>
          <input
            type="text"
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          />
          {state && !state.ok && state.fieldErrors?.name ? (
            <span className="mt-1 block text-xs text-red-700 dark:text-red-300">
              {state.fieldErrors.name}
            </span>
          ) : null}
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Email
          </span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]/60"
          />
          {state && !state.ok && state.fieldErrors?.email ? (
            <span className="mt-1 block text-xs text-red-700 dark:text-red-300">
              {state.fieldErrors.email}
            </span>
          ) : null}
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
            Role
          </span>
          <RoleSelect name="teamRole" defaultValue="SUPPORT" />
          {state && !state.ok && state.fieldErrors?.teamRole ? (
            <span className="mt-1 block text-xs text-red-700 dark:text-red-300">
              {state.fieldErrors.teamRole}
            </span>
          ) : null}
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-[var(--accent-strong)] px-4 py-2 text-sm font-semibold text-white outline-none hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
          >
            {pending ? "Sending invite…" : "Create admin user"}
          </button>
          <FormMessage state={state} />
        </div>
      </form>
    </section>
  );
}

function ResendSetupLinkButton({ row }: { row: AdminUserListRow }) {
  const [state, formAction, pending] = useActionState(
    resendAdminInviteAction,
    null
  );
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="targetUserId" value={row.id} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-semibold text-[var(--accent-strong)] outline-none hover:underline focus-visible:underline disabled:opacity-60"
      >
        {pending ? "Sending…" : "Resend setup link"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function DisableButton({
  row,
  label,
}: {
  row: AdminUserListRow;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    deactivateAdminAction,
    null
  );
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="targetUserId" value={row.id} />
      <input
        type="hidden"
        name="expectedVersion"
        value={String(row.adminStatusVersion)}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border border-[var(--danger-border)] px-3 py-1.5 text-sm font-semibold text-[var(--danger-text)] outline-none hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
      >
        {pending ? "Updating…" : label}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function EnableButton({ row }: { row: AdminUserListRow }) {
  const [state, formAction, pending] = useActionState(
    reactivateAdminAction,
    null
  );
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      <input type="hidden" name="targetUserId" value={row.id} />
      <input
        type="hidden"
        name="expectedVersion"
        value={String(row.adminStatusVersion)}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
      >
        {pending ? "Enabling…" : "Enable"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function AssignRoleForm({ row }: { row: AdminUserListRow }) {
  const [state, formAction, pending] = useActionState(
    assignAdminTeamRoleAction,
    null
  );
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="targetUserId" value={row.id} />
      <input
        type="hidden"
        name="expectedVersion"
        value={String(row.adminStatusVersion)}
      />
      <RoleSelect name="teamRole" defaultValue={row.teamRole} />
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-semibold text-[var(--accent-strong)] outline-none hover:underline focus-visible:underline disabled:opacity-60"
      >
        {pending ? "Saving role…" : "Assign role"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function PermissionCategorySummary({ row }: { row: AdminUserListRow }) {
  const categories = summarizeAdminPermissionCategories(row.permissions);
  return (
    <ul
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
      data-admin-permission-categories="true"
      aria-label="Permission categories"
    >
      {categories.map((category) => (
        <li
          key={category.id}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
        >
          <p className="font-medium text-[var(--heading)]">
            <span aria-hidden="true">{category.emoji} </span>
            {category.label}
          </p>
          <p
            className={
              category.allowed
                ? "mt-1 text-xs font-semibold text-[var(--accent-strong)]"
                : "mt-1 text-xs font-semibold text-[var(--text-muted)]"
            }
          >
            {category.allowed ? "Allowed" : "Not Allowed"}
          </p>
        </li>
      ))}
    </ul>
  );
}

function PermissionsForm({ row }: { row: AdminUserListRow }) {
  const [state, formAction, pending] = useActionState(
    updateAdminPermissionsAction,
    null
  );
  if (row.teamRole === "SUPER_ADMIN") {
    return (
      <div className="space-y-3">
        <PermissionCategorySummary row={row} />
        <p className="text-xs text-[var(--text-muted)]">Full access</p>
      </div>
    );
  }

  const selected = new Set(row.permissions);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="targetUserId" value={row.id} />
      <input
        type="hidden"
        name="expectedVersion"
        value={String(row.adminStatusVersion)}
      />
      <div
        className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--heading)]"
        role="status"
        data-admin-access-warning="true"
      >
        Changing admin access affects what this user can manage.
      </div>
      <PermissionCategorySummary row={row} />
      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--heading)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]">
          Advanced permission details
        </summary>
        <fieldset className="mt-3 grid gap-1 sm:grid-cols-2">
          <legend className="sr-only">Permissions</legend>
          {ADMIN_PERMISSIONS.filter(
            (permission) => permission !== "MANAGE_ADMINS"
          ).map((permission) => (
            <label
              key={permission}
              className="flex items-start gap-2 text-xs text-[var(--text)]"
            >
              <input
                type="checkbox"
                name="permission"
                value={permission}
                defaultChecked={selected.has(permission)}
                className="mt-0.5"
              />
              <span>{ADMIN_PERMISSION_LABELS[permission]}</span>
            </label>
          ))}
        </fieldset>
      </details>
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-[var(--accent-strong)] px-3 py-1.5 text-sm font-semibold text-white outline-none hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:opacity-60"
      >
        {pending ? "Saving permissions…" : "Save permissions"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function AdminUserCard({ row }: { row: AdminUserListRow }) {
  const [panel, setPanel] = useState<"none" | "view" | "edit">("none");
  const statusLabel = adminUserStatusDisplayLabel(row.status);
  const permissionsSummary = adminUserPermissionsSummaryLabel(row.permissions);

  return (
    <li
      className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
      data-admin-user-card="true"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Name
            </p>
            <p className="mt-0.5 break-words font-semibold text-[var(--heading)]">
              {row.name}
              {row.isSelf ? (
                <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                  (you)
                </span>
              ) : null}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Email
            </p>
            <p className="mt-0.5 break-words text-sm text-[var(--text)]">
              {row.email}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex rounded-lg bg-[var(--surface-2)] px-2 py-1 text-xs font-semibold text-[var(--heading)] ring-1 ring-[var(--border)]">
              Role: {row.teamRoleLabel}
            </span>
            <span
              className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${statusBadgeClass(row.status)}`}
              title={row.status}
            >
              Status: {statusLabel}
              <span className="sr-only"> ({row.status})</span>
            </span>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Main permissions
            </p>
            <p className="mt-0.5 text-sm text-[var(--heading)]">
              {permissionsSummary}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Last activity
            </p>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Last login: {row.lastAdminLoginLabel}
            </p>
          </div>
          {row.status === "INVITED" ? (
            <p className="text-xs text-[var(--text-muted)]">
              Invitation pending — password not set yet.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setPanel((current) => (current === "view" ? "none" : "view"))
            }
            className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-sm font-semibold text-[var(--heading)] outline-none hover:bg-[var(--surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            View Admin
          </button>
          {!row.isSelf ? (
            <button
              type="button"
              onClick={() =>
                setPanel((current) => (current === "edit" ? "none" : "edit"))
              }
              className="rounded-xl bg-[var(--accent-strong)] px-3 py-1.5 text-sm font-semibold text-white outline-none hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
            >
              Edit Access
            </button>
          ) : null}
          {!row.isSelf && row.status === "ACTIVE" ? (
            <DisableButton row={row} label="Deactivate" />
          ) : null}
          {!row.isSelf && row.status === "INVITED" ? (
            <DisableButton row={row} label="Deactivate" />
          ) : null}
          {!row.isSelf && row.status === "DISABLED" ? (
            <EnableButton row={row} />
          ) : null}
        </div>
      </div>

      {panel === "view" ? (
        <div
          className="mt-4 space-y-3 border-t border-[var(--border)] pt-4"
          data-admin-user-view="true"
        >
          <h3 className="text-sm font-semibold text-[var(--heading)]">
            Admin overview
          </h3>
          <PermissionCategorySummary row={row} />
          <p className="text-xs text-[var(--text-muted)]">
            Role {row.teamRoleLabel} · Status {statusLabel} ({row.status}) ·
            Last login {row.lastAdminLoginLabel}
          </p>
        </div>
      ) : null}

      {panel === "edit" && !row.isSelf ? (
        <div
          className="mt-4 space-y-4 border-t border-[var(--border)] pt-4"
          data-admin-user-edit="true"
        >
          <h3 className="text-sm font-semibold text-[var(--heading)]">
            Edit access
          </h3>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Role
            </p>
            <AssignRoleForm row={row} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
              Permissions
            </p>
            <PermissionsForm row={row} />
          </div>
          {row.status === "INVITED" ? (
            <div className="flex flex-col items-start gap-2">
              <ResendSetupLinkButton row={row} />
              <DisableButton row={row} label="Remove access" />
            </div>
          ) : null}
          {row.status === "ACTIVE" ? (
            <DisableButton row={row} label="Disable" />
          ) : null}
          {row.status === "DISABLED" ? <EnableButton row={row} /> : null}
        </div>
      ) : null}

      {row.isSelf && panel === "view" ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Super Admin access is managed by another Super Admin.
        </p>
      ) : null}
    </li>
  );
}

export function AdminUsersTable({ rows }: { rows: AdminUserListRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]" role="status">
        No admin accounts found.
      </p>
    );
  }

  return (
    <ul
      className="space-y-3"
      aria-label="Administrators"
      data-admin-users-simple-list="true"
    >
      {rows.map((row) => (
        <AdminUserCard key={row.id} row={row} />
      ))}
    </ul>
  );
}
