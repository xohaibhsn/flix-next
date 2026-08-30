"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
  updateUserAction,
  type FormState,
} from "@/lib/auth/actions";
import type { PublicAdminUser } from "@/lib/auth/types";
import { Banner, Field, TextInput } from "@/components/sidhu/fields";
import { PasswordField } from "@/components/sidhu/PasswordField";
import {
  MODULE_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type AdminRole,
} from "@/lib/auth/permissions";

const empty: FormState = {};

function Badge({ label, tone }: { label: string; tone: "ok" | "warn" | "muted" }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800"
        : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

function PermissionBoxes({ selected, disabled }: { selected: string[]; disabled?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {MODULE_PERMISSIONS.map((permission) => (
        <label key={permission} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="permissions"
            value={permission}
            defaultChecked={selected.includes(permission)}
            disabled={disabled}
          />
          {PERMISSION_LABELS[permission]}
        </label>
      ))}
    </div>
  );
}

function CreateUserForm() {
  const router = useRouter();
  const [role, setRole] = useState<AdminRole>("full_access");
  const [state, action, pending] = useActionState(createUserAction, empty);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);
  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-white p-5">
      <h2 className="font-semibold">Add user</h2>
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      {state.ok ? <Banner tone="ok">User created.</Banner> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Username">
          <TextInput name="username" required autoComplete="off" />
        </Field>
        <Field label="Display name">
          <TextInput name="displayName" required />
        </Field>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PasswordField
          name="password"
          label="Password"
          autoComplete="new-password"
          hint="At least 12 characters with upper, lower, number, and symbol."
        />
        <PasswordField name="confirmPassword" label="Confirm password" autoComplete="new-password" />
      </div>
      <Field label="Role">
        <select
          name="role"
          className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
          value={role}
          onChange={(event) => setRole(event.target.value as AdminRole)}
        >
          <option value="full_access">Full Access</option>
          <option value="custom">Custom Access</option>
          <option value="super_admin">Super Admin</option>
        </select>
      </Field>
      {role === "custom" ? <PermissionBoxes selected={["dashboard"]} /> : null}
      <button type="submit" disabled={pending} className="rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Saving…" : "Create user"}
      </button>
    </form>
  );
}

function UserEditor({ user }: { user: PublicAdminUser }) {
  const router = useRouter();
  const [role, setRole] = useState<AdminRole>(user.role);
  const [editState, editAction, editPending] = useActionState(updateUserAction, empty);
  const [resetState, resetAction, resetPending] = useActionState(resetUserPasswordAction, empty);
  const [message, setMessage] = useState<FormState>({});
  useEffect(() => {
    if (editState.ok || resetState.ok) router.refresh();
  }, [editState.ok, resetState.ok, router]);

  async function toggleActive() {
    if (!window.confirm(user.active ? `Disable ${user.username}?` : `Enable ${user.username}?`)) return;
    const result = await setUserActiveAction(user.id, !user.active);
    setMessage(result);
    if (result.ok) router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Delete ${user.username}? This cannot be undone.`)) return;
    const result = await deleteUserAction(user.id);
    setMessage(result);
    if (result.ok) router.refresh();
  }

  return (
    <section className="space-y-4 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{user.displayName}</p>
          <p className="text-xs text-muted">{user.username}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge label={ROLE_LABELS[user.role]} tone={user.role === "super_admin" ? "ok" : "muted"} />
          <Badge label={user.active ? "Active" : "Disabled"} tone={user.active ? "ok" : "warn"} />
          {user.isPrimary ? <Badge label="Primary" tone="muted" /> : null}
        </div>
      </div>
      <p className="text-xs text-muted">Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("en-GB") : "Never"}</p>
      {message.error || editState.error || resetState.error ? (
        <Banner tone="error">{message.error || editState.error || resetState.error}</Banner>
      ) : null}
      {editState.ok || resetState.ok || message.ok ? <Banner tone="ok">Saved.</Banner> : null}

      <form action={editAction} className="space-y-3">
        <input type="hidden" name="id" value={user.id} />
        <Field label="Display name">
          <TextInput name="displayName" defaultValue={user.displayName} required />
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
        {role === "custom" ? <PermissionBoxes selected={user.permissions} /> : null}
        <button type="submit" disabled={editPending} className="rounded-md border border-line px-4 py-2 text-sm font-semibold disabled:opacity-60">
          {editPending ? "Saving…" : "Save details"}
        </button>
      </form>

      <form
        action={resetAction}
        className="space-y-3 border-t border-line pt-4"
        onSubmit={(event) => {
          if (!window.confirm(`Reset password for ${user.username}? They will need to sign in again.`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={user.id} />
        <p className="text-sm font-semibold">Reset password</p>
        <div className="grid gap-3 lg:grid-cols-2">
          <PasswordField name="password" label="Temporary password" autoComplete="new-password" />
          <PasswordField name="confirmPassword" label="Confirm password" autoComplete="new-password" />
        </div>
        <button type="submit" disabled={resetPending} className="rounded-md border border-line px-4 py-2 text-sm font-semibold disabled:opacity-60">
          {resetPending ? "Saving…" : "Reset password"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button type="button" className="rounded-md border border-line px-4 py-2 text-sm" onClick={() => void toggleActive()} disabled={user.isPrimary}>
          {user.active ? "Disable" : "Enable"}
        </button>
        <button type="button" className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-700" onClick={() => void remove()} disabled={user.isPrimary}>
          Delete
        </button>
      </div>
    </section>
  );
}

export function UsersManager({ users }: { users: PublicAdminUser[] }) {
  return (
    <div className="space-y-4">
      <CreateUserForm />
      {users.map((user) => (
        <UserEditor key={user.id} user={user} />
      ))}
    </div>
  );
}
