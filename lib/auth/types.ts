import type { AdminRole, Permission } from "@/lib/auth/permissions";

export type PublicAdminUser = {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  permissions: Permission[];
  active: boolean;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  createdBy: string | null;
  isPrimary: boolean;
  effectivePermissions: Permission[];
};
