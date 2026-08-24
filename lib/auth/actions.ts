"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminAuthConfig } from "@/lib/auth/config";
import { safeEqual } from "@/lib/auth/crypto";
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  recordFailedLogin,
} from "@/lib/auth/rate-limit";
import { clearAdminSession, createAdminSession, getAdminSession } from "@/lib/auth/session";

export type LoginState = {
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
    redirect("/sidhu/");
  }

  const headerStore = await headers();
  const ip = clientIp(headerStore);
  const limit = await checkLoginRateLimit(ip);
  if (!limit.ok) {
    return { error: "Too many login attempts. Please try again later." };
  }

  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const config = getAdminAuthConfig();

  if (!config) {
    return { error: NOT_CONFIGURED };
  }

  const usernameOk = safeEqual(username, config.username);
  const passwordOk = safeEqual(password, config.password);
  if (!usernameOk || !passwordOk) {
    await recordFailedLogin(ip);
    return { error: INVALID_LOGIN };
  }

  await clearLoginRateLimit(ip);
  await createAdminSession(config.username);
  redirect("/sidhu/");
}

export async function logoutAction() {
  await clearAdminSession();
  redirect("/sidhu/login/");
}
