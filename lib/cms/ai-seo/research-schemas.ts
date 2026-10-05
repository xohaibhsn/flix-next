/** UK Content Opportunity Research — structured output contract (V1 + GSC-4 fusion). */

export const SEO_RESEARCH_RECOMMENDATIONS = [
  "NEW_BLOG",
  "REFRESH_EXISTING",
  "INTERNAL_LINK_ONLY",
  "SKIP",
  "RESTORE_HISTORICAL",
] as const;
export type SeoResearchRecommendation = (typeof SEO_RESEARCH_RECOMMENDATIONS)[number];

/** GSC run statuses (GSC-2) — client-safe labels come from the server result. */
export const SEO_RESEARCH_GSC_STATUSES = [
  "AVAILABLE",
  "NOT_CONFIGURED",
  "UNAVAILABLE",
  "NO_ROWS",
] as const;
export type SeoResearchGscStatus = (typeof SEO_RESEARCH_GSC_STATUSES)[number];

export const SEO_RESEARCH_GSC_EVIDENCE_KINDS = ["query", "page", "query_page"] as const;
export type SeoResearchGscEvidenceKind = (typeof SEO_RESEARCH_GSC_EVIDENCE_KINDS)[number];

export const SEO_RESEARCH_GSC_URL_CLASSES = [
  "CURRENT_CMS",
  "CURRENT_PUBLIC_NON_CMS",
  "REDIRECTED_HISTORICAL",
  "REMOVED_OR_404",
  "UNKNOWN",
] as const;
export type SeoResearchGscUrlClass = (typeof SEO_RESEARCH_GSC_URL_CLASSES)[number];

export type SeoResearchGscEvidence = {
  id: string;
  kind: SeoResearchGscEvidenceKind;
  query?: string;
  pageUrl?: string;
  normalizedPath?: string | null;
  classification?: SeoResearchGscUrlClass;
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
  clicksDirection?: "UP" | "DOWN" | "FLAT" | null;
  impressionsDirection?: "UP" | "DOWN" | "FLAT" | null;
  ctrDirection?: "UP" | "DOWN" | "FLAT" | null;
  positionDirection?: "UP" | "DOWN" | "FLAT" | null;
};

export type SeoResearchGscMeta = {
  status: SeoResearchGscStatus;
  statusLabel: string;
  helperText: string;
  window?: {
    recentStart: string;
    recentEnd: string;
    previousStart: string;
    previousEnd: string;
    reportingLagDays: number;
  };
  country?: {
    code: "GB";
    expression: "gbr";
  };
};

export const SEO_RESEARCH_INTENTS = [
  "INFORMATIONAL",
  "COMMERCIAL",
  "SETUP",
  "TROUBLESHOOTING",
  "COMPARISON",
  "NAVIGATIONAL",
] as const;
export type SeoResearchIntent = (typeof SEO_RESEARCH_INTENTS)[number];

export const SEO_RESEARCH_CONFIDENCE = ["HIGH", "MEDIUM", "LOW"] as const;
export type SeoResearchConfidence = (typeof SEO_RESEARCH_CONFIDENCE)[number];

export const SEO_RESEARCH_COVERAGE = [
  "NONE",
  "PARTIAL",
  "STRONG",
] as const;
export type SeoResearchCoverage = (typeof SEO_RESEARCH_COVERAGE)[number];

export const SEO_RESEARCH_FIELD_CAPS = {
  topic: 120,
  workingTitle: 140,
  whyNow: 280,
  webEvidence: 360,
  existingCoverageNote: 280,
  matchedTitle: 160,
  matchedPublicUrl: 300,
  restorePath: 300,
  suggestedAngle: 280,
  nextStep: 220,
  opportunityCount: 5,
  sourceTitle: 160,
  sourceUrl: 400,
  sourceCount: 24,
  gscEvidenceRefs: 8,
} as const;

export type SeoResearchOpportunity = {
  topic: string;
  workingTitle: string;
  searchIntent: SeoResearchIntent;
  whyNow: string;
  webEvidence: string;
  existingCoverage: SeoResearchCoverage;
  matchedTitle: string | null;
  matchedPublicUrl: string | null;
  recommendation: SeoResearchRecommendation;
  /** Normalized historical path when recommendation is RESTORE_HISTORICAL; otherwise "". */
  restorePath: string;
  suggestedAngle: string;
  nextStep: string;
  confidence: SeoResearchConfidence;
  /** Validated server-side GSC evidence IDs (Q# / P# / QP#). */
  gscEvidenceRefs: string[];
  /** Server-resolved factual GSC rows for UI — never model-authored metrics. */
  gscEvidence: SeoResearchGscEvidence[];
  /** Deterministic historical URL signal (not a restore recommendation). */
  historicalSignal: boolean;
};

export type SeoResearchSource = {
  title: string;
  url: string;
  domain: string;
};

export type SeoResearchResult = {
  opportunities: SeoResearchOpportunity[];
  sources: SeoResearchSource[];
  /** Compact GSC run meta — present after GSC-4 research fusion. */
  gsc?: SeoResearchGscMeta;
};

export const SEO_RESEARCH_SYSTEM_INSTRUCTION = [
  "You are Sidhu AI SEO Assistant researching current UK content opportunities for The Flix IPTV.",
  "Use live web research (Current Web Evidence), the supplied current-site content inventory (Existing Flix Coverage), and supplied GSC evidence when available.",
  "Find useful topics relevant to legitimate IPTV/streaming setup, compatible devices/apps, playback quality, troubleshooting, product education and related UK user needs.",
  "Do not manufacture search volume, ranking data, Google Trends values, GSC metrics (clicks, impressions, CTR, position), traffic or competitor analytics.",
  "When GSC evidence is supplied, treat those metrics as factual. Reference them only by the supplied evidence IDs (Q#, P#, QP#).",
  "Attach only materially related GSC evidence IDs in gscEvidenceRefs (maximum 8 per opportunity). Do not attach every top GSC row to every opportunity.",
  "Absence from the bounded GSC rows does NOT prove zero search demand.",
  "Do not recommend a new article when existing Flix content or overlapping GSC intent substantially covers the same search intent; prefer refresh or internal-link recommendations.",
  "Historical or redirected GSC URL evidence may affect assessment, but REDIRECTED_HISTORICAL does NOT automatically mean restore content.",
  "UNKNOWN does not mean 404. Root / redirecting to /welcome/ is current site architecture, never a restoration candidate.",
  "RESTORE_HISTORICAL may only be used when restorePath exactly matches one of the supplied restorationCandidates. Do not infer another historical path.",
  "restorationCandidates are eligibility possibilities, not commands to restore. Prefer REFRESH_EXISTING or INTERNAL_LINK_ONLY when strong current coverage exists.",
  "For RESTORE_HISTORICAL, include relevant page-bearing evidence IDs (P# / QP#) for that restorePath. For all other recommendations, restorePath must be an empty string.",
  "When discussing GSC in narrative fields, stay qualitative and reference evidence IDs rather than inventing numeric values.",
  "Distinguish current web evidence, existing Flix coverage, and GSC evidence from inference.",
  "Avoid keyword stuffing, sensational clickbait and unsupported claims.",
  "Return a small number of actionable opportunities for human editorial review.",
  "Nothing you return is permission to publish automatically.",
  "matchedPublicUrl must be empty string unless it exactly matches a publicUrl from the supplied inventory.",
].join(" ");

export const SEO_RESEARCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["opportunities"],
  properties: {
    opportunities: {
      type: "array",
      maxItems: SEO_RESEARCH_FIELD_CAPS.opportunityCount,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "topic",
          "workingTitle",
          "searchIntent",
          "whyNow",
          "webEvidence",
          "existingCoverage",
          "matchedTitle",
          "matchedPublicUrl",
          "recommendation",
          "restorePath",
          "suggestedAngle",
          "nextStep",
          "confidence",
          "gscEvidenceRefs",
        ],
        properties: {
          topic: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.topic },
          workingTitle: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.workingTitle },
          searchIntent: { type: "string", enum: [...SEO_RESEARCH_INTENTS] },
          whyNow: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.whyNow },
          webEvidence: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.webEvidence },
          existingCoverage: { type: "string", enum: [...SEO_RESEARCH_COVERAGE] },
          matchedTitle: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.matchedTitle },
          matchedPublicUrl: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.matchedPublicUrl },
          recommendation: { type: "string", enum: [...SEO_RESEARCH_RECOMMENDATIONS] },
          restorePath: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.restorePath },
          suggestedAngle: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.suggestedAngle },
          nextStep: { type: "string", maxLength: SEO_RESEARCH_FIELD_CAPS.nextStep },
          confidence: { type: "string", enum: [...SEO_RESEARCH_CONFIDENCE] },
          gscEvidenceRefs: {
            type: "array",
            maxItems: SEO_RESEARCH_FIELD_CAPS.gscEvidenceRefs,
            items: { type: "string", maxLength: 12 },
          },
        },
      },
    },
  },
} as const;

function trimTo(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

export function normalizePublicPath(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      let path = url.pathname || "/";
      if (!path.endsWith("/")) path = `${path}/`;
      return path;
    }
  } catch {
    return "";
  }
  let path = raw.split("?")[0]?.split("#")[0] || "";
  if (!path.startsWith("/")) return "";
  if (!path.endsWith("/")) path = `${path}/`;
  return path;
}

export function normalizeSeoResearchSources(raw: unknown): SeoResearchSource[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SeoResearchSource[] = [];
  for (const item of raw) {
    if (out.length >= SEO_RESEARCH_FIELD_CAPS.sourceCount) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = trimTo(row.url ?? row.href, SEO_RESEARCH_FIELD_CAPS.sourceUrl);
    if (!url || !isSafeHttpUrl(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const domain = domainFromUrl(url);
    const title = trimTo(row.title, SEO_RESEARCH_FIELD_CAPS.sourceTitle) || domain || url;
    out.push({ title, url, domain });
  }
  return out;
}

export type NormalizeSeoResearchOptions = {
  /**
   * Server GSC evidence catalog for this run (id → factual row).
   * When omitted, any model gscEvidenceRefs are discarded.
   */
  gscEvidenceById?: ReadonlyMap<string, SeoResearchGscEvidence>;
  /** Compact GSC run meta attached to the normalized result. */
  gscMeta?: SeoResearchGscMeta;
  /**
   * Server-owned RESTORE_HISTORICAL path allowlist for this run.
   * When omitted/empty, RESTORE_HISTORICAL cannot validate.
   */
  restorationPathAllowlist?: ReadonlySet<string>;
};

/**
 * Normalize model JSON against the allowlisted Flix public URLs.
 * GSC evidence refs are resolved against the server catalog when provided.
 * RESTORE_HISTORICAL is server-gated via restorationPathAllowlist.
 * Returns null when the payload is malformed.
 */
export function normalizeSeoResearchResult(
  raw: unknown,
  allowlistedPublicUrls: ReadonlySet<string>,
  options?: NormalizeSeoResearchOptions,
): SeoResearchResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.opportunities)) return null;
  if (Object.keys(data).some((key) => key !== "opportunities")) return null;

  const gscById = options?.gscEvidenceById;
  const restoreAllowlist = options?.restorationPathAllowlist ?? new Set<string>();
  const opportunities: SeoResearchOpportunity[] = [];
  for (const item of data.opportunities.slice(0, SEO_RESEARCH_FIELD_CAPS.opportunityCount)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const unexpected = Object.keys(row).filter(
      (key) =>
        ![
          "topic",
          "workingTitle",
          "searchIntent",
          "whyNow",
          "webEvidence",
          "existingCoverage",
          "matchedTitle",
          "matchedPublicUrl",
          "recommendation",
          "restorePath",
          "suggestedAngle",
          "nextStep",
          "confidence",
          "gscEvidenceRefs",
        ].includes(key),
    );
    if (unexpected.length) return null;

    const topic = trimTo(row.topic, SEO_RESEARCH_FIELD_CAPS.topic);
    const workingTitle = trimTo(row.workingTitle, SEO_RESEARCH_FIELD_CAPS.workingTitle);
    const whyNow = trimTo(row.whyNow, SEO_RESEARCH_FIELD_CAPS.whyNow);
    const webEvidence = trimTo(row.webEvidence, SEO_RESEARCH_FIELD_CAPS.webEvidence);
    const suggestedAngle = trimTo(row.suggestedAngle, SEO_RESEARCH_FIELD_CAPS.suggestedAngle);
    const nextStep = trimTo(row.nextStep, SEO_RESEARCH_FIELD_CAPS.nextStep);
    if (!topic || !workingTitle || !whyNow || !webEvidence || !suggestedAngle || !nextStep) return null;
    if (!isEnum(row.searchIntent, SEO_RESEARCH_INTENTS)) return null;
    if (!isEnum(row.existingCoverage, SEO_RESEARCH_COVERAGE)) return null;
    if (!isEnum(row.recommendation, SEO_RESEARCH_RECOMMENDATIONS)) return null;
    if (!isEnum(row.confidence, SEO_RESEARCH_CONFIDENCE)) return null;

    if (typeof row.restorePath !== "string") return null;
    const restorePathRaw = normalizePublicPath(
      trimTo(row.restorePath, SEO_RESEARCH_FIELD_CAPS.restorePath),
    );
    // Empty restorePath stays ""; non-empty must normalize to a path.
    const restorePath =
      String(row.restorePath).replace(/\s+/g, " ").trim() === "" ? "" : restorePathRaw;
    if (String(row.restorePath).replace(/\s+/g, " ").trim() !== "" && !restorePath) return null;

    const matchedTitleRaw = trimTo(row.matchedTitle, SEO_RESEARCH_FIELD_CAPS.matchedTitle);
    const matchedUrlRaw = normalizePublicPath(
      trimTo(row.matchedPublicUrl, SEO_RESEARCH_FIELD_CAPS.matchedPublicUrl),
    );

    let matchedTitle: string | null = matchedTitleRaw || null;
    let matchedPublicUrl: string | null = null;

    if (row.recommendation === "RESTORE_HISTORICAL") {
      if (!restorePath || !restoreAllowlist.has(restorePath)) return null;
      if (matchedUrlRaw) return null;
      if (row.existingCoverage === "STRONG") return null;
      matchedTitle = matchedTitleRaw || null;
      matchedPublicUrl = null;
    } else {
      if (restorePath !== "") return null;
      if (
        row.recommendation === "REFRESH_EXISTING" ||
        row.recommendation === "INTERNAL_LINK_ONLY"
      ) {
        if (!matchedUrlRaw || !allowlistedPublicUrls.has(matchedUrlRaw)) {
          // Unsupported internal mapping — reject the whole payload rather than invent coverage.
          return null;
        }
        matchedPublicUrl = matchedUrlRaw;
        if (!matchedTitle) matchedTitle = matchedUrlRaw;
      } else if (matchedUrlRaw) {
        if (!allowlistedPublicUrls.has(matchedUrlRaw)) {
          matchedTitle = null;
          matchedPublicUrl = null;
        } else {
          matchedPublicUrl = matchedUrlRaw;
        }
      }
    }

    const resolved = resolveOpportunityGscRefs(row.gscEvidenceRefs, gscById);

    if (row.recommendation === "RESTORE_HISTORICAL") {
      const pageBearingMatch = resolved.resolved.some(
        (record) =>
          (record.kind === "page" || record.kind === "query_page") &&
          (record.normalizedPath || "") === restorePath,
      );
      if (!pageBearingMatch) return null;
    }

    opportunities.push({
      topic,
      workingTitle,
      searchIntent: row.searchIntent,
      whyNow,
      webEvidence,
      existingCoverage: row.existingCoverage,
      matchedTitle,
      matchedPublicUrl,
      recommendation: row.recommendation,
      restorePath,
      suggestedAngle,
      nextStep,
      confidence: row.confidence,
      gscEvidenceRefs: resolved.refs,
      gscEvidence: resolved.resolved,
      historicalSignal: resolved.historicalSignal,
    });
  }

  return {
    opportunities,
    sources: [],
    ...(options?.gscMeta ? { gsc: options.gscMeta } : {}),
  };
}

function resolveOpportunityGscRefs(
  rawRefs: unknown,
  byId: ReadonlyMap<string, SeoResearchGscEvidence> | undefined,
): { refs: string[]; resolved: SeoResearchGscEvidence[]; historicalSignal: boolean } {
  if (!Array.isArray(rawRefs) || !byId || byId.size === 0) {
    return { refs: [], resolved: [], historicalSignal: false };
  }

  const seen = new Set<string>();
  const refs: string[] = [];
  const resolved: SeoResearchGscEvidence[] = [];
  const max = SEO_RESEARCH_FIELD_CAPS.gscEvidenceRefs;

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
    // Root `/` → `/welcome/` is architecture, not restore-worthy historical content.
    return (record.normalizedPath || "") !== "/";
  });

  return { refs, resolved, historicalSignal };
}
