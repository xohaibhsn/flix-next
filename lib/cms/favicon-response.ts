import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { iconTypeFromUrl, versionedMediaUrl } from "@/lib/cms/favicon";
import { cms } from "@/lib/cms/repository";

const FALLBACK_CACHE = "public, max-age=86400, must-revalidate";
const REDIRECT_CACHE = "public, max-age=3600, must-revalidate";

async function fallbackIconResponse() {
  const file = path.join(process.cwd(), "public", "favicon.svg");
  const body = await readFile(file);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": FALLBACK_CACHE,
    },
  });
}

/**
 * Prefer a redirect to the Cloudinary favicon URL (no Node byte proxy).
 * Falls back to the bundled public/favicon.svg when CMS favicon is unset.
 */
export async function serveSiteFavicon() {
  try {
    const settings = await cms.getSettings();
    const favicon = settings.branding.favicon;
    if (favicon?.secureUrl) {
      const target = versionedMediaUrl(favicon);
      const type = iconTypeFromUrl(favicon.secureUrl);
      return NextResponse.redirect(target, {
        status: 302,
        headers: {
          "Cache-Control": REDIRECT_CACHE,
          "X-Icon-Type": type,
        },
      });
    }
  } catch {
    // Fall through to the bundled icon rather than failing the tab request.
  }
  return fallbackIconResponse();
}
