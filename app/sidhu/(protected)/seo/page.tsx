import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoForm } from "@/components/sidhu/SeoForm";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSeoPage() {
  const [settings, assets] = await Promise.all([cms.getSettings(), cms.listMedia()]);
  return (
    <AdminShell
      title="SEO"
      subtitle="Per-page titles, descriptions, robots, Open Graph, and sitemap include. Blog posts have their own SEO panel."
    >
      <SeoForm settings={settings} assets={assets} />
    </AdminShell>
  );
}
