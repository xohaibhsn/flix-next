import { AdminShell } from "@/components/sidhu/AdminShell";
import { AccountForm } from "@/components/sidhu/AccountForm";
import { requireAdminSession } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function SidhuAccountPage() {
  await requireAdminSession();
  return (
    <AdminShell title="My Account" subtitle="Change your Sidhu password. Strong passwords are required.">
      <AccountForm />
    </AdminShell>
  );
}
