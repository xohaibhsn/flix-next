import { redirect } from "next/navigation";
import { LoginForm } from "@/components/sidhu/LoginForm";
import { firstAllowedPath } from "@/lib/auth/permissions";
import { getAdminSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SidhuLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string }>;
}) {
  const session = await getAdminSession();
  if (session) {
    redirect(firstAllowedPath(session.role, session.permissions));
  }
  const query = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f4f7] px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.2em] text-brand uppercase">Sidhu</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">Sign in to CMS</h1>
        <p className="mt-2 text-sm text-muted">This admin area is protected. Sign in with your Sidhu account.</p>
        {query.updated === "1" ? (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Password changed. Please sign in again.
          </p>
        ) : null}
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
