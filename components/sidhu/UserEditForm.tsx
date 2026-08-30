"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
  updateUserAction,
  type FormState,
} from "@/lib/auth/actions";
import type { PublicAdminUser } from "@/lib/auth/types";
import { Banner, Field, TextInput } from "@/components/sidhu/fields";
import { PasswordField } from "@/components/sidhu/PasswordField";
import { StatusBadge } from "@/components/sidhu/UsersManager";
import {
  MODULE_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type AdminRole,
} from "@/lib/auth/permissions";

const empty: FormState = {};

function PermissionBoxes({ selected }: { selected: string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {MODULE_PERMISSIONS.map((permission) => (
        <label key={permission} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="permissions" value={permission} defaultChecked={selected.includes(permission)} />
          {PERMISSION_LABELS[permission]}
        </label>
      ))}
    </div>
  );
}

export function UserEditForm({
  user,
  isCurrentUser,
}: {
  user: PublicAdminUser;
  isCurrentUser: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState<AdminRole>(user.role);
  const [editState, editAction, editPending] = useActionState(updateUserAction, empty);
  const [resetState, resetAction, resetPending] = useActionState(resetUserPasswordAction, empty);
  const [message, setMessage] = useState<FormState>({});

  useEffect(() => {
    if (editState.ok) router.refresh();
  }, [editState.ok, router]);

  async function toggleActive() {
    if (user.isPrimary) return;
    if (!window.confirm(user.active ? `Disable ${user.username}?` : `Enable ${user.username}?`)) return;
    const result = await setUserActiveAction(user.id, !user.active);
    setMessage(result);
    if (result.ok) router.refresh();
  }

  async function remove() {
    if (user.isPrimary || isCurrentUser) return;
    if (!window.confirm(`Delete ${user.username}? This cannot be undone.`)) return;
    const result = await deleteUserAction(user.id);
    if (!result.ok) {
      setMessage(result);
      return;
    }
    router.push("/sidhu/users/");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/sidhu/users/" className="font-semibold text-brand">
          ← Current users
        </Link>
      </p>

      <section className="rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{user.displayName}</h2>
          <StatusBadge label={ROLE_LABELS[user.role]} tone={user.role === "super_admin" ? "ok" : "muted"} />
          <StatusBadge label={user.active ? "Active" : "Disabled"} tone={user.active ? "ok" : "warn"} />
          {user.isPrimary ? <StatusBadge label="Primary" tone="muted" /> : null}
          {isCurrentUser ? <StatusBadge label="You" tone="ok" /> : null}
        </div>
        <p className="mt-2 text-sm text-muted">{user.username}</p>
        <p className="mt-1 text-xs text-muted">
          Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("en-GB") : "Never"}
        </p>
      </section>

      {message.error || editState.error ? <Banner tone="error">{message.error || editState.error}</Banner> : null}
      {editState.ok || message.ok ? <Banner tone="ok">User details saved.</Banner> : null}

      <form action={editAction} className="space-y-4 rounded-xl border border-line bg-white p-5">
        <input type="hidden" name="id" value={user.id} />
        <Field label="Display name">
          <TextInput name="displayName" defaultValue={user.displayName} required />
        </Field>
        <Field label="Username" hint="Username cannot be changed.">
          <TextInput value={user.username} readOnly disabled />
        </Field>
        <Field label="Role">
          {user.isPrimary ? <input type="hidden" name="role" value="super_admin" /> : null}
          <select
            name={user.isPrimary ? undefined : "role"}
            className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
            value={role}
            onChange={(event) => setRole(event.target.value as AdminRole)}
            disabled={user.isPrimary}
          >
            <option value="full_access">Full Access</option>
            <option value="custom">Custom Access</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </Field>
        {role === "custom" && !user.isPrimary ? <PermissionBoxes selected={user.permissions} /> : null}
        <button type="submit" disabled={editPending} className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {editPending ? "Saving…" : "Save details"}
        </button>
      </form>

      {isCurrentUser ? (
        <section className="rounded-xl border border-line bg-white p-5">
          <h2 className="font-semibold">Password</h2>
          <p className="mt-2 text-sm text-muted">Change your own password in My Account. You will be asked to sign in again.</p>
          <Link href="/sidhu/account/" className="mt-4 inline-flex rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">
            Change my password
          </Link>
        </section>
      ) : (
        <form action={resetAction} className="space-y-4 rounded-xl border border-line bg-white p-5">
          <input type="hidden" name="id" value={user.id} />
          <h2 className="font-semibold">Reset password</h2>
          <p className="text-sm text-muted">Sets a temporary password. The user must sign in again. This does not show the current password.</p>
          {resetState.error ? <Banner tone="error">{resetState.error}</Banner> : null}
          {resetState.ok ? <Banner tone="ok">Password reset. The previous password no longer works.</Banner> : null}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmReset" value="1" required className="mt-1" />
            I understand this will replace their password immediately.
          </label>
          <div className="grid gap-4 lg:grid-cols-2">
            <PasswordField
              name="password"
              label="Temporary password"
              autoComplete="new-password"
              hint="At least 12 characters with upper, lower, number, and symbol."
            />
            <PasswordField name="confirmPassword" label="Confirm password" autoComplete="new-password" />
          </div>
          <button type="submit" disabled={resetPending} className="rounded-md border border-line px-5 py-2.5 text-sm font-semibold disabled:opacity-60">
            {resetPending ? "Saving…" : "Reset password"}
          </button>
        </form>
      )}

      {user.isPrimary ? null : (
        <section className="flex flex-wrap gap-2 rounded-xl border border-line bg-white p-5">
          <button type="button" className="rounded-md border border-line px-4 py-2 text-sm" onClick={() => void toggleActive()}>
            {user.active ? "Disable user" : "Enable user"}
          </button>
          {isCurrentUser ? null : (
            <button type="button" className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700" onClick={() => void remove()}>
              Delete user
            </button>
          )}
        </section>
      )}
    </div>
  );
}
