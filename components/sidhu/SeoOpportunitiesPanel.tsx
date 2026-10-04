"use client";

import { useMemo, useState, useTransition } from "react";
import type { ResearchUkOpportunitiesResult } from "@/lib/cms/ai-seo/research";
import type {
  SeoResearchConfidence,
  SeoResearchIntent,
  SeoResearchOpportunity,
  SeoResearchRecommendation,
  SeoResearchResult,
  SeoResearchSource,
} from "@/lib/cms/ai-seo/research-schemas";
import { Banner } from "@/components/sidhu/fields";
import { Button, sidhuButtonClass } from "@/components/sidhu/ui/Button";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";
import { cn } from "@/components/sidhu/ui/cn";

function recommendationLabel(value: SeoResearchRecommendation) {
  if (value === "NEW_BLOG") return "NEW BLOG";
  if (value === "REFRESH_EXISTING") return "REFRESH EXISTING";
  if (value === "INTERNAL_LINK_ONLY") return "INTERNAL LINK";
  return "SKIP";
}

function recommendationClass(value: SeoResearchRecommendation) {
  if (value === "NEW_BLOG") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (value === "REFRESH_EXISTING") return "border-sky-200 bg-sky-50 text-sky-950";
  if (value === "INTERNAL_LINK_ONLY") return "border-line bg-paper text-ink";
  return "border-line bg-admin-surface text-muted";
}

function coverageLabel(value: SeoResearchOpportunity["existingCoverage"]) {
  if (value === "NONE") return "No meaningful current coverage";
  if (value === "PARTIAL") return "Partial current coverage";
  return "Strong current coverage";
}

function confidenceLabel(value: SeoResearchConfidence) {
  return `Research confidence: ${value}`;
}

export function SeoOpportunitiesPanel({
  researchAction,
  aiConfigured,
}: {
  researchAction: () => Promise<ResearchUkOpportunitiesResult & { configured?: boolean }>;
  aiConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [research, setResearch] = useState<SeoResearchResult | null>(null);
  const [recommendationFilter, setRecommendationFilter] = useState<"ALL" | SeoResearchRecommendation>("ALL");
  const [intentFilter, setIntentFilter] = useState<"ALL" | SeoResearchIntent>("ALL");

  const opportunities = useMemo(() => {
    if (!research) return [];
    return research.opportunities.filter((item) => {
      if (recommendationFilter !== "ALL" && item.recommendation !== recommendationFilter) return false;
      if (intentFilter !== "ALL" && item.searchIntent !== intentFilter) return false;
      return true;
    });
  }, [research, recommendationFilter, intentFilter]);

  function runResearch() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await researchAction();
      if (!result.ok) {
        setResearch(null);
        setError(result.error);
        return;
      }
      setError(null);
      setResearch(result.research);
    });
  }

  return (
    <div className="space-y-5">
      <SectionCard className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-3xl">
            <h2 className="text-base font-semibold text-ink">UK Content Opportunities</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Find current UK content opportunities using live web research and compare them against existing Flix
              IPTV content before deciding whether to create or update an article.
            </p>
            <p className="mt-2 text-xs text-muted">
              Search-volume, impression and ranking evidence will be added separately through Google Search Console
              data.
            </p>
          </div>
          <Button type="button" variant="primary" disabled={pending || !aiConfigured} onClick={runResearch}>
            {pending ? "Researching…" : "Research UK opportunities"}
          </Button>
        </div>

        {!aiConfigured ? (
          <Banner tone="info">Sidhu AI is not configured yet. Add OPENAI_API_KEY to enable research.</Banner>
        ) : null}

        {error ? <Banner tone="error">{error}</Banner> : null}

        {!research && !error && !pending ? (
          <p className="text-sm text-muted">
            Research does not run automatically. One deliberate click makes one live web-research request.
          </p>
        ) : null}

        {pending ? <p className="text-sm text-muted">Sidhu AI is researching current UK web opportunities…</p> : null}
      </SectionCard>

      {research ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-ink">
              <span className="mb-1 block text-xs font-semibold text-muted">Recommendation</span>
              <select
                className="min-h-10 rounded-md border border-line bg-admin-surface px-3 text-sm"
                value={recommendationFilter}
                onChange={(event) =>
                  setRecommendationFilter(event.target.value as "ALL" | SeoResearchRecommendation)
                }
              >
                <option value="ALL">All</option>
                <option value="NEW_BLOG">New blog</option>
                <option value="REFRESH_EXISTING">Refresh existing</option>
                <option value="INTERNAL_LINK_ONLY">Internal link</option>
                <option value="SKIP">Skip</option>
              </select>
            </label>
            <label className="text-sm text-ink">
              <span className="mb-1 block text-xs font-semibold text-muted">Intent</span>
              <select
                className="min-h-10 rounded-md border border-line bg-admin-surface px-3 text-sm"
                value={intentFilter}
                onChange={(event) => setIntentFilter(event.target.value as "ALL" | SeoResearchIntent)}
              >
                <option value="ALL">All</option>
                <option value="INFORMATIONAL">Informational</option>
                <option value="COMMERCIAL">Commercial</option>
                <option value="SETUP">Setup</option>
                <option value="TROUBLESHOOTING">Troubleshooting</option>
                <option value="COMPARISON">Comparison</option>
                <option value="NAVIGATIONAL">Navigational</option>
              </select>
            </label>
            <p className="pb-2 text-xs text-muted">
              Showing {opportunities.length} of {research.opportunities.length} opportunities (transient — not saved).
            </p>
          </div>

          <div className="space-y-4">
            {opportunities.map((item) => (
              <OpportunityCard key={`${item.recommendation}:${item.workingTitle}`} item={item} />
            ))}
            {!opportunities.length ? (
              <SectionCard padding="sm">
                <p className="text-sm text-muted">No opportunities match the current filters.</p>
              </SectionCard>
            ) : null}
          </div>

          <ResearchSources sources={research.sources} />
        </>
      ) : null}
    </div>
  );
}

function OpportunityCard({ item }: { item: SeoResearchOpportunity }) {
  return (
    <SectionCard className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{item.workingTitle}</h3>
          <p className="mt-1 text-sm text-muted">{item.topic}</p>
        </div>
        <span
          className={cn(
            "inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold tracking-wide",
            recommendationClass(item.recommendation),
          )}
        >
          {recommendationLabel(item.recommendation)}
        </span>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Search intent</dt>
          <dd className="mt-1 text-ink">{item.searchIntent}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-muted uppercase">Research confidence</dt>
          <dd className="mt-1 text-ink">{confidenceLabel(item.confidence)}</dd>
          <p className="mt-0.5 text-xs text-muted">Confidence in this research recommendation — not a ranking score.</p>
        </div>
      </dl>

      <div className="space-y-2 text-sm">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Why this may matter now</p>
          <p className="mt-1 text-ink">{item.whyNow}</p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Current web evidence</p>
          <p className="mt-1 text-ink">{item.webEvidence}</p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Existing Flix coverage</p>
          <p className="mt-1 text-ink">{coverageLabel(item.existingCoverage)}</p>
          {item.matchedTitle || item.matchedPublicUrl ? (
            <p className="mt-1 text-sm text-muted">
              Matched:{" "}
              {item.matchedPublicUrl ? (
                <a
                  href={item.matchedPublicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink underline-offset-2 hover:underline"
                >
                  {item.matchedTitle || item.matchedPublicUrl}
                </a>
              ) : (
                item.matchedTitle
              )}
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Suggested content angle</p>
          <p className="mt-1 text-ink">{item.suggestedAngle}</p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Next step</p>
          <p className="mt-1 text-ink">{item.nextStep}</p>
        </div>
      </div>
    </SectionCard>
  );
}

function ResearchSources({ sources }: { sources: SeoResearchSource[] }) {
  if (!sources.length) {
    return (
      <SectionCard padding="sm">
        <p className="text-sm font-semibold text-ink">Research sources</p>
        <p className="mt-1 text-sm text-muted">
          No consultable source URLs were returned with this research run. Opportunity evidence above is still based on
          the model’s web research summary.
        </p>
      </SectionCard>
    );
  }

  return (
    <details className="rounded-xl border border-line bg-admin-surface open:pb-0">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink marker:content-none [&::-webkit-details-marker]:hidden">
        Research sources ({sources.length})
      </summary>
      <div className="border-t border-line px-4 py-3">
        <p className="mb-3 text-xs text-muted">Sources consulted for this research run.</p>
        <ul className="space-y-2">
          {sources.map((source) => (
            <li
              key={source.url}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-ink">{source.title}</p>
                <p className="text-xs text-muted">{source.domain}</p>
              </div>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={sidhuButtonClass("secondary", "min-h-9 text-xs")}
              >
                Open source
              </a>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
