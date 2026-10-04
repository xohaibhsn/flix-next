import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { SeoOverviewHub } from "@/components/sidhu/SeoOverviewHub";
import { getSeoHealthState } from "@/lib/cms/seo-health-state";
import { sidhuSeoOverviewRows } from "@/lib/cms/sidhu-seo-preview";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSeoPage() {
  const [settings, posts, categories, healthState] = await Promise.all([
    cms.getSettings(),
    cms.listPosts(),
    cms.listCategories(),
    getSeoHealthState(),
  ]);

  const inventoryCount = sidhuSeoOverviewRows(settings, posts, categories).length;
  const openFindingCount = healthState.lastScanAt ? healthState.currentFindings.length : null;

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[{ label: "SEO" }, { label: "Overview" }]}
    >
      <SeoModuleChrome>
        <SeoOverviewHub
          inventoryCount={inventoryCount}
          lastScanAt={healthState.lastScanAt}
          openFindingCount={openFindingCount}
        />
      </SeoModuleChrome>
    </AdminShell>
  );
}
