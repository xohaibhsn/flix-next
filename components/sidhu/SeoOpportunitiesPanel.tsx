"use client";

import { useMemo, useState, useTransition } from "react";
import type { ResearchUkOpportunitiesResult } from "@/lib/cms/ai-seo/research";
import type {
  SeoResearchConfidence,
  SeoResearchGscEvidence,
  SeoResearchGscMeta,
  SeoResearchGscUrlClass,
  SeoResearchIntent,
  SeoResearchOpportunity,
  SeoResearchRecommendation,
  SeoResearchResult,
  SeoResearchSource,
} from "@/lib/cms/ai-seo/research-schemas";
import type { ProbeGscConnectionActionResult } from "@/lib/cms/gsc/gsc-actions";
import type { GscProbeResult } from "@/lib/cms/gsc/probe-types";
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

function classificationLabel(value: SeoResearchGscUrlClass | undefined) {
  if (value === "CURRENT_CMS") return "Current published page";
  if (value === "CURRENT_PUBLIC_NON_CMS") return "Current public route";
  if (value === "REDIRECTED_HISTORICAL") return "Historical redirect source";
  if (value === "REMOVED_OR_404") return "Historical / not currently live";
  if (value === "UNKNOWN") return "Unclassified in this index";
  return null;
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPos(value: number) {
  return value.toFixed(1);
}

export function SeoOpportunitiesPanel({
  researchAction,
  gscProbeAction,
  aiConfigured,
}: {
  researchAction: () => Promise<ResearchUkOpportunitiesResult & { configured?: boolean }>;
  gscProbeAction: () => Promise<ProbeGscConnectionActionResult>;
  aiConfigured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [probePending, startProbeTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [research, setResearch] = useState<SeoResearchResult | null>(null);
  const [probe, setProbe] = useState<GscProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
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
    if (pending || probePending) return;
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

  function runGscProbe() {
    if (pending || probePending) return;
    setProbeError(null);
    startProbeTransition(async () => {
      const result = await gscProbeAction();
      if (!result.ok) {
        setProbe(null);
        setProbeError(result.error);
        return;
      }
      setProbeError(null);
      setProbe(result.probe);
    });
  }

  return (
    <div className="space-y-5">
      <SectionCard className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 max-w-3xl">
            <h2 className="text-base font-semibold text-ink">UK Content Opportunities</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Find current UK content opportunities using live web research, existing Flix IPTV coverage, and Search
              Console evidence when connected — before deciding whether to create or update an article.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending || probePending}
              onClick={runGscProbe}
            >
              {probePending ? "Testing GSC…" : "Test GSC connection"}
            </Button>
            <Button type="button" variant="primary" disabled={pending || probePending || !aiConfigured} onClick={runResearch}>
              {pending ? "Researching…" : "Research UK opportunities"}
            </Button>
          </div>
        </div>

        {!aiConfigured ? (
          <Banner tone="info">Sidhu AI is not configured yet. Add OPENAI_API_KEY to enable research.</Banner>
        ) : null}

        {error ? <Banner tone="error">{error}</Banner> : null}
        {probeError ? <Banner tone="error">{probeError}</Banner> : null}
        {probe ? <GscProbeResultCard probe={probe} /> : null}

        {!research && !error && !pending ? (
          <p className="text-sm text-muted">
            Research does not run automatically. One deliberate click makes one live web-research request.
          </p>
        ) : null}

        {pending ? <p className="text-sm text-muted">Sidhu AI is researching current UK web opportunities…</p> : null}
      </SectionCard>

      {research ? (
        <>
          {research.gsc ? <GscRunStatus gsc={research.gsc} /> : null}

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

function GscProbeResultCard({ probe }: { probe: GscProbeResult }) {
  const tone =
    probe.status === "AVAILABLE" || probe.status === "NO_ROWS"
      ? "info"
      : probe.status === "NOT_CONFIGURED"
        ? "info"
        : "error";

  return (
    <div className="space-y-2 rounded-md border border-line bg-paper/40 px-3 py-3">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">GSC connection test</p>
      <Banner tone={tone}>{probe.message}</Banner>
      <p className="text-xs text-muted">
        Window: {probe.window.start} → {probe.window.end} (UK · lag {probe.window.reportingLagDays}d) · Status{" "}
        {probe.status}
        {probe.analyticsOk ? ` · rows ${probe.rowCount}` : ""}
      </p>
      {probe.sample ? (
        <p className="text-xs text-muted">
          Sample query: “{probe.sample.query || "(empty)"}” · Impressions {probe.sample.impressions.toLocaleString()} ·
          Clicks {probe.sample.clicks.toLocaleString()} · CTR {formatPct(probe.sample.ctr)} · Avg position{" "}
          {formatPos(probe.sample.position)}
        </p>
      ) : null}
    </div>
  );
}

function GscRunStatus({ gsc }: { gsc: SeoResearchGscMeta }) {
  const showWindow =
    (gsc.status === "AVAILABLE" || gsc.status === "NO_ROWS") &&
    gsc.window?.recentStart &&
    gsc.window?.recentEnd;

  return (
    <SectionCard padding="sm" className="space-y-1">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">GSC Evidence</p>
      <p className="text-sm text-ink">{gsc.statusLabel}</p>
      <p className="text-sm text-muted">{gsc.helperText}</p>
      {showWindow ? (
        <p className="text-xs text-muted">
          Evidence window: {gsc.window!.recentStart} → {gsc.window!.recentEnd} (UK)
          {gsc.window!.previousStart && gsc.window!.previousEnd
            ? `; prior: ${gsc.window!.previousStart} → ${gsc.window!.previousEnd}`
            : ""}
        </p>
      ) : null}
    </SectionCard>
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

        <OpportunityGscEvidence item={item} />

        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Suggested content angle</p>
          <p className="mt-1 text-ink">{item.suggestedAngle}</p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">AI assessment / next step</p>
          <p className="mt-1 text-ink">{item.nextStep}</p>
        </div>
      </div>
    </SectionCard>
  );
}

function OpportunityGscEvidence({ item }: { item: SeoResearchOpportunity }) {
  const rows = item.gscEvidence || [];
  if (!rows.length) {
    return (
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">GSC Evidence</p>
        <p className="mt-1 text-sm text-muted">No linked Search Console evidence for this opportunity.</p>
      </div>
    );
  }

  return (
    <details className="rounded-md border border-line bg-paper/40 open:pb-0">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold tracking-wide text-muted uppercase marker:content-none [&::-webkit-details-marker]:hidden">
        GSC Evidence ({rows.length})
        {item.historicalSignal ? " · Historical GSC URL detected" : ""}
      </summary>
      <div className="space-y-3 border-t border-line px-3 py-3">
        {rows.map((row) => (
          <GscEvidenceRow key={row.id} row={row} />
        ))}
      </div>
    </details>
  );
}

function GscEvidenceRow({ row }: { row: SeoResearchGscEvidence }) {
  const classLabel = classificationLabel(row.classification);
  const isHistorical =
    row.classification === "REDIRECTED_HISTORICAL" || row.classification === "REMOVED_OR_404";

  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium text-ink">
        {row.kind === "query" ? "Query" : row.kind === "page" ? "Page" : "Query × Page"} · {row.id}
      </p>
      {row.query ? <p className="text-ink">“{row.query}”</p> : null}
      {row.pageUrl ? (
        <p className="break-all text-muted">
          {row.pageUrl}
          {row.normalizedPath ? ` → ${row.normalizedPath}` : ""}
        </p>
      ) : null}
      {classLabel ? <p className="text-xs text-muted">Classification: {classLabel}</p> : null}
      {isHistorical ? (
        <p className="text-xs text-muted">
          {row.classification === "REMOVED_OR_404"
            ? "Historical GSC URL detected · Current state: 404 / not live"
            : row.redirectDestination
              ? `Historical GSC URL detected · Current state: redirects to ${row.redirectDestination}`
              : "Historical GSC URL detected"}
          {row.normalizedPath === "/"
            ? " (root redirect is current site architecture, not a restore signal)."
            : ""}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        Impressions {row.impressions.toLocaleString()} · Clicks {row.clicks.toLocaleString()} · CTR{" "}
        {formatPct(row.ctr)} · Avg position {formatPos(row.position)}
        {row.clickDelta != null || row.impressionDelta != null
          ? ` · Δ clicks ${row.clickDelta ?? "—"} / Δ impr. ${row.impressionDelta ?? "—"}`
          : ""}
      </p>
    </div>
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
