"use client";

import type { WritingBrief } from "@/lib/cms/seo-planning/writing-brief";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

function show(value: string, empty: string) {
  return value.trim() ? value : empty;
}

export function SeoPlanningWritingBrief({
  brief,
  dirty,
  dirtyMessage,
}: {
  brief: WritingBrief;
  dirty: boolean;
  dirtyMessage: string;
}) {
  const article = brief.existingArticle;

  return (
    <SectionCard className="space-y-3 text-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">Writing Brief</h3>
        <p className="text-xs text-muted">
          Read-only brief derived from the saved plan. It is not published.
        </p>
      </div>
      {dirty ? <p className="text-sm text-amber-950">{dirtyMessage}</p> : null}
      {!brief.providerEligible && brief.providerIneligibleReason ? (
        <p className="text-sm text-ink">{brief.providerIneligibleReason}</p>
      ) : null}
      <dl className="space-y-3">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Task</dt>
          <dd className="mt-1 text-ink">{brief.taskLabel}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Topic</dt>
          <dd className="mt-1 text-ink">{show(brief.topic, "Not set")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Working title</dt>
          <dd className="mt-1 text-ink">{show(brief.workingTitle, "Not set")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Search intent</dt>
          <dd className="mt-1 text-ink">{show(brief.searchIntent, "Not set")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Content angle</dt>
          <dd className="mt-1 whitespace-pre-wrap text-ink">{show(brief.contentAngle, "Not set")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Next step</dt>
          <dd className="mt-1 whitespace-pre-wrap text-ink">{show(brief.nextStep, "Not set")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Human notes</dt>
          <dd className="mt-1 whitespace-pre-wrap text-ink">{show(brief.humanNotes, "None")}</dd>
        </div>
        {brief.taskType === "RESTORE_HISTORICAL" ? (
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Historical path</dt>
            <dd className="mt-1 break-all text-ink">{show(brief.restorePath, "Not set")}</dd>
            <dd className="mt-1 text-muted">
              No archived article body is available in the stored planning evidence.
            </dd>
          </div>
        ) : null}
        {brief.taskType === "INTERNAL_LINK_ONLY" && brief.targetPublicUrl ? (
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Related public URL</dt>
            <dd className="mt-1 break-all text-ink">{brief.targetPublicUrl}</dd>
          </div>
        ) : null}
        {brief.taskType === "REFRESH_EXISTING" ? (
          <div className="space-y-2">
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Existing article</dt>
            {article ? (
              <dd className="space-y-2">
                <p className="text-ink">{article.title || "Not set"}</p>
                <p className="break-all text-muted">{article.publicPath || "Not set"}</p>
                {article.excerpt ? <p className="text-ink">{article.excerpt}</p> : null}
                <p className="text-muted">Category: {article.categoryName || "Not set"}</p>
                <p className="text-muted">
                  Featured image: {article.featuredImage === "present" ? "present" : "absent"}
                </p>
                <details className="rounded-md border border-line px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted uppercase">
                    Current article snapshot
                  </summary>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-sm text-ink">
                    {article.body || "(empty)"}
                  </pre>
                  {article.leftoverHeadings.length ? (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-muted">Further headings not fully included:</p>
                      <ul className="mt-1 list-disc pl-4 text-xs text-muted">
                        {article.leftoverHeadings.map((heading, index) => (
                          <li key={`${heading}-${index}`}>{heading}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </details>
              </dd>
            ) : (
              <dd className="text-muted">Existing article snapshot unavailable.</dd>
            )}
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Why now</dt>
          <dd className="mt-1 text-ink">{show(brief.whyNow, "None")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Coverage</dt>
          <dd className="mt-1 text-ink">{show(brief.existingCoverage, "None")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Confidence</dt>
          <dd className="mt-1 text-ink">{show(brief.confidence, "None")}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Research bounds</dt>
          <dd className="mt-1 text-muted">
            {brief.sources.length} source {brief.sources.length === 1 ? "reference" : "references"} ·{" "}
            {brief.selectedGscSignals.length} SEO {brief.selectedGscSignals.length === 1 ? "signal" : "signals"}
          </dd>
        </div>
      </dl>
    </SectionCard>
  );
}
