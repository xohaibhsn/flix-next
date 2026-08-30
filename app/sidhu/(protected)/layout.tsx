import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminSessionProvider } from "@/components/sidhu/AdminSessionProvider";
import { requireAdminSession } from "@/lib/auth/guards";
import { firstAllowedPath, hasPermission, permissionForSidhuPath } from "@/lib/auth/permissions";

export default async function ProtectedSidhuLayout({ children }: { children: ReactNode }) {
  const user = await requireAdminSession();
  const path = (await headers()).get("x-sidhu-path") || "";
  const needed = permissionForSidhuPath(path);
  if (needed && !hasPermission(user.role, user.permissions, needed)) {
    if (needed === "dashboard") {
      redirect(firstAllowedPath(user.role, user.permissions));
    }
    redirect("/sidhu/access-denied/");
  }

  return (
    <AdminSessionProvider
      user={{
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        permissions: user.effectivePermissions,
      }}
    >
      {children}
    </AdminSessionProvider>
  );
}
