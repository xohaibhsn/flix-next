import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { connection } from "next/server";
import { cms } from "@/lib/cms/repository";
import { iconTypeFromUrl } from "@/lib/cms/favicon";

async function fallbackIconResponse() {
  const file = path.join(process.cwd(), "public", "favicon.svg");
  const body = await readFile(file);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, must-revalidate",
    },
  });
}

export async function serveSiteFavicon() {
  await connection();
  const settings = await cms.getSettings();
  const favicon = settings.branding.favicon;
  if (favicon?.secureUrl) {
    try {
      const upstream = await fetch(favicon.secureUrl, { cache: "no-store" });
      if (upstream.ok) {
        const body = await upstream.arrayBuffer();
        const type = upstream.headers.get("content-type") || iconTypeFromUrl(favicon.secureUrl);
        return new NextResponse(body, {
          headers: {
            "Content-Type": type,
            "Cache-Control": "public, max-age=3600, must-revalidate",
            ETag: `"${favicon.id}"`,
          },
        });
      }
    } catch {
      // Fall through to the bundled icon rather than failing the tab request.
    }
  }
  return fallbackIconResponse();
}
