import type { ReactNode } from "react";
import { requireAdminSession } from "@/lib/auth/guards";

export default async function ProtectedSidhuLayout({ children }: { children: ReactNode }) {
  await requireAdminSession();
  return children;
}
