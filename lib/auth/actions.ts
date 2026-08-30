"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  recordFailedLogin,
} from "@/lib/auth/rate-limit";
import { type AdminRole, firstAllowedPath, isAdminRole, parsePermissions } from "@/lib/auth/permissions";
import { hashPassword, passwordPolicyError, verifyPassword } from "@/lib/auth/password";
import { authenticateAdminCredentials } from "@/lib/auth/authenticate";
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUserById,
  listAdminUsers,
  markAdminLogin,
  updateAdminPassword,
  updateAdminUser,
  usernameError,
} from "@/lib/auth/admin-users";
import { requireAdminActor } from "@/lib/auth/guards";
import { clearAdminSession, createAdminSession, getAdminSession } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/config";

export type LoginState = {
  error?: string;
};

export type FormState = {
  ok?: boolean;
  error?: string;
};

const INVALID_LOGIN = "Invalid username or password.";
const NOT_CONFIGURED =
  "Admin login is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD, and a long ADMIN_SESSION_SECRET.";

function clientIp(headerStore: Headers) {
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headerStore.get("x-real-ip")?.trim() || "unknown";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const existing = await getAdminSession();
  if (existing) {
    redirect(firstAllowedPath(existing.role, existing.permissions));
  }

  const headerStore = await headers();
  const ip = clientIp(headerStore);
  const limit = await checkLoginRateLimit(ip);
  if (!limit.ok) {
    return { error: "Too many login attempts. Please try again later." };
  }

  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const result = await authenticateAdminCredentials(username, password);
  if (!result.ok) {
    if (result.error === "not_configured") return { error: NOT_CONFIGURED };
    if (result.error === "unavailable") {
      return { error: "Admin login is temporarily unavailable. Try again shortly." };
    }
    await recordFailedLogin(ip);
    return { error: INVALID_LOGIN };
  }

  await clearLoginRateLimit(ip);
  if (isDatabaseConfigured() && result.id !== "env-admin") {
    await markAdminLogin(result.id);
  }
  await createAdminSession({
    id: result.id,
    username: result.username,
    sessionVersion: result.sessionVersion,
  });
  redirect(firstAllowedPath(result.role, result.permissions));
}

export async function logoutAction() {
  await clearAdminSession();
  redirect("/sidhu/login/");
}

export async function changeOwnPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminActor();
  if (!actor.ok) return { error: actor.error };
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const nextPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (nextPassword !== confirmPassword) return { error: "New password and confirmation do not match." };
  const policy = passwordPolicyError(nextPassword);
  if (policy) return { error: policy };

  if (!isDatabaseConfigured()) {
    return { error: "Password changes require the MySQL admin user store." };
  }
  const user = await getAdminUserById(actor.user.id);
  if (!user) return { error: "Account not found." };
  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) return { error: "Current password is incorrect." };
  try {
    await updateAdminPassword(user.id, await hashPassword(nextPassword));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update password." };
  }
  await clearAdminSession();
  redirect("/sidhu/login/?updated=1");
}

export async function listUsersAction() {
  const actor = await requireAdminActor("users_security");
  if (!actor.ok) return actor;
  if (!isDatabaseConfigured()) return { ok: false as const, error: "User management requires MySQL." };
  return { ok: true as const, users: await listAdminUsers() };
}

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminActor("users_security");
  if (!actor.ok) return { error: actor.error };
  if (!isDatabaseConfigured()) return { error: "User management requires MySQL." };
  const username = String(formData.get("username") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const roleRaw = String(formData.get("role") ?? "custom");
  if (password !== confirm) return { error: "Password and confirmation do not match." };
  const nameError = usernameError(username);
  if (nameError) return { error: nameError };
  const policy = passwordPolicyError(password);
  if (policy) return { error: policy };
  if (!isAdminRole(roleRaw)) return { error: "Choose a valid role." };
  if (roleRaw === "super_admin" && actor.user.role !== "super_admin") {
    return { error: "Only Super Admin can create another Super Admin." };
  }
  const permissions = parsePermissions(formData.getAll("permissions").map(String));
  try {
    await createAdminUser({
      username,
      displayName,
      passwordHash: await hashPassword(password),
      role: roleRaw as AdminRole,
      permissions,
      createdBy: actor.user.id,
    });
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create user." };
  }
}

export async function updateUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminActor("users_security");
  if (!actor.ok) return { error: actor.error };
  if (!isDatabaseConfigured()) return { error: "User management requires MySQL." };
  const id = String(formData.get("id") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const roleRaw = String(formData.get("role") ?? "custom");
  if (isAdminRole(roleRaw) === false) return { error: "Choose a valid role." };
  if (roleRaw === "super_admin" && actor.user.role !== "super_admin") {
    return { error: "Only Super Admin can assign Super Admin." };
  }
  const permissions = parsePermissions(formData.getAll("permissions").map(String));
  try {
    await updateAdminUser(id, { displayName, role: roleRaw as AdminRole, permissions });
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update user." };
  }
}

export async function setUserActiveAction(id: string, active: boolean): Promise<FormState> {
  const actor = await requireAdminActor("users_security");
  if (!actor.ok) return { error: actor.error };
  if (actor.user.id === id && !active) return { error: "You cannot disable your own account." };
  try {
    await updateAdminUser(id, { active });
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update user." };
  }
}

export async function deleteUserAction(id: string): Promise<FormState> {
  const actor = await requireAdminActor("users_security");
  if (!actor.ok) return { error: actor.error };
  if (actor.user.role !== "super_admin") return { error: "Only Super Admin can delete users." };
  try {
    await deleteAdminUser(id, actor.user.id);
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not delete user." };
  }
}

export async function resetUserPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdminActor("users_security");
  if (!actor.ok) return { error: actor.error };
  if (!isDatabaseConfigured()) return { error: "User management requires MySQL." };
  const id = String(formData.get("id") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (!id) return { error: "User not found." };
  if (actor.user.id === id) {
    return { error: "Use My Account to change your own password." };
  }
  if (String(formData.get("confirmReset") ?? "") !== "1") {
    return { error: "Confirm that you want to reset this password." };
  }
  if (password !== confirm) return { error: "Password and confirmation do not match." };
  const policy = passwordPolicyError(password);
  if (policy) return { error: policy };
  const target = await getAdminUserById(id);
  if (!target) return { error: "User not found." };
  if (target.role === "super_admin" && actor.user.role !== "super_admin") {
    return { error: "You cannot reset a Super Admin password." };
  }
  try {
    await updateAdminPassword(id, await hashPassword(password));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not reset password." };
  }
  return { ok: true };
}
