import { AdminShell } from "@/components/sidhu/AdminShell";
import { UsersManager } from "@/components/sidhu/UsersManager";
import { EmptyState } from "@/components/sidhu/ui/EmptyState";
import { requirePermission } from "@/lib/auth/guards";
import { listAdminUsers } from "@/lib/auth/admin-users";
import { isDatabaseConfigured } from "@/lib/db/config";

export const dynamic = "force-dynamic";

export default async function SidhuUsersPage() {
  await requirePermission("users_security");
  if (!isDatabaseConfigured()) {
    return (
      <AdminShell
        title="Users"
        subtitle="MySQL is required for CMS user management."
        breadcrumbs={[{ label: "Operations" }, { label: "Users" }]}
      >
        <EmptyState
          title="Database not connected"
          description="Connect the database to create additional Sidhu users."
        />
      </AdminShell>
    );
  }
  const users = await listAdminUsers();
  return (
    <AdminShell
      title="Users"
      subtitle="Sidhu accounts, roles, and access status."
      breadcrumbs={[{ label: "Operations" }, { label: "Users" }]}
    >
      <UsersManager users={users} />
    </AdminShell>
  );
}
