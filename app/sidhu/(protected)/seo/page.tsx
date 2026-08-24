import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoForm } from "@/components/sidhu/SeoForm";
import { getCloudinaryStatusAction } from "@/lib/cms/actions";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSeoPage() {
  const [settings, assets, cloud] = await Promise.all([
    cms.getSettings(),
    cms.listMedia(),
    getCloudinaryStatusAction(),
  ]);
  return (
    <AdminShell
      title="SEO"
      subtitle="Per-page titles, descriptions, robots, Open Graph, sitemap include, and custom JSON-LD. Organization schema is automatic on Home only. Blog posts have their own SEO panel."
    >
      <SeoForm settings={settings} assets={assets} configured={cloud.configured} />
    </AdminShell>
  );
}
