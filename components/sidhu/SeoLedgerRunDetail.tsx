import type { ReactNode } from "react";
import Link from "next/link";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { formatLedgerMysqlUtcLabel } from "@/lib/cms/seo-experiment-ledger/read-cursor";
import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "@/lib/cms/seo-experiment-ledger/types";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

function nullableText(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  return value;
}

function nullableBool(value: boolean | null | undefined): string {
  if (value == null) return "— (not evaluated)";
  return value ? "Yes" : "No";
}

function nullableScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return String(value);
}

/** Only allow relative public paths already stored by Ledger (no arbitrary URL construction). */
function safePublicPath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("://") || trimmed.includes("\\") || trimmed.includes("<")) return null;
  if (trimmed.length > 300) return null;
  return trimmed;
}

export function SeoLedgerRunDetail({
  run,
  decisions,
  decisionOverflow,
}: {
  run: SeoResearchRunRow;
  decisions: SeoOpportunityDecisionRow[];
  decisionOverflow?: boolean;
}) {
  return (
    <div className="space-y-5">
      <SectionCard className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Research run</h2>
            <p className="mt-1 font-mono text-xs text-muted">{run.id}</p>
          </div>
          <Link
            href="/sidhu/seo/ledger/"
            className="inline-flex min-h-9 items-center rounded-md border border-line px-2.5 text-xs font-semibold text-muted hover:bg-paper hover:text-ink"
          >
            Back to list
          </Link>
        </div>
        <p className="text-sm text-muted">
          Historical snapshot only. Opening this page does not invoke Research, GSC, or the Decision
          Pipeline.
        </p>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Created">{formatLedgerMysqlUtcLabel(run.createdAt)}</Field>
          <Field label="Completed">{formatLedgerMysqlUtcLabel(run.completedAt)}</Field>
          <Field label="Source">{run.source}</Field>
          <Field label="Research">{run.researchOk ? "SUCCESS" : "FAILED"}</Field>
          <Field label="Research error code">{nullableText(run.researchErrorCode)}</Field>
          <Field label="Pipeline status">{run.pipelineRunStatus}</Field>
          <Field label="Pipeline version">{nullableText(run.pipelineVersion)}</Field>
          <Field label="Pipeline error code">{nullableText(run.pipelineErrorCode)}</Field>
          <Field label="Opportunity count">{run.opportunityCount}</Field>
          <Field label="GSC status">{nullableText(run.gscStatus)}</Field>
          <Field label="Durability">{run.durabilityStatus}</Field>
        </dl>
      </SectionCard>

      <SectionCard className="space-y-3">
        <h3 className="text-base font-semibold text-ink">Stored opportunity decisions</h3>
        {decisionOverflow ? (
          <p className="text-sm text-amber-900">
            Unexpected decision overflow detected. Showing the first five stored rows only.
          </p>
        ) : null}
        {!decisions.length ? (
          <p className="text-sm text-muted">
            {run.researchOk
              ? "No stored decisions for this run."
              : "No decisions — Research failed and the pipeline was skipped."}
          </p>
        ) : (
          <div className="space-y-4">
            {decisions.map((d) => {
              const matched = safePublicPath(d.matchedPublicUrl);
              const restore = safePublicPath(d.restorePath);
              return (
                <article
                  key={d.id}
                  className="rounded-lg border border-line bg-paper/40 p-4"
                >
                  <div className="mb-3 flex flex-wrap items-baseline gap-2">
                    <h4 className="text-sm font-semibold text-ink">
                      Opportunity index {d.opportunityIndex}
                    </h4>
                    <span className="text-xs text-muted">{d.evaluationStatus}</span>
                  </div>
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <Field label="Topic">{nullableText(d.topic)}</Field>
                    <Field label="Working title">{nullableText(d.workingTitle)}</Field>
                    <Field label="Research recommendation">
                      {nullableText(d.researchRecommendation)}
                    </Field>
                    <Field label="Research confidence">{nullableText(d.researchConfidence)}</Field>
                    <Field label="Existing coverage">{nullableText(d.existingCoverage)}</Field>
                    <Field label="Matched public URL">
                      {matched ? (
                        <span className="font-mono text-xs">{matched}</span>
                      ) : (
                        nullableText(d.matchedPublicUrl)
                      )}
                    </Field>
                    <Field label="Restore path">
                      {restore ? (
                        <span className="font-mono text-xs">{restore}</span>
                      ) : (
                        nullableText(d.restorePath)
                      )}
                    </Field>
                    <Field label="Target post ID">{nullableText(d.targetPostId)}</Field>
                    <Field label="RF verdict">{nullableText(d.rfVerdict)}</Field>
                    <Field label="RF fingerprint">
                      <span className="font-mono text-xs">{nullableText(d.rfFingerprint)}</span>
                    </Field>
                    <Field label="NBA action">{nullableText(d.nbaAction)}</Field>
                    <Field label="NBA status">{nullableText(d.nbaStatus)}</Field>
                    <Field label="NBA autonomous eligible">
                      {nullableBool(d.nbaAutonomousEligible)}
                    </Field>
                    <Field label="NBA fingerprint">
                      <span className="font-mono text-xs">{nullableText(d.nbaFingerprint)}</span>
                    </Field>
                    <Field label="Priority score">{nullableScore(d.priorityScore)}</Field>
                    <Field label="Priority tier">{nullableText(d.priorityTier)}</Field>
                    <Field label="Priority score version">
                      {nullableText(d.priorityScoreVersion)}
                    </Field>
                    <Field label="Priority automation selectable">
                      {nullableBool(d.priorityAutomationSelectable)}
                    </Field>
                    <Field label="Priority fingerprint">
                      <span className="font-mono text-xs">
                        {nullableText(d.priorityFingerprint)}
                      </span>
                    </Field>
                    <Field label="Pipeline fingerprint">
                      <span className="font-mono text-xs">
                        {nullableText(d.pipelineFingerprint)}
                      </span>
                    </Field>
                    <Field label="Selected">{d.selected ? "Yes" : "No"}</Field>
                    <Field label="Selection source">{d.selectionSource}</Field>
                  </dl>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
