import { AdminShell } from "@/components/sidhu/AdminShell";
import { CmsWriteFreezeDiagnosticPanel } from "@/components/sidhu/CmsWriteFreezeDiagnosticPanel";
import { SeoAutomationControlPanel } from "@/components/sidhu/SeoAutomationControlPanel";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { SeoOverviewHub } from "@/components/sidhu/SeoOverviewHub";
import { buildSeoAutomationWorkspaceStatus } from "@/lib/cms/seo-automation/workspace-status";
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
  const automationStatus = buildSeoAutomationWorkspaceStatus();

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[{ label: "SEO" }, { label: "Overview" }]}
    >
      <SeoModuleChrome>
        <div className="space-y-5">
          <SeoAutomationControlPanel status={automationStatus} />
          <CmsWriteFreezeDiagnosticPanel />
          <SeoOverviewHub
            inventoryCount={inventoryCount}
            lastScanAt={healthState.lastScanAt}
            openFindingCount={openFindingCount}
          />
        </div>
      </SeoModuleChrome>
    </AdminShell>
  );
}
