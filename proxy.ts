import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session-token";

function isLoginPath(pathname: string) {
  return pathname === "/sidhu/login" || pathname === "/sidhu/login/";
}

function isSidhuPage(pathname: string) {
  return pathname === "/sidhu" || pathname === "/sidhu/" || pathname.startsWith("/sidhu/");
}

function isSidhuApi(pathname: string) {
  return pathname === "/api/sidhu" || pathname.startsWith("/api/sidhu/");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = verifySessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);

  if (isSidhuApi(pathname) && !session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (isSidhuPage(pathname) && !isLoginPath(pathname) && !session) {
    return NextResponse.redirect(new URL("/sidhu/login/", request.url));
  }

  if (isLoginPath(pathname) && session) {
    return NextResponse.redirect(new URL("/sidhu/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/sidhu", "/sidhu/:path*", "/api/sidhu/:path*"],
};
