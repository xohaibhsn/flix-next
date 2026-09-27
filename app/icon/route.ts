import { serveSiteFavicon } from "@/lib/cms/favicon-response";

/** Route-level cache; settings saves revalidatePath("/icon") and "/favicon.ico". */
export const revalidate = 3600;
export const runtime = "nodejs";

export async function GET() {
  return serveSiteFavicon();
}
