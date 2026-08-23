import { getAdminAuthConfig } from "@/lib/auth/config";
import { hmacSha256, safeEqual } from "@/lib/auth/crypto";

export const ADMIN_SESSION_COOKIE = "sidhu_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type AdminSession = {
  username: string;
  expiresAt: number;
};

type SessionPayload = {
  u: string;
  exp: number;
};

export function createSessionToken(username: string, secret: string, now = Date.now()) {
  const payload: SessionPayload = {
    u: username,
    exp: now + ADMIN_SESSION_MAX_AGE_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${hmacSha256(secret, encoded)}`;
}

export function verifySessionToken(token: string | undefined | null): AdminSession | null {
  if (!token) return null;
  const config = getAdminAuthConfig();
  if (!config) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = hmacSha256(config.sessionSecret, encoded);
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload?.u || typeof payload.exp !== "number") return null;
    if (payload.exp <= Date.now()) return null;
    if (!safeEqual(payload.u, config.username)) return null;
    return { username: payload.u, expiresAt: payload.exp };
  } catch {
    return null;
  }
}
