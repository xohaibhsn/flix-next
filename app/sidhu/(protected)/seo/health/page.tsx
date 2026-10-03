import { AdminShell } from "@/components/sidhu/AdminShell";
import { SeoHealthReport } from "@/components/sidhu/SeoHealthReport";
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
  }

  return (
    <AdminShell
      title="SEO Health"
      subtitle="A manual, read-only overview of the existing SEO diagnostics. Nothing is changed automatically."
    >
      <SeoHealthReport
        report={report}
        workflow={workflow}
        stateWarning={stateWarning}
        acceptAction={acceptSeoHealthFindingAction}
        reopenAction={reopenSeoHealthFindingAction}
      />
    </AdminShell>
  );
}
