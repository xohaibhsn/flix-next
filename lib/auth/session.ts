import { cookies } from "next/headers";
import { getAdminAuthConfig, getSessionSecret, isProduction } from "@/lib/auth/config";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  getAdminUserById,
  getAdminUserByUsername,
  toPublicAdminUser,
} from "@/lib/auth/admin-users";
import type { PublicAdminUser } from "@/lib/auth/types";
import { type Permission, permissionsForRole } from "@/lib/auth/permissions";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "@/lib/auth/session-token";

export type CurrentAdmin = PublicAdminUser & { expiresAt: number };

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}

function envAdmin(): CurrentAdmin | null {
  const config = getAdminAuthConfig();
  if (!config) return null;
  return {
    id: "env-admin",
    username: config.username,
    displayName: "Administrator",
    role: "super_admin",
    permissions: [],
    active: true,
    sessionVersion: 1,
    createdAt: "",
    updatedAt: "",
    lastLoginAt: null,
    createdBy: null,
    isPrimary: true,
    effectivePermissions: permissionsForRole("super_admin"),
    expiresAt: Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000,
  };
}

export async function resolveAdminFromToken(token: string | undefined | null): Promise<CurrentAdmin | null> {
  const parsed = verifySessionToken(token);
  if (!parsed) return null;

  if (isDatabaseConfigured()) {
    try {
      const user = parsed.id ? await getAdminUserById(parsed.id) : await getAdminUserByUsername(parsed.username);
      if (!user || !user.active) return null;
      if (user.sessionVersion !== parsed.sessionVersion) return null;
      if (user.username !== parsed.username) return null;
      return { ...toPublicAdminUser(user), expiresAt: parsed.expiresAt };
    } catch {
      return null;
    }
  }

  const fallback = envAdmin();
  if (!fallback) return null;
  if (parsed.username !== fallback.username) return null;
  return { ...fallback, expiresAt: parsed.expiresAt };
}

export async function getAdminSession(): Promise<CurrentAdmin | null> {
  const store = await cookies();
  return resolveAdminFromToken(store.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function createAdminSession(user: { id: string; username: string; sessionVersion: number }) {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("Admin authentication is not configured.");
  }
  const token = createSessionToken(user, secret);
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, cookieOptions());
}

export async function clearAdminSession() {
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, "", {
    ...cookieOptions(),
    maxAge: 0,
  });
}

export function adminHasPermission(user: Pick<PublicAdminUser, "role" | "permissions">, permission: Permission) {
  return user.role === "super_admin" || permissionsForRole(user.role, user.permissions).includes(permission);
}
