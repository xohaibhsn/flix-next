import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { Permission } from "@/lib/auth/permissions";
import { adminHasPermission, getAdminSession, type CurrentAdmin } from "@/lib/auth/session";

export async function requireAdminSession(): Promise<CurrentAdmin> {
  const session = await getAdminSession();
  if (!session) {
    redirect("/sidhu/login/");
  }
  return session;
}

export async function requirePermission(permission: Permission): Promise<CurrentAdmin> {
  const session = await requireAdminSession();
  if (!adminHasPermission(session, permission)) {
    redirect("/sidhu/access-denied/");
  }
  return session;
}

export async function requireAdminApi(permission?: Permission | Permission[]) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (permission) {
    const needed = Array.isArray(permission) ? permission : [permission];
    if (!needed.some((item) => adminHasPermission(session, item))) {
      return NextResponse.json({ ok: false, error: "Access denied." }, { status: 403 });
    }
  }
  return null;
}

export async function requireAdminAction(permission?: Permission) {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false as const, error: "Unauthorized" };
  }
  if (permission && !adminHasPermission(session, permission)) {
    return { ok: false as const, error: "Access denied." };
  }
  return null;
}

export async function requireAdminActor(permission?: Permission) {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false as const, error: "Unauthorized" as const };
  }
  if (permission && !adminHasPermission(session, permission)) {
    return { ok: false as const, error: "Access denied." as const };
  }
  return { ok: true as const, user: session };
}
