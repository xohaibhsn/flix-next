import "server-only";

import type { RowDataPacket } from "mysql2/promise";
import {
  getBootstrapCredentials,
  getPrimaryAdminUsername,
  isEmergencyPasswordResetEnabled,
  isEmergencyRecoveryEnabled,
} from "@/lib/auth/config";
import {
  type AdminRole,
  type Permission,
  isAdminRole,
  parsePermissions,
  permissionsForRole,
} from "@/lib/auth/permissions";
import { hashPassword } from "@/lib/auth/password";
import { createId } from "@/lib/cms/ids";
import { fromMysqlDateTime } from "@/lib/cms/mysql-migrate";
import { envPasswordBootstrapAction } from "@/lib/auth/bootstrap-policy";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getDbPool } from "@/lib/db/pool";
import type { PublicAdminUser } from "@/lib/auth/types";
import type { ResultSetHeader } from "mysql2/promise";

export type AdminUserRecord = {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: AdminRole;
  permissions: Permission[];
  active: boolean;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  createdBy: string | null;
};

export type { PublicAdminUser };

type UserRow = RowDataPacket & {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: string;
  permissions: unknown;
  is_active: number;
  session_version: number;
  created_at: unknown;
  updated_at: unknown;
  last_login_at: unknown;
  created_by: string | null;
};

function parseJson(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return [];
  }
}

function mapUser(row: UserRow): AdminUserRecord {
  const role = isAdminRole(row.role) ? row.role : "custom";
  return {
    id: String(row.id),
    username: String(row.username).toLowerCase(),
    displayName: String(row.display_name || row.username),
    passwordHash: String(row.password_hash),
    role,
    permissions: parsePermissions(parseJson(row.permissions)),
    active: Boolean(row.is_active),
    sessionVersion: Number(row.session_version) || 1,
    createdAt: fromMysqlDateTime(row.created_at),
    updatedAt: fromMysqlDateTime(row.updated_at),
    lastLoginAt: row.last_login_at ? fromMysqlDateTime(row.last_login_at) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
  };
}

export function toPublicAdminUser(user: AdminUserRecord): PublicAdminUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    permissions: user.permissions,
    active: user.active,
    sessionVersion: user.sessionVersion,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt,
    createdBy: user.createdBy,
    isPrimary: user.username === getPrimaryAdminUsername(),
    effectivePermissions: permissionsForRole(user.role, user.permissions),
  };
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function usernameError(value: string) {
  const username = normalizeUsername(value);
  if (username.length < 3 || username.length > 40) return "Username must be 3–40 characters.";
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
    return "Username can use letters, numbers, dots, underscores, and hyphens.";
  }
  return null;
}

export async function countAdminUsers() {
  const [rows] = await getDbPool().query<Array<RowDataPacket & { n: number }>>(
    "SELECT COUNT(*) AS n FROM admin_users",
  );
  return Number(rows[0]?.n ?? 0);
}

export async function listAdminUsers() {
  const [rows] = await getDbPool().query<UserRow[]>(
    `SELECT id, username, display_name, password_hash, role, permissions, is_active, session_version,
            created_at, updated_at, last_login_at, created_by
     FROM admin_users
     ORDER BY username ASC`,
  );
  return rows.map((row) => toPublicAdminUser(mapUser(row)));
}

export async function getAdminUserById(id: string) {
  const [rows] = await getDbPool().query<UserRow[]>(
    `SELECT id, username, display_name, password_hash, role, permissions, is_active, session_version,
            created_at, updated_at, last_login_at, created_by
     FROM admin_users WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function getAdminUserByUsername(username: string) {
  const [rows] = await getDbPool().query<UserRow[]>(
    `SELECT id, username, display_name, password_hash, role, permissions, is_active, session_version,
            created_at, updated_at, last_login_at, created_by
     FROM admin_users WHERE username = ? LIMIT 1`,
    [normalizeUsername(username)],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

async function countActiveSuperAdmins(excludeId?: string) {
  const [rows] = await getDbPool().query<Array<RowDataPacket & { n: number }>>(
    excludeId
      ? "SELECT COUNT(*) AS n FROM admin_users WHERE role = 'super_admin' AND is_active = 1 AND id <> ?"
      : "SELECT COUNT(*) AS n FROM admin_users WHERE role = 'super_admin' AND is_active = 1",
    excludeId ? [excludeId] : [],
  );
  return Number(rows[0]?.n ?? 0);
}

async function insertAdminUser(user: {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  role: AdminRole;
  permissions: Permission[];
  createdBy: string | null;
}) {
  await getDbPool().execute(
    `INSERT INTO admin_users
      (id, username, display_name, password_hash, role, permissions, is_active, session_version, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`,
    [
      user.id,
      normalizeUsername(user.username),
      user.displayName,
      user.passwordHash,
      user.role,
      JSON.stringify(user.role === "custom" ? user.permissions : []),
      user.createdBy,
    ],
  );
}

const EMERGENCY_RESET_SETTING_KEY = "sidhu_emergency_password_reset";

async function emergencyPasswordResetAlreadyApplied() {
  const [rows] = await getDbPool().query<Array<RowDataPacket & { setting_value: string }>>(
    "SELECT setting_value FROM site_settings WHERE setting_key = ? LIMIT 1",
    [EMERGENCY_RESET_SETTING_KEY],
  );
  return Boolean(rows[0]);
}

async function insertPrimaryAdminFromEnv(password: string) {
  const username = getPrimaryAdminUsername();
  if (await getAdminUserByUsername(username)) return;
  try {
    await insertAdminUser({
      id: createId("adm"),
      username,
      displayName: "Administrator",
      passwordHash: await hashPassword(password),
      role: "super_admin",
      permissions: [],
      createdBy: null,
    });
  } catch (error) {
    if (await getAdminUserByUsername(username)) return;
    throw error;
  }
}

async function restorePrimaryAdminFromEnv(password: string) {
  const username = getPrimaryAdminUsername();
  const existing = await getAdminUserByUsername(username);
  const passwordHash = await hashPassword(password);
  if (existing) {
    const [result] = await getDbPool().execute<ResultSetHeader>(
      `UPDATE admin_users
       SET role = 'super_admin', is_active = 1, password_hash = ?, session_version = session_version + 1
       WHERE id = ?`,
      [passwordHash, existing.id],
    );
    if (!result.affectedRows) throw new Error("Emergency recovery did not update the primary admin.");
    return;
  }
  await insertPrimaryAdminFromEnv(password);
}

export async function bootstrapAdminUsersIfNeeded(options?: { allowEmergency?: boolean }) {
  if (!isDatabaseConfigured()) return;
  const { ensureCmsSchema } = await import("@/lib/cms/mysql-migrate");
  await ensureCmsSchema();
  const bootstrap = getBootstrapCredentials();
  if (!bootstrap) return;

  const total = await countAdminUsers();
  const action = envPasswordBootstrapAction({
    userCount: total,
    allowEmergency: Boolean(options?.allowEmergency),
    emergencyRecovery: isEmergencyRecoveryEnabled(),
    activeSuperAdmins: total === 0 ? 0 : await countActiveSuperAdmins(),
    emergencyReset: isEmergencyPasswordResetEnabled(),
    emergencyResetAlreadyApplied: total === 0 ? false : await emergencyPasswordResetAlreadyApplied(),
  });

  if (action === "insert") {
    await insertPrimaryAdminFromEnv(bootstrap.password);
    return;
  }
  if (action === "emergency-restore") {
    console.warn("[sidhu] emergency recovery restored the primary Super Admin. Unset ADMIN_EMERGENCY_RECOVERY.");
    await restorePrimaryAdminFromEnv(bootstrap.password);
    return;
  }
  if (action === "emergency-reset") {
    const primary = await getAdminUserByUsername(getPrimaryAdminUsername());
    if (!primary) return;
    console.warn("[sidhu] emergency password reset applied to the primary Super Admin. Unset ADMIN_EMERGENCY_RESET_PASSWORD immediately.");
    const passwordHash = await hashPassword(bootstrap.password);
    const conn = await getDbPool().getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.execute<ResultSetHeader>(
        "UPDATE admin_users SET password_hash = ?, is_active = 1, session_version = session_version + 1 WHERE id = ?",
        [passwordHash, primary.id],
      );
      if (!result.affectedRows) {
        throw new Error("Emergency password reset did not update a user row.");
      }
      await conn.execute(
        `INSERT INTO site_settings (setting_key, setting_value)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
        [EMERGENCY_RESET_SETTING_KEY, JSON.stringify({ appliedAt: new Date().toISOString() })],
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}

export async function markAdminLogin(id: string) {
  await getDbPool().execute("UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
}

export async function bumpAdminSessionVersion(id: string) {
  await getDbPool().execute(
    "UPDATE admin_users SET session_version = session_version + 1 WHERE id = ?",
    [id],
  );
}

export async function updateAdminPassword(id: string, passwordHash: string) {
  const [result] = await getDbPool().execute<ResultSetHeader>(
    "UPDATE admin_users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?",
    [passwordHash, id],
  );
  if (!result.affectedRows) {
    throw new Error("Password was not updated.");
  }
  const updated = await getAdminUserById(id);
  if (!updated || updated.passwordHash !== passwordHash) {
    throw new Error("Password was not saved.");
  }
}

export async function createAdminUser(input: {
  username: string;
  displayName: string;
  passwordHash: string;
  role: AdminRole;
  permissions: Permission[];
  createdBy: string;
}) {
  const usernameErrorText = usernameError(input.username);
  if (usernameErrorText) throw new Error(usernameErrorText);
  const username = normalizeUsername(input.username);
  if (await getAdminUserByUsername(username)) throw new Error("That username is already in use.");
  const role = input.role === "super_admin" ? "super_admin" : input.role === "full_access" ? "full_access" : "custom";
  const permissions = role === "custom" ? parsePermissions(input.permissions).filter((item) => item !== "users_security") : [];
  const id = createId("adm");
  await insertAdminUser({
    id,
    username,
    displayName: input.displayName.trim().slice(0, 80) || username,
    passwordHash: input.passwordHash,
    role,
    permissions,
    createdBy: input.createdBy,
  });
  const created = await getAdminUserById(id);
  if (!created) throw new Error("Could not create user.");
  return toPublicAdminUser(created);
}

export async function updateAdminUser(
  id: string,
  patch: {
    displayName?: string;
    role?: AdminRole;
    permissions?: Permission[];
    active?: boolean;
  },
) {
  const current = await getAdminUserById(id);
  if (!current) throw new Error("User not found.");
  const primary = current.username === getPrimaryAdminUsername();
  const nextRole = patch.role ?? current.role;
  const nextActive = patch.active ?? current.active;
  if (primary && nextRole !== "super_admin") throw new Error("The primary admin must remain Super Admin.");
  if (primary && nextActive === false) throw new Error("The primary admin cannot be disabled.");
  if ((current.role === "super_admin" && current.active) && (nextRole !== "super_admin" || nextActive === false)) {
    if ((await countActiveSuperAdmins(current.id)) < 1) {
      throw new Error("At least one active Super Admin is required.");
    }
  }
  const permissions =
    nextRole === "custom"
      ? parsePermissions(patch.permissions ?? current.permissions).filter((item) => item !== "users_security")
      : [];
  await getDbPool().execute(
    `UPDATE admin_users
     SET display_name = ?, role = ?, permissions = ?, is_active = ?
     WHERE id = ?`,
    [
      (patch.displayName ?? current.displayName).trim().slice(0, 80) || current.username,
      nextRole,
      JSON.stringify(permissions),
      nextActive ? 1 : 0,
      id,
    ],
  );
  if (nextActive === false || nextRole !== current.role) {
    await bumpAdminSessionVersion(id);
  }
  const updated = await getAdminUserById(id);
  if (!updated) throw new Error("User not found.");
  return toPublicAdminUser(updated);
}

export async function deleteAdminUser(id: string, actorId: string) {
  const current = await getAdminUserById(id);
  if (!current) throw new Error("User not found.");
  if (current.id === actorId) throw new Error("You cannot delete your own account while signed in.");
  if (current.username === getPrimaryAdminUsername()) throw new Error("The primary admin cannot be deleted.");
  if (current.role === "super_admin" && current.active && (await countActiveSuperAdmins(id)) < 1) {
    throw new Error("At least one active Super Admin is required.");
  }
  await getDbPool().execute("DELETE FROM admin_users WHERE id = ?", [id]);
}
