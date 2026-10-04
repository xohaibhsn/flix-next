"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
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
import {
  DataTable,
  DataTableShell,
  ListCard,
  ListStack,
  TableHead,
  TableRow,
  TableScroll,
  TableSearch,
  TableToolbar,
  Td,
  Th,
} from "@/components/sidhu/ui/DataTable";
import { EmptyState } from "@/components/sidhu/ui/EmptyState";
import { ListActionButton, ListActionLink, ListActions } from "@/components/sidhu/ui/ListActions";
import { StatusBadge } from "@/components/sidhu/ui/StatusBadge";
import { Button } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

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

function CreateUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AdminRole>("full_access");
  const [state, action, pending] = useActionState(createUserAction, empty);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <SectionCard padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Add user</h2>
        <Button type="button" variant="primary" className="min-h-9" onClick={() => setOpen((value) => !value)}>
          {open ? "Close" : "Add user"}
        </Button>
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
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Create user"}
          </Button>
        </form>
      ) : null}
    </SectionCard>
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
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      `${user.displayName} ${user.username} ${ROLE_LABELS[user.role]}`.toLowerCase().includes(q),
    );
  }, [users, query]);

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

      <DataTableShell
        toolbar={
          <TableToolbar>
            <TableSearch
              id="users-search"
              label="Search users"
              placeholder="Search name, username, role…"
              value={query}
              onChange={setQuery}
            />
            <p className="text-xs text-muted">{filtered.length} shown</p>
          </TableToolbar>
        }
      >
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={users.length === 0 ? "No users yet" : "No matching users"}
              description={users.length === 0 ? "Create a Sidhu account to get started." : "Try a different search term."}
            />
          </div>
        ) : (
          <>
            <TableScroll className="hidden md:block">
              <DataTable>
                <TableHead>
                  <tr>
                    <Th>Display name</Th>
                    <Th>Username</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    <Th hideBelow="lg">Last login</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </TableHead>
                <tbody>
                  {filtered.map((user) => {
                    const isYou = session?.id === user.id;
                    return (
                      <TableRow key={user.id}>
                        <Td>
                          <p className="font-medium">{user.displayName}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {user.isPrimary ? <StatusBadge tone="neutral">Primary</StatusBadge> : null}
                            {isYou ? <StatusBadge tone="success">You</StatusBadge> : null}
                          </div>
                        </Td>
                        <Td>{user.username}</Td>
                        <Td>
                          <StatusBadge tone={user.role === "super_admin" ? "success" : "neutral"}>
                            {ROLE_LABELS[user.role]}
                          </StatusBadge>
                        </Td>
                        <Td>
                          <StatusBadge tone={user.active ? "success" : "warning"}>
                            {user.active ? "Active" : "Disabled"}
                          </StatusBadge>
                        </Td>
                        <Td hideBelow="lg" className="text-muted">
                          {formatLogin(user.lastLoginAt)}
                        </Td>
                        <Td>
                          <ListActions>
                            <ListActionLink href={`/sidhu/users/${user.id}/`}>Edit</ListActionLink>
                            {user.isPrimary ? null : (
                              <ListActionButton variant="secondary" onClick={() => void toggleActive(user)}>
                                {user.active ? "Disable" : "Enable"}
                              </ListActionButton>
                            )}
                          </ListActions>
                        </Td>
                      </TableRow>
                    );
                  })}
                </tbody>
              </DataTable>
            </TableScroll>

            <ListStack>
              {filtered.map((user) => {
                const isYou = session?.id === user.id;
                return (
                  <ListCard key={user.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{user.displayName}</p>
                      {user.isPrimary ? <StatusBadge tone="neutral">Primary</StatusBadge> : null}
                      {isYou ? <StatusBadge tone="success">You</StatusBadge> : null}
                    </div>
                    <p className="text-sm text-muted">{user.username}</p>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={user.role === "super_admin" ? "success" : "neutral"}>
                        {ROLE_LABELS[user.role]}
                      </StatusBadge>
                      <StatusBadge tone={user.active ? "success" : "warning"}>
                        {user.active ? "Active" : "Disabled"}
                      </StatusBadge>
                    </div>
                    <p className="text-xs text-muted">Last login: {formatLogin(user.lastLoginAt)}</p>
                    <ListActions>
                      <ListActionLink href={`/sidhu/users/${user.id}/`}>Edit</ListActionLink>
                      {user.isPrimary ? null : (
                        <ListActionButton variant="secondary" onClick={() => void toggleActive(user)}>
                          {user.active ? "Disable" : "Enable"}
                        </ListActionButton>
                      )}
                    </ListActions>
                  </ListCard>
                );
              })}
            </ListStack>
          </>
        )}
      </DataTableShell>
    </div>
  );
}
