import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";

export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/sidhu/login/");
  }
  return session;
}

export async function requireAdminApi() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function requireAdminAction() {
  const session = await getAdminSession();
  if (!session) {
    return { ok: false as const, error: "Unauthorized" };
  }
  return null;
}
