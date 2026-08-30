"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AdminRole, Permission } from "@/lib/auth/permissions";

export type AdminClientUser = {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  permissions: Permission[];
};

const AdminSessionContext = createContext<AdminClientUser | null>(null);

export function AdminSessionProvider({
  user,
  children,
}: {
  user: AdminClientUser;
  children: ReactNode;
}) {
  return <AdminSessionContext.Provider value={user}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  return useContext(AdminSessionContext);
}
