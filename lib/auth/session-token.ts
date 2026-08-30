import { getSessionSecret } from "@/lib/auth/config";
import { hmacSha256, safeEqual } from "@/lib/auth/crypto";

export const ADMIN_SESSION_COOKIE = "sidhu_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type AdminSession = {
  id: string;
  username: string;
  sessionVersion: number;
  expiresAt: number;
};

type SessionPayload = {
  i?: string;
  u: string;
  v?: number;
  exp: number;
};

export function createSessionToken(
  input: { id: string; username: string; sessionVersion: number },
  secret: string,
  now = Date.now(),
) {
  const payload: SessionPayload = {
    i: input.id,
    u: input.username,
    v: input.sessionVersion,
    exp: now + ADMIN_SESSION_MAX_AGE_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${hmacSha256(secret, encoded)}`;
}

export function verifySessionToken(token: string | undefined | null): AdminSession | null {
  if (!token) return null;
  const secret = getSessionSecret();
  if (!secret) return null;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const encoded = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = hmacSha256(secret, encoded);
  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload?.u || typeof payload.exp !== "number") return null;
    if (payload.exp <= Date.now()) return null;
    return {
      id: typeof payload.i === "string" ? payload.i : "",
      username: payload.u,
      sessionVersion: typeof payload.v === "number" ? payload.v : 0,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}
