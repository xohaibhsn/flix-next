import type { SeoResearchGscEvidence, SeoResearchSource } from "@/lib/cms/ai-seo/research-schemas";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function recommendationLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SeoPlanningDetail({
  draft,
  targetPostTitle,
}: {
  draft: SeoPlanningDraft;
  targetPostTitle: string | null;
}) {
  const payload = asRecord(draft.payload) || {};
  const opportunity = asRecord(payload.opportunity) || {};
  const sources = Array.isArray(payload.sources) ? (payload.sources as SeoResearchSource[]) : [];
  const gscEvidence = Array.isArray(opportunity.gscEvidence)
    ? (opportunity.gscEvidence as SeoResearchGscEvidence[])
    : [];
  const gscMeta = asRecord(payload.gsc);

  return (
    <div className="space-y-5">
      <SectionCard className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-amber-900 uppercase">
          Private planning draft · Not published
        </p>
        <h2 className="text-lg font-semibold text-ink">{draft.workingTitle || "Untitled plan"}</h2>
        <p className="text-sm text-muted">{draft.topic}</p>
      </SectionCard>

      <SectionCard className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Planning summary</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Recommendation</dt>
            <dd className="mt-1 text-ink">{recommendationLabel(draft.recommendation)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Workflow status</dt>
            <dd className="mt-1 text-ink">{draft.workflowStatus.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Search intent</dt>
            <dd className="mt-1 text-ink">{draft.searchIntent || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Confidence</dt>
            <dd className="mt-1 text-ink">{String(opportunity.confidence || "—")}</dd>
          </div>
          {draft.proposedSlug ? (
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Proposed slug</dt>
              <dd className="mt-1 break-all text-ink">/blogs/{draft.proposedSlug}/</dd>
            </div>
          ) : null}
          {draft.matchedPublicUrl || targetPostTitle ? (
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Target post</dt>
              <dd className="mt-1 break-all text-ink">
                {targetPostTitle || "—"}
                {draft.matchedPublicUrl ? (
                  <span className="mt-0.5 block text-xs text-muted">{draft.matchedPublicUrl}</span>
                ) : null}
              </dd>
            </div>
          ) : null}
          {draft.restorePath ? (
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Restore path</dt>
              <dd className="mt-1 break-all text-ink">{draft.restorePath}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Created</dt>
            <dd className="mt-1 text-ink">{formatUpdated(draft.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Updated</dt>
            <dd className="mt-1 text-ink">{formatUpdated(draft.updatedAt)}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard className="space-y-3 text-sm">
        <h3 className="text-sm font-semibold text-ink">Evidence snapshot</h3>
        {opportunity.whyNow ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Why now</p>
            <p className="mt-1 text-ink">{String(opportunity.whyNow)}</p>
          </div>
        ) : null}
        {opportunity.webEvidence ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Web evidence</p>
            <p className="mt-1 text-ink">{String(opportunity.webEvidence)}</p>
          </div>
        ) : null}
        {opportunity.suggestedAngle ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Suggested angle</p>
            <p className="mt-1 text-ink">{String(opportunity.suggestedAngle)}</p>
          </div>
        ) : null}
        {opportunity.nextStep ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Next step</p>
            <p className="mt-1 text-ink">{String(opportunity.nextStep)}</p>
          </div>
        ) : null}
        {gscMeta ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">GSC run meta</p>
            <p className="mt-1 text-ink">{String(gscMeta.statusLabel || gscMeta.status || "—")}</p>
            {gscMeta.helperText ? (
              <p className="mt-0.5 text-xs text-muted">{String(gscMeta.helperText)}</p>
            ) : null}
          </div>
        ) : null}
        {gscEvidence.length ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              GSC evidence ({gscEvidence.length})
            </p>
            {gscEvidence.map((row) => (
              <div key={row.id} className="rounded-md border border-line px-3 py-2 text-xs text-muted">
                <p className="font-semibold text-ink">
                  {row.id} · {row.kind}
                  {row.classification ? ` · ${row.classification}` : ""}
                </p>
                {row.normalizedPath || row.pageUrl ? (
                  <p className="mt-0.5 break-all">{row.normalizedPath || row.pageUrl}</p>
                ) : null}
                <p className="mt-0.5">
                  Clicks {row.clicks} · Impressions {row.impressions} · CTR {(row.ctr * 100).toFixed(1)}% · Pos{" "}
                  {row.position.toFixed(1)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">No linked GSC evidence stored on this planning draft.</p>
        )}
        {sources.length ? (
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              Sources ({sources.length})
            </p>
            <ul className="mt-1 space-y-1 text-xs text-muted">
              {sources.map((source) => (
                <li key={source.url} className="break-all">
                  {source.title || source.domain || source.url}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
