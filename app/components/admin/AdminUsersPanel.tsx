"use client";

import { useActionState, useId } from "react";
import {
  assignAdminTeamRoleAction,
  deactivateAdminAction,
  inviteAdminAction,
  reactivateAdminAction,
  resendAdminInviteAction,
  updateAdminPermissionsAction,
  type AdminUsersFormState,
} from "@/app/lib/admin/adminUsersActions";
import type { AdminUserListRow } from "@/app/lib/admin/adminUsersShared";
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

function ResendSetupLinkButton({
  row,
}: {
  row: AdminUserListRow;
}) {
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
        className="text-sm font-semibold text-[var(--danger-text)] outline-none hover:underline focus-visible:underline disabled:opacity-60"
      >
        {pending ? "Updating…" : label}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function EnableButton({
  row,
}: {
  row: AdminUserListRow;
}) {
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
        className="text-sm font-semibold text-[var(--accent-strong)] outline-none hover:underline focus-visible:underline disabled:opacity-60"
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

function PermissionsForm({ row }: { row: AdminUserListRow }) {
  const [state, formAction, pending] = useActionState(
    updateAdminPermissionsAction,
    null
  );
  if (row.teamRole === "SUPER_ADMIN") {
    return (
      <p className="text-xs text-[var(--text-muted)]">Full access</p>
    );
  }

  const selected = new Set(row.permissions);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="targetUserId" value={row.id} />
      <input
        type="hidden"
        name="expectedVersion"
        value={String(row.adminStatusVersion)}
      />
      <fieldset className="grid gap-1 sm:grid-cols-2">
        <legend className="sr-only">Permissions</legend>
        {ADMIN_PERMISSIONS.filter((permission) => permission !== "MANAGE_ADMINS").map(
          (permission) => (
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
          )
        )}
      </fieldset>
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-semibold text-[var(--accent-strong)] outline-none hover:underline focus-visible:underline disabled:opacity-60"
      >
        {pending ? "Saving permissions…" : "Save permissions"}
      </button>
      <FormMessage state={state} />
    </form>
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
    <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)]">
          <tr>
            <th className="px-3 py-3 font-semibold">Name</th>
            <th className="px-3 py-3 font-semibold">Email</th>
            <th className="px-3 py-3 font-semibold">Role</th>
            <th className="px-3 py-3 font-semibold">Status</th>
            <th className="px-3 py-3 font-semibold">Last login</th>
            <th className="px-3 py-3 font-semibold">Access</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-[var(--border)] last:border-b-0 align-top"
            >
              <td className="px-3 py-3 font-medium text-[var(--heading)]">
                {row.name}
                {row.isSelf ? (
                  <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                    (you)
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-3 text-[var(--text)]">{row.email}</td>
              <td className="px-3 py-3 text-[var(--text)]">
                {row.isSelf ? (
                  <span>{row.teamRoleLabel}</span>
                ) : (
                  <AssignRoleForm row={row} />
                )}
              </td>
              <td className="px-3 py-3">
                <span
                  className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${statusBadgeClass(row.status)}`}
                >
                  {row.status}
                </span>
                {row.status === "INVITED" ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Invitation pending — password not set yet.
                  </p>
                ) : null}
              </td>
              <td className="px-3 py-3 text-[var(--text-muted)]">
                {row.lastAdminLoginLabel}
              </td>
              <td className="px-3 py-3">
                {row.isSelf ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Super Admin access is managed by another Super Admin.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <PermissionsForm row={row} />
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
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
