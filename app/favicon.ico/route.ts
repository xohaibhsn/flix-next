import { serveSiteFavicon } from "@/lib/cms/favicon-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return serveSiteFavicon();
}
