import Link from "next/link";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { sidhuButtonClass } from "@/components/sidhu/ui/Button";
import type { SeoAutomationWorkspaceStatus } from "@/lib/cms/seo-automation/workspace-status";

export function SeoAutomationControlPanel({ status }: { status: SeoAutomationWorkspaceStatus }) {
  const switches = status.switches;
  return (
    <SectionCard className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">SEO Automation — SEO Manager</h2>
          <p className="mt-1 text-sm text-muted">
            Single-operator Research → Ledger → Planning → Preview → Apply → QA → Publish pathway.
            Autonomous writers remain OFF until supervised pilot acceptance.
          </p>
        </div>
        <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
          {status.livePilotReady ? "PILOT READY" : "FAIL-CLOSED"}
        </span>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Emergency kill</dt>
          <dd className="font-medium text-ink">{switches.emergencyKill ? "ON (blocks all)" : "OFF"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Master / Research / Generation</dt>
          <dd className="font-medium text-ink">
            {String(switches.masterEnabled)} / {String(switches.researchEnabled)} /{" "}
            {String(switches.generationEnabled)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Apply writers / Publisher / Scheduler</dt>
          <dd className="font-medium text-ink">
            {String(switches.applyWritersEnabled)} / {String(switches.publisherEnabled)} /{" "}
            {String(switches.schedulerEnabled)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">A1 generation env</dt>
          <dd className="font-medium text-ink">{status.a1GenerationEnvEnabled ? "enabled" : "off"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">A2 Apply wiring / schema</dt>
          <dd className="font-medium text-ink">
            {status.a2ApplyProductionWiringEnabled ? "on" : "off"} /{" "}
            {status.a2SchemaReady ? "ready" : "unregistered"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Timezone default</dt>
          <dd className="font-medium text-ink">{switches.timezone}</dd>
        </div>
      </dl>

      {status.blockers.length ? (
        <div className="rounded border border-border bg-surface-2/40 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Activation blockers</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-ink">
            {status.blockers.slice(0, 8).map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link href="/sidhu/seo/opportunities/" className={sidhuButtonClass("secondary", "min-h-9")}>
          Opportunities
        </Link>
        <Link href="/sidhu/seo/ledger/" className={sidhuButtonClass("secondary", "min-h-9")}>
          Ledger
        </Link>
        <Link href="/sidhu/seo/planning/" className={sidhuButtonClass("secondary", "min-h-9")}>
          Planning
        </Link>
        <Link href="/sidhu/blogs/" className={sidhuButtonClass("secondary", "min-h-9")}>
          Blog drafts
        </Link>
      </div>
    </SectionCard>
  );
}
