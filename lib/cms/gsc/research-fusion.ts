/**
 * GSC-4: bounded GSC evidence for Opportunities research fusion.
 * Builds AI-safe evidence IDs, resolves model refs to factual server rows.
 * No Google/OpenAI calls here — consumes a GSC-2 pack + GSC-3 classifications.
 */

import { compareGscPageByExactUrl, indexGscPagesByExactUrl } from "@/lib/cms/gsc/compare-pages";
import type { GscEvidenceStatus, GscUkEvidencePack } from "@/lib/cms/gsc/evidence-types";
import type { GscUrlClass, GscUrlClassification } from "@/lib/cms/gsc/url-classes";
import type { GscSearchAnalyticsRow } from "@/lib/cms/gsc/types";
import type { GscMetricDirection } from "@/lib/cms/gsc/compare-pages";

export const GSC_AI_QUERY_LIMIT = 25;
export const GSC_AI_PAGE_LIMIT = 25;
export const GSC_AI_QUERY_PAGE_LIMIT = 40;
export const GSC_AI_MAX_REFS_PER_OPPORTUNITY = 8;

export const GSC_STATUS_LABELS: Record<GscEvidenceStatus, string> = {
  AVAILABLE: "GSC evidence included",
  NOT_CONFIGURED: "GSC not connected yet",
  UNAVAILABLE: "GSC evidence unavailable for this run",
  NO_ROWS: "No UK GSC rows found for this evidence window",
};

export const GSC_STATUS_HELPER: Record<GscEvidenceStatus, string> = {
  AVAILABLE: "UK Search Console evidence was included for this research run.",
  NOT_CONFIGURED:
    "GSC not connected yet — this run used current web research and existing site coverage.",
  UNAVAILABLE: "GSC evidence was unavailable for this run.",
  NO_ROWS:
    "No UK GSC rows were available for the current evidence window. This does not mean there is no search demand.",
};

export type GscAiEvidenceKind = "query" | "page" | "query_page";

/** Compact factual evidence row for AI context + UI resolution. */
export type GscAiEvidenceRecord = {
  id: string;
  kind: GscAiEvidenceKind;
  query?: string;
  pageUrl?: string;
  normalizedPath?: string | null;
  classification?: GscUrlClass;
  redirectDestination?: string;
  historicalKey?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  clickDelta?: number | null;
  impressionDelta?: number | null;
  ctrDelta?: number | null;
  positionDelta?: number | null;
  clicksDirection?: GscMetricDirection | null;
  impressionsDirection?: GscMetricDirection | null;
  ctrDirection?: GscMetricDirection | null;
  positionDirection?: GscMetricDirection | null;
};

export type GscResearchRunMeta = {
  status: GscEvidenceStatus;
  statusLabel: string;
  helperText: string;
  window?: GscUkEvidencePack["window"];
  country?: GscUkEvidencePack["country"];
};

/** Full server context for one Opportunities research run. */
export type GscResearchFusionContext = {
  meta: GscResearchRunMeta;
  /** Bounded subset sent to the model (IDs + factual fields). */
  aiPayload: {
    status: GscEvidenceStatus;
    statusLabel: string;
    window?: GscUkEvidencePack["window"];
    country?: GscUkEvidencePack["country"];
    evidence: Array<{
      id: string;
      kind: GscAiEvidenceKind;
      query?: string;
      pageUrl?: string;
      classification?: GscUrlClass;
      redirectDestination?: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
      clickDelta?: number | null;
      impressionDelta?: number | null;
      positionDirection?: GscMetricDirection | null;
    }>;
    notes: string[];
  };
  /** Lookup for post-model reference resolution. */
  byId: Map<string, GscAiEvidenceRecord>;
};

function metricsFromRow(row: GscSearchAnalyticsRow) {
  return {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  };
}

function classificationForRawUrl(
  rawUrl: string | undefined,
  byRawUrl: Map<string, GscUrlClassification>,
): GscUrlClassification | undefined {
  if (!rawUrl) return undefined;
  return byRawUrl.get(rawUrl);
}

/**
 * Build fusion context from a GSC-2 pack + optional GSC-3 classifications.
 * Index/classify must already have been done once by the caller.
 */
export function buildGscResearchFusionContext(args: {
  pack: GscUkEvidencePack;
  classifications?: readonly GscUrlClassification[];
}): GscResearchFusionContext {
  const { pack } = args;
  const byRawUrl = new Map<string, GscUrlClassification>();
  for (const item of args.classifications || []) {
    if (item.rawUrl) byRawUrl.set(item.rawUrl, item);
  }

  const previousIndex = indexGscPagesByExactUrl(pack.previousPages);
  const previousList = [...previousIndex.values()];
  const records: GscAiEvidenceRecord[] = [];
  const byId = new Map<string, GscAiEvidenceRecord>();

  const push = (record: GscAiEvidenceRecord) => {
    records.push(record);
    byId.set(record.id, record);
  };

  pack.recentQueries.slice(0, GSC_AI_QUERY_LIMIT).forEach((row, index) => {
    const query = row.keys[0] || "";
    push({
      id: `Q${index + 1}`,
      kind: "query",
      query,
      ...metricsFromRow(row),
    });
  });

  pack.recentPages.slice(0, GSC_AI_PAGE_LIMIT).forEach((row, index) => {
    const pageUrl = row.keys[0] || "";
    const classified = classificationForRawUrl(pageUrl, byRawUrl);
    const comparison = pageUrl
      ? compareGscPageByExactUrl(row, previousList)
      : null;
    push({
      id: `P${index + 1}`,
      kind: "page",
      pageUrl,
      normalizedPath: classified?.normalizedPath ?? null,
      classification: classified?.classification,
      redirectDestination: classified?.redirectDestination,
      historicalKey: classified?.historicalKey,
      ...metricsFromRow(row),
      clickDelta: comparison?.matched ? comparison.clickDelta : null,
      impressionDelta: comparison?.matched ? comparison.impressionDelta : null,
      ctrDelta: comparison?.matched ? comparison.ctrDelta : null,
      positionDelta: comparison?.matched ? comparison.positionDelta : null,
      clicksDirection: comparison?.matched ? comparison.clicksDirection : null,
      impressionsDirection: comparison?.matched ? comparison.impressionsDirection : null,
      ctrDirection: comparison?.matched ? comparison.ctrDirection : null,
      positionDirection: comparison?.matched ? comparison.positionDirection : null,
    });
  });

  pack.recentQueryPages.slice(0, GSC_AI_QUERY_PAGE_LIMIT).forEach((row, index) => {
    const query = row.keys[0] || "";
    const pageUrl = row.keys[1] || "";
    const classified = classificationForRawUrl(pageUrl, byRawUrl);
    push({
      id: `QP${index + 1}`,
      kind: "query_page",
      query,
      pageUrl,
      normalizedPath: classified?.normalizedPath ?? null,
      classification: classified?.classification,
      redirectDestination: classified?.redirectDestination,
      historicalKey: classified?.historicalKey,
      ...metricsFromRow(row),
    });
  });

  const meta: GscResearchRunMeta = {
    status: pack.status,
    statusLabel: GSC_STATUS_LABELS[pack.status],
    helperText: GSC_STATUS_HELPER[pack.status],
    window: pack.window,
    country: pack.country,
  };

  return {
    meta,
    byId,
    aiPayload: {
      status: pack.status,
      statusLabel: meta.statusLabel,
      window: pack.status === "AVAILABLE" || pack.status === "NO_ROWS" ? pack.window : undefined,
      country: pack.country,
      evidence: records.map((record) => ({
        id: record.id,
        kind: record.kind,
        query: record.query,
        pageUrl: record.pageUrl,
        classification: record.classification,
        redirectDestination: record.redirectDestination,
        clicks: record.clicks,
        impressions: record.impressions,
        ctr: record.ctr,
        position: record.position,
        clickDelta: record.clickDelta,
        impressionDelta: record.impressionDelta,
        positionDirection: record.positionDirection,
      })),
      notes: [
        "GSC metrics are factual provider values for the supplied evidence IDs only.",
        "Reference evidence by ID (Q#, P#, QP#). Do not invent clicks, impressions, CTR, or position.",
        "Absence from this bounded GSC set does not prove zero search demand.",
        "REDIRECTED_HISTORICAL means a known redirect source — not an automatic restore recommendation.",
        "Root / redirecting to /welcome/ is current site architecture, not content to restore.",
      ],
    },
  };
}

/** Empty/not-configured fusion context for graceful Opportunities fallback. */
export function emptyGscResearchFusionContext(
  status: GscEvidenceStatus = "NOT_CONFIGURED",
): GscResearchFusionContext {
  const packLike = {
    status,
    window: {
      recentStart: "",
      recentEnd: "",
      previousStart: "",
      previousEnd: "",
      reportingLagDays: 3,
    },
    country: { code: "GB" as const, expression: "gbr" as const },
    recentQueries: [],
    recentPages: [],
    recentQueryPages: [],
    previousPages: [],
  };
  // Build via helper with empty rows so AI payload shape stays consistent.
  return buildGscResearchFusionContext({ pack: packLike });
}

/**
 * Validate model-supplied evidence IDs against the server catalog.
 * Unknown IDs dropped; duplicates removed; max bound enforced.
 */
export function resolveGscEvidenceRefs(
  rawRefs: unknown,
  byId: Map<string, GscAiEvidenceRecord>,
  max = GSC_AI_MAX_REFS_PER_OPPORTUNITY,
): { refs: string[]; resolved: GscAiEvidenceRecord[]; historicalSignal: boolean } {
  if (!Array.isArray(rawRefs) || byId.size === 0) {
    return { refs: [], resolved: [], historicalSignal: false };
  }

  const seen = new Set<string>();
  const refs: string[] = [];
  const resolved: GscAiEvidenceRecord[] = [];

  for (const item of rawRefs) {
    if (refs.length >= max) break;
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    const record = byId.get(id);
    if (!record) continue;
    seen.add(id);
    refs.push(id);
    resolved.push(record);
  }

  const historicalSignal = resolved.some((record) => {
    if (record.classification === "REMOVED_OR_404") return true;
    if (record.classification !== "REDIRECTED_HISTORICAL") return false;
    // Root `/` → `/welcome/` is architecture, not a restore-worthy historical page.
    const path = record.normalizedPath || "";
    return path !== "/";
  });

  return { refs, resolved, historicalSignal };
}

/** Collect raw page URLs from a pack for one-shot classification. */
export function collectGscPackPageUrls(pack: GscUkEvidencePack): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | undefined) => {
    const value = String(raw || "").trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };

  for (const row of pack.recentPages) add(row.keys[0]);
  for (const row of pack.recentQueryPages) add(row.keys[1] || row.keys[0]);
  for (const row of pack.previousPages) add(row.keys[0]);
  return out;
}
