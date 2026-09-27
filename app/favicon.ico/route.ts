import { serveSiteFavicon } from "@/lib/cms/favicon-response";

export const revalidate = 3600;
export const runtime = "nodejs";

export async function GET() {
  return serveSiteFavicon();
}
