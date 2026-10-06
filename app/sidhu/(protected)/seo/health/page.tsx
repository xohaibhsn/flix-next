import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoHealthReport } from "@/components/sidhu/SeoHealthReport";
import { SeoModuleChrome } from "@/components/sidhu/SeoModuleChrome";
import { explainSeoHealthFindingAction } from "@/lib/cms/ai-seo-actions";
import { getSeoAiProviderAvailability } from "@/lib/cms/ai-seo/config";
import {
  acceptSeoHealthFindingAction,
  reopenSeoHealthFindingAction,
} from "@/lib/cms/seo-health-actions";
import { runSeoHealthScan } from "@/lib/cms/seo-health";
import {
  applySeoHealthScanSnapshot,
  buildSeoHealthWorkflow,
  type SeoHealthWorkflowView,
} from "@/lib/cms/seo-health-memory";
import { getSeoHealthState, saveSeoHealthState } from "@/lib/cms/seo-health-state";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuSeoHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string | string[] }>;
}) {
  const params = await searchParams;
  const runRequested = params.run === "1" || (Array.isArray(params.run) && params.run.includes("1"));

  let report = null;
  let workflow: SeoHealthWorkflowView | null = null;
  let stateWarning: string | null = null;
  const aiProviders = getSeoAiProviderAvailability();
  let siteName: string | undefined;

  if (runRequested) {
    report = await runSeoHealthScan(cms);
    const previousState = await getSeoHealthState();
    workflow = buildSeoHealthWorkflow(report.findings, previousState);
    try {
      const nextState = applySeoHealthScanSnapshot(previousState, report.findings, new Date().toISOString());
      await saveSeoHealthState(nextState);
    } catch {
      stateWarning =
        "Workflow memory could not be saved. The scan results below are still valid; New/Existing/Resolved may be incomplete until the next successful save.";
    }
    try {
      const settings = await cms.getSettings();
      siteName = settings.siteName?.trim() || undefined;
    } catch {
      siteName = undefined;
    }
  }

  return (
    <AdminShell
      title="SEO"
      subtitle="Search visibility, metadata and technical diagnostics."
      breadcrumbs={[{ label: "SEO", href: "/sidhu/seo/" }, { label: "Issues" }]}
    >
      <SeoModuleChrome>
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-ink">SEO Health</h2>
            <p className="mt-1 text-sm text-muted">
              Manual, read-only issue review. Nothing is changed automatically.
            </p>
          </div>
          <SeoHealthReport
            report={report}
            workflow={workflow}
            stateWarning={stateWarning}
            acceptAction={acceptSeoHealthFindingAction}
            reopenAction={reopenSeoHealthFindingAction}
            openaiConfigured={aiProviders.openaiConfigured}
            geminiConfigured={aiProviders.geminiConfigured}
            aiExplainAction={explainSeoHealthFindingAction}
            siteName={siteName}
          />
        </div>
      </SeoModuleChrome>
    </AdminShell>
  );
}
