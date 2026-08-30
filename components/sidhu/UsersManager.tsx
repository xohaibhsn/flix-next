"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createUserAction, setUserActiveAction, type FormState } from "@/lib/auth/actions";
import type { PublicAdminUser } from "@/lib/auth/types";
import { Banner, Field, TextInput } from "@/components/sidhu/fields";
import { PasswordField } from "@/components/sidhu/PasswordField";
import {
  MODULE_PERMISSIONS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  type AdminRole,
} from "@/lib/auth/permissions";
import { useAdminSession } from "@/components/sidhu/AdminSessionProvider";

const empty: FormState = {};

export function StatusBadge({ label, tone }: { label: string; tone: "ok" | "warn" | "muted" }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "warn"
        ? "bg-amber-50 text-amber-800"
        : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

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

function CreateUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AdminRole>("full_access");
  const [state, action, pending] = useActionState(createUserAction, empty);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Add user</h2>
        <button
          type="button"
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Add user"}
        </button>
      </div>
      {open ? (
        <form action={action} className="mt-4 space-y-4">
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
      ) : null}
    </section>
  );
}

function formatLogin(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-GB");
}

export function UsersManager({ users }: { users: PublicAdminUser[] }) {
  const session = useAdminSession();
  const router = useRouter();
  const [message, setMessage] = useState<FormState>({});

  async function toggleActive(user: PublicAdminUser) {
    if (user.isPrimary) return;
    if (!window.confirm(user.active ? `Disable ${user.username}?` : `Enable ${user.username}?`)) return;
    const result = await setUserActiveAction(user.id, !user.active);
    setMessage(result);
    if (result.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      <CreateUserForm />
      {message.error ? <Banner tone="error">{message.error}</Banner> : null}
      {message.ok ? <Banner tone="ok">User updated.</Banner> : null}

      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-semibold">Current users</h2>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#f8f8fb] text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-3">Display name</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isYou = session?.id === user.id;
                return (
                  <tr key={user.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <p className="font-medium">{user.displayName}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {user.isPrimary ? <StatusBadge label="Primary" tone="muted" /> : null}
                        {isYou ? <StatusBadge label="You" tone="ok" /> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">{user.username}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={ROLE_LABELS[user.role]}
                        tone={user.role === "super_admin" ? "ok" : "muted"}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={user.active ? "Active" : "Disabled"} tone={user.active ? "ok" : "warn"} />
                    </td>
                    <td className="px-4 py-3 text-muted">{formatLogin(user.lastLoginAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/sidhu/users/${user.id}/`} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold">
                          Edit
                        </Link>
                        {user.isPrimary ? null : (
                          <button
                            type="button"
                            className="rounded-md border border-line px-3 py-1.5 text-xs"
                            onClick={() => void toggleActive(user)}
                          >
                            {user.active ? "Disable" : "Enable"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-line md:hidden">
          {users.map((user) => {
            const isYou = session?.id === user.id;
            return (
              <article key={user.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{user.displayName}</p>
                  {user.isPrimary ? <StatusBadge label="Primary" tone="muted" /> : null}
                  {isYou ? <StatusBadge label="You" tone="ok" /> : null}
                </div>
                <p className="text-sm text-muted">{user.username}</p>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge label={ROLE_LABELS[user.role]} tone={user.role === "super_admin" ? "ok" : "muted"} />
                  <StatusBadge label={user.active ? "Active" : "Disabled"} tone={user.active ? "ok" : "warn"} />
                </div>
                <p className="text-xs text-muted">Last login: {formatLogin(user.lastLoginAt)}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link href={`/sidhu/users/${user.id}/`} className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold">
                    Edit
                  </Link>
                  {user.isPrimary ? null : (
                    <button
                      type="button"
                      className="rounded-md border border-line px-3 py-1.5 text-xs"
                      onClick={() => void toggleActive(user)}
                    >
                      {user.active ? "Disable" : "Enable"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
