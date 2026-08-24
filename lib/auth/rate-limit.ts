import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { isDatabaseConfigured } from "@/lib/db/config";

type AttemptState = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, AttemptState>();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

function hashIp(ip: string) {
  return createHash("sha256").update(`flix-login:${ip}`).digest("hex");
}

function memoryCheck(store: Map<string, AttemptState>, key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 0, resetAt: now + windowMs });
    return { ok: true };
  }
  if (current.count >= max) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  return { ok: true };
}

function memoryFail(store: Map<string, AttemptState>, key: string, windowMs: number) {
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
}

async function mysqlLoginCheck(ip: string): Promise<RateLimitResult> {
  const { getDbPool } = await import("@/lib/db/pool");
  const hash = hashIp(ip);
  const [rows] = await getDbPool().query<Array<RowDataPacket & { fail_count: number; reset_at: number | string }>>(
    "SELECT fail_count, reset_at FROM login_attempts WHERE ip_hash = ? LIMIT 1",
    [hash],
  );
  const row = rows[0];
  if (!row) return { ok: true };
  const resetAt = Number(row.reset_at);
  const now = Date.now();
  if (!Number.isFinite(resetAt) || resetAt <= now) return { ok: true };
  if (Number(row.fail_count) >= MAX_ATTEMPTS) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)) };
  }
  return { ok: true };
}

async function mysqlLoginFail(ip: string) {
  const { getDbPool } = await import("@/lib/db/pool");
  const hash = hashIp(ip);
  const now = Date.now();
  const [rows] = await getDbPool().query<Array<RowDataPacket & { fail_count: number; reset_at: number | string }>>(
    "SELECT fail_count, reset_at FROM login_attempts WHERE ip_hash = ? LIMIT 1",
    [hash],
  );
  const row = rows[0];
  const resetAt = Number(row?.reset_at);
  const inWindow = row && Number.isFinite(resetAt) && resetAt > now;
  const nextCount = inWindow ? Number(row.fail_count) + 1 : 1;
  const nextReset = inWindow ? resetAt : now + WINDOW_MS;
  await getDbPool().execute(
    `INSERT INTO login_attempts (ip_hash, fail_count, reset_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE fail_count = VALUES(fail_count), reset_at = VALUES(reset_at)`,
    [hash, nextCount, nextReset],
  );
}

async function mysqlLoginClear(ip: string) {
  const { getDbPool } = await import("@/lib/db/pool");
  await getDbPool().execute("DELETE FROM login_attempts WHERE ip_hash = ?", [hashIp(ip)]);
}

export async function checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
  if (isDatabaseConfigured()) {
    try {
      return await mysqlLoginCheck(ip);
    } catch {
      return memoryCheck(attempts, ip, MAX_ATTEMPTS, WINDOW_MS);
    }
  }
  return memoryCheck(attempts, ip, MAX_ATTEMPTS, WINDOW_MS);
}

export async function recordFailedLogin(ip: string) {
  if (isDatabaseConfigured()) {
    try {
      await mysqlLoginFail(ip);
      return;
    } catch {
      memoryFail(attempts, ip, WINDOW_MS);
      return;
    }
  }
  memoryFail(attempts, ip, WINDOW_MS);
}

export async function clearLoginRateLimit(ip: string) {
  attempts.delete(ip);
  if (isDatabaseConfigured()) {
    try {
      await mysqlLoginClear(ip);
    } catch {
      /* keep going */
    }
  }
}

const CONTACT_WINDOW_MS = 15 * 60 * 1000;
const CONTACT_MAX = 5;
const contactAttempts = new Map<string, AttemptState>();

export function checkContactRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const current = contactAttempts.get(ip);
  if (!current || current.resetAt <= now) {
    contactAttempts.set(ip, { count: 1, resetAt: now + CONTACT_WINDOW_MS });
    return { ok: true };
  }
  if (current.count >= CONTACT_MAX) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { ok: true };
}
