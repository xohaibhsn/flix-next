import { notFound } from "next/navigation";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { UserEditForm } from "@/components/sidhu/UserEditForm";
import { getAdminUserById, toPublicAdminUser } from "@/lib/auth/admin-users";
import { requirePermission } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";

export const dynamic = "force-dynamic";

export default async function SidhuEditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("users_security");
  const { id } = await params;
  if (!isDatabaseConfigured()) {
    return (
      <AdminShell title="Edit user" subtitle="MySQL is required for CMS user management.">
        <p className="rounded-xl border border-line bg-white p-5 text-sm text-muted">
          Connect the database to manage Sidhu users.
        </p>
      </AdminShell>
    );
  }
  const user = await getAdminUserById(id);
  if (!user) notFound();
  return (
    <AdminShell title="Edit user" subtitle="Change role, permissions, and passwords for this Sidhu account.">
      <UserEditForm user={toPublicAdminUser(user)} isCurrentUser={actor.id === user.id} />
    </AdminShell>
  );
}
