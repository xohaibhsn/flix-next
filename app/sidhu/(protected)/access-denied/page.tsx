import Link from "next/link";
import { AdminShell } from "@/components/sidhu/AdminShell";
import { requireAdminSession } from "@/lib/auth/guards";
import { firstAllowedPath } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export default async function SidhuAccessDeniedPage() {
  const user = await requireAdminSession();
  return (
    <AdminShell title="Access denied" subtitle="This account does not have permission for that module.">
      <div className="rounded-xl border border-line bg-white p-6">
        <p className="text-sm text-muted">Ask a Super Admin if you need access.</p>
        <Link href={firstAllowedPath(user.role, user.permissions)} className="mt-4 inline-block text-sm font-semibold text-brand">
          Back to Sidhu
        </Link>
      </div>
    </AdminShell>
  );
}
