import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session-token";
import { resolveSafeRedirectUrl } from "@/lib/cms/redirects";
import { cms } from "@/lib/cms/repository";
import { applySecurityHeaders } from "@/lib/security/headers";

function isLoginPath(pathname: string) {
  return pathname === "/sidhu/login" || pathname === "/sidhu/login/";
}

function isSidhuPage(pathname: string) {
  return pathname === "/sidhu" || pathname === "/sidhu/" || pathname.startsWith("/sidhu/");
}

function isSidhuApi(pathname: string) {
  return pathname === "/api/sidhu" || pathname.startsWith("/api/sidhu/");
}

function withSlash(path: string) {
  if (path === "/") return path;
  return path.endsWith("/") ? path : `${path}/`;
}

async function cmsRedirect(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const source = withSlash(pathname);
  if (isSidhuPage(pathname) || isSidhuApi(pathname)) return null;
  try {
    const rules = await cms.listActiveRedirects();
    const match = rules.find((rule) => withSlash(rule.sourcePath) === source);
    if (!match) return null;
    const dest = resolveSafeRedirectUrl(match.destinationPath, request.url);
    if (!dest) return null;
    return NextResponse.redirect(dest, match.statusCode);
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = verifySessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);

  if (isSidhuApi(pathname) && !session) {
    return applySecurityHeaders(
      NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
      pathname,
      request,
    );
  }

  if (isSidhuPage(pathname) && !isLoginPath(pathname) && !session) {
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/sidhu/login/", request.url)),
      pathname,
      request,
    );
  }

  if (isLoginPath(pathname) && session) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/sidhu/", request.url)), pathname, request);
  }

  const redirected = await cmsRedirect(request);
  if (redirected) return applySecurityHeaders(redirected, pathname, request);

  return applySecurityHeaders(NextResponse.next(), pathname, request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
