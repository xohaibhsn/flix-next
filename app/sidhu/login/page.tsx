import { redirect } from "next/navigation";
import { LoginForm } from "@/components/sidhu/LoginForm";
import { getAdminSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SidhuLoginPage() {
  const session = await getAdminSession();
  if (session) {
    redirect("/sidhu/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f4f7] px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.2em] text-brand uppercase">Sidhu</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">Sign in to CMS</h1>
        <p className="mt-2 text-sm text-muted">
          This admin area is protected. Use the Hostinger environment credentials.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
