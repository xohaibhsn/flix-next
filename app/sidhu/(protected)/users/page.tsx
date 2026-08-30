import { AdminShell } from "@/components/sidhu/AdminShell";
import { UsersManager } from "@/components/sidhu/UsersManager";
import { requirePermission } from "@/lib/auth/guards";
import { listAdminUsers } from "@/lib/auth/admin-users";
import { isDatabaseConfigured } from "@/lib/db/config";

export const dynamic = "force-dynamic";

export default async function SidhuUsersPage() {
  await requirePermission("users_security");
  if (!isDatabaseConfigured()) {
    return (
      <AdminShell title="Users" subtitle="MySQL is required for CMS user management.">
        <p className="rounded-xl border border-line bg-white p-5 text-sm text-muted">
          Connect the database to create additional Sidhu users.
        </p>
      </AdminShell>
    );
  }
  const users = await listAdminUsers();
  return (
    <AdminShell title="Users" subtitle="Super Admin can create users, set permissions, disable accounts, and reset passwords.">
      <UsersManager users={users} />
    </AdminShell>
  );
}
