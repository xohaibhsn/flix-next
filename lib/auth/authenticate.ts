import { getAdminAuthConfig, getSessionSecret } from "@/lib/auth/config";
import { safeEqual } from "@/lib/auth/crypto";
import { envPasswordMayAuthenticate } from "@/lib/auth/bootstrap-policy";
import { verifyPassword, verifyPasswordDummy } from "@/lib/auth/password";
import {
  type AdminUserRecord,
  bootstrapAdminUsersIfNeeded,
  countAdminUsers,
  getAdminUserByUsername,
} from "@/lib/auth/admin-users";
import { isDatabaseConfigured } from "@/lib/db/config";

export type AdminAuthSuccess = {
  ok: true;
  id: string;
  username: string;
  role: AdminUserRecord["role"];
  permissions: AdminUserRecord["permissions"];
  sessionVersion: number;
};

export type AdminAuthFailure = {
  ok: false;
  error: "invalid" | "disabled" | "not_configured" | "unavailable";
};

export async function authenticateAdminCredentials(
  username: string,
  password: string,
): Promise<AdminAuthSuccess | AdminAuthFailure> {
  if (!getSessionSecret()) {
    return { ok: false, error: "not_configured" };
  }

  if (isDatabaseConfigured()) {
    try {
      await bootstrapAdminUsersIfNeeded();
      const user = await getAdminUserByUsername(username);
      if (!user) {
        await verifyPasswordDummy(password);
        return { ok: false, error: "invalid" };
      }
      const passwordOk = await verifyPassword(password, user.passwordHash);
      if (!user.active || !passwordOk) {
        return { ok: false, error: user.active ? "invalid" : "disabled" };
      }
      return {
        ok: true,
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        sessionVersion: user.sessionVersion,
      };
    } catch {
      return { ok: false, error: "unavailable" };
    }
  }

  const count = 0;
  if (!envPasswordMayAuthenticate({ databaseConfigured: false, adminUserCount: count })) {
    return { ok: false, error: "invalid" };
  }

  const config = getAdminAuthConfig();
  if (!config) {
    return { ok: false, error: "not_configured" };
  }
  const usernameOk = safeEqual(username.toLowerCase(), config.username);
  const passwordOk = safeEqual(password, config.password);
  if (!usernameOk || !passwordOk) {
    return { ok: false, error: "invalid" };
  }
  return {
    ok: true,
    id: "env-admin",
    username: config.username,
    role: "super_admin",
    permissions: [],
    sessionVersion: 1,
  };
}

export async function databaseHasAdminUsers() {
  if (!isDatabaseConfigured()) return false;
  try {
    return (await countAdminUsers()) > 0;
  } catch {
    return false;
  }
}
