import { cookies } from "next/headers";
import { getAdminAuthConfig, isProduction } from "@/lib/auth/config";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
  type AdminSession,
} from "@/lib/auth/session-token";

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function createAdminSession(username: string) {
  const config = getAdminAuthConfig();
  if (!config) {
    throw new Error("Admin authentication is not configured.");
  }
  const token = createSessionToken(username, config.sessionSecret);
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
