import {
  SEO_RESEARCH_CONFIDENCE,
  SEO_RESEARCH_COVERAGE,
  SEO_RESEARCH_GSC_EVIDENCE_KINDS,
  SEO_RESEARCH_GSC_STATUSES,
  SEO_RESEARCH_GSC_URL_CLASSES,
  SEO_RESEARCH_INTENTS,
  SEO_RESEARCH_RECOMMENDATIONS,
  normalizePublicPath,
  type SeoResearchConfidence,
  type SeoResearchCoverage,
  type SeoResearchGscEvidence,
  type SeoResearchGscMeta,
  type SeoResearchIntent,
  type SeoResearchRecommendation,
  type SeoResearchSource,
} from "@/lib/cms/ai-seo/research-schemas";
import {
  SEO_PLANNING_DEFAULT_WORKFLOW,
  SEO_PLANNING_FIELD_CAPS,
  isSeoPlanningActionableRecommendation,
} from "@/lib/cms/seo-planning/constants";
import { normalizePlanningRestorePath } from "@/lib/cms/seo-planning/fingerprint";
import { slugify } from "@/lib/cms/slug";
import {
  SEO_PLANNING_WORKFLOW_STATUSES,
  type SeoPlanningDraft,
  type SeoPlanningWorkflowStatus,
} from "@/lib/cms/types";
import { sanitizeText } from "@/lib/cms/validation";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  const text = typeof value === "string" ? value.trim() : "";
  return (allowed as readonly string[]).includes(text) ? (text as T) : null;
}

function boundedNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export type ProceedOpportunityInput = {
  recommendation: SeoResearchRecommendation;
  topic: string;
  workingTitle: string;
  searchIntent: SeoResearchIntent;
  whyNow: string;
  webEvidence: string;
  existingCoverage: SeoResearchCoverage;
  matchedTitle: string | null;
  matchedPublicUrl: string | null;
  restorePath: string;
  suggestedAngle: string;
  nextStep: string;
  confidence: SeoResearchConfidence;
  gscEvidenceRefs: string[];
  gscEvidence: SeoResearchGscEvidence[];
  historicalSignal: boolean;
  /** Optional client-proposed slug for NEW_BLOG; otherwise derived from workingTitle. */
  proposedSlug?: string;
};

export function parseProceedOpportunityInput(
  raw: unknown,
): { ok: true; value: ProceedOpportunityInput } | { ok: false; error: string } {
  const row = asRecord(raw);
  if (!row) return { ok: false, error: "Opportunity data is missing." };

  const recommendation = oneOf(row.recommendation, SEO_RESEARCH_RECOMMENDATIONS);
  if (!recommendation) return { ok: false, error: "Unsupported recommendation." };
  if (recommendation === "SKIP") {
    return { ok: false, error: "Skip recommendations do not create planning drafts." };
  }
  if (!isSeoPlanningActionableRecommendation(recommendation)) {
    return { ok: false, error: "Unsupported recommendation." };
  }

  const topic = sanitizeText(row.topic, SEO_PLANNING_FIELD_CAPS.topic).trim();
  const workingTitle = sanitizeText(row.workingTitle, SEO_PLANNING_FIELD_CAPS.workingTitle).trim();
  if (!topic || !workingTitle) {
    return { ok: false, error: "Topic and working title are required." };
  }

  const searchIntent = oneOf(row.searchIntent, SEO_RESEARCH_INTENTS) || "INFORMATIONAL";
  const confidence = oneOf(row.confidence, SEO_RESEARCH_CONFIDENCE) || "LOW";
  const existingCoverage = oneOf(row.existingCoverage, SEO_RESEARCH_COVERAGE) || "NONE";
  const matchedTitleRaw = sanitizeText(row.matchedTitle, SEO_PLANNING_FIELD_CAPS.matchedTitle).trim();
  const matchedPublicUrlRaw = normalizePublicPath(
    sanitizeText(row.matchedPublicUrl, SEO_PLANNING_FIELD_CAPS.matchedPublicUrl),
  );
  const restorePath =
    recommendation === "RESTORE_HISTORICAL"
      ? normalizePlanningRestorePath(
          sanitizeText(row.restorePath, SEO_PLANNING_FIELD_CAPS.restorePath),
        )
      : "";
  const proposedSlug = slugify(
    sanitizeText(row.proposedSlug, SEO_PLANNING_FIELD_CAPS.proposedSlug) || workingTitle,
  );

  return {
    ok: true,
    value: {
      recommendation,
      topic,
      workingTitle,
      searchIntent,
      whyNow: sanitizeText(row.whyNow, SEO_PLANNING_FIELD_CAPS.whyNow).trim(),
      webEvidence: sanitizeText(row.webEvidence, SEO_PLANNING_FIELD_CAPS.webEvidence).trim(),
      existingCoverage,
      matchedTitle: matchedTitleRaw || null,
      matchedPublicUrl: matchedPublicUrlRaw || null,
      restorePath,
      suggestedAngle: sanitizeText(row.suggestedAngle, SEO_PLANNING_FIELD_CAPS.suggestedAngle).trim(),
      nextStep: sanitizeText(row.nextStep, SEO_PLANNING_FIELD_CAPS.nextStep).trim(),
      confidence,
      gscEvidenceRefs: sanitizeGscEvidenceRefs(row.gscEvidenceRefs),
      gscEvidence: sanitizeGscEvidenceRows(row.gscEvidence),
      historicalSignal: Boolean(row.historicalSignal),
      proposedSlug: proposedSlug || undefined,
    },
  };
}

function sanitizeGscEvidenceRefs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= SEO_PLANNING_FIELD_CAPS.gscEvidenceRefs) break;
    const id = sanitizeText(item, SEO_PLANNING_FIELD_CAPS.evidenceId).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function sanitizeGscEvidenceRows(raw: unknown): SeoResearchGscEvidence[] {
  if (!Array.isArray(raw)) return [];
  const out: SeoResearchGscEvidence[] = [];
  for (const item of raw) {
    if (out.length >= SEO_PLANNING_FIELD_CAPS.gscEvidenceRows) break;
    const row = asRecord(item);
    if (!row) continue;
    const id = sanitizeText(row.id, SEO_PLANNING_FIELD_CAPS.evidenceId).trim();
    const kind = oneOf(row.kind, SEO_RESEARCH_GSC_EVIDENCE_KINDS);
    if (!id || !kind) continue;
    const classification = oneOf(row.classification, SEO_RESEARCH_GSC_URL_CLASSES) || undefined;
    out.push({
      id,
      kind,
      query: sanitizeText(row.query, SEO_PLANNING_FIELD_CAPS.evidenceQuery).trim() || undefined,
      pageUrl: sanitizeText(row.pageUrl, SEO_PLANNING_FIELD_CAPS.matchedPublicUrl).trim() || undefined,
      normalizedPath:
        normalizePlanningRestorePath(
          sanitizeText(row.normalizedPath, SEO_PLANNING_FIELD_CAPS.restorePath),
        ) || null,
      classification,
      redirectDestination:
        normalizePublicPath(
          sanitizeText(row.redirectDestination, SEO_PLANNING_FIELD_CAPS.evidenceRedirect),
        ) || undefined,
      historicalKey:
        sanitizeText(row.historicalKey, SEO_PLANNING_FIELD_CAPS.evidenceHistoricalKey).trim() ||
        undefined,
      clicks: boundedNumber(row.clicks),
      impressions: boundedNumber(row.impressions),
      ctr: boundedNumber(row.ctr),
      position: boundedNumber(row.position),
    });
  }
  return out;
}

export function sanitizeProceedSources(raw: unknown): SeoResearchSource[] {
  if (!Array.isArray(raw)) return [];
  const out: SeoResearchSource[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= SEO_PLANNING_FIELD_CAPS.sources) break;
    const row = asRecord(item);
    if (!row) continue;
    const url = sanitizeText(row.url, SEO_PLANNING_FIELD_CAPS.sourceUrl).trim();
    if (!url || !isSafeHttpUrl(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: sanitizeText(row.title, SEO_PLANNING_FIELD_CAPS.sourceTitle).trim() || url,
      url,
      domain: sanitizeText(row.domain, 120).trim(),
    });
  }
  return out;
}

export function sanitizeProceedGscMeta(raw: unknown): SeoResearchGscMeta | undefined {
  const row = asRecord(raw);
  if (!row) return undefined;
  const status = oneOf(row.status, SEO_RESEARCH_GSC_STATUSES);
  if (!status) return undefined;
  const windowRow = asRecord(row.window);
  const countryRow = asRecord(row.country);
  return {
    status,
    statusLabel: sanitizeText(row.statusLabel, SEO_PLANNING_FIELD_CAPS.statusLabel).trim(),
    helperText: sanitizeText(row.helperText, SEO_PLANNING_FIELD_CAPS.helperText).trim(),
    window: windowRow
      ? {
          recentStart: sanitizeText(windowRow.recentStart, 32).trim(),
          recentEnd: sanitizeText(windowRow.recentEnd, 32).trim(),
          previousStart: sanitizeText(windowRow.previousStart, 32).trim(),
          previousEnd: sanitizeText(windowRow.previousEnd, 32).trim(),
          reportingLagDays: Math.max(0, Math.min(30, Math.floor(boundedNumber(windowRow.reportingLagDays)))),
        }
      : undefined,
    country:
      countryRow && countryRow.code === "GB" && countryRow.expression === "gbr"
        ? { code: "GB", expression: "gbr" }
        : undefined,
  };
}

export function buildPlanningPayload(args: {
  opportunity: ProceedOpportunityInput;
  sources: SeoResearchSource[];
  gsc?: SeoResearchGscMeta;
}): Record<string, unknown> {
  return {
    opportunity: {
      topic: args.opportunity.topic,
      workingTitle: args.opportunity.workingTitle,
      searchIntent: args.opportunity.searchIntent,
      whyNow: args.opportunity.whyNow,
      webEvidence: args.opportunity.webEvidence,
      existingCoverage: args.opportunity.existingCoverage,
      matchedTitle: args.opportunity.matchedTitle,
      matchedPublicUrl: args.opportunity.matchedPublicUrl,
      recommendation: args.opportunity.recommendation,
      restorePath: args.opportunity.restorePath,
      suggestedAngle: args.opportunity.suggestedAngle,
      nextStep: args.opportunity.nextStep,
      confidence: args.opportunity.confidence,
      gscEvidenceRefs: args.opportunity.gscEvidenceRefs,
      gscEvidence: args.opportunity.gscEvidence,
      historicalSignal: args.opportunity.historicalSignal,
    },
    sources: args.sources,
    ...(args.gsc ? { gsc: args.gsc } : {}),
  };
}

export function sanitizeSeoPlanningDraft(input: SeoPlanningDraft): SeoPlanningDraft {
  const workflow =
    oneOf(input.workflowStatus, SEO_PLANNING_WORKFLOW_STATUSES) || SEO_PLANNING_DEFAULT_WORKFLOW;
  const recommendation = sanitizeText(input.recommendation, SEO_PLANNING_FIELD_CAPS.recommendation).trim();
  const now = new Date().toISOString();
  let payload: Record<string, unknown> = {};
  if (input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)) {
    payload = input.payload as Record<string, unknown>;
  } else if (typeof input.payload === "string") {
    try {
      const parsed = JSON.parse(input.payload);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      payload = {};
    }
  }

  return {
    id: sanitizeText(input.id, SEO_PLANNING_FIELD_CAPS.id).trim(),
    recommendation,
    workflowStatus: workflow as SeoPlanningWorkflowStatus,
    fingerprint: sanitizeText(input.fingerprint, SEO_PLANNING_FIELD_CAPS.fingerprint).trim(),
    topic: sanitizeText(input.topic, SEO_PLANNING_FIELD_CAPS.topic).trim(),
    workingTitle: sanitizeText(input.workingTitle, SEO_PLANNING_FIELD_CAPS.workingTitle).trim(),
    proposedSlug: slugify(sanitizeText(input.proposedSlug, SEO_PLANNING_FIELD_CAPS.proposedSlug)) || "",
    targetPostId: sanitizeText(input.targetPostId, SEO_PLANNING_FIELD_CAPS.targetPostId).trim() || null,
    matchedPublicUrl:
      normalizePublicPath(
        sanitizeText(input.matchedPublicUrl, SEO_PLANNING_FIELD_CAPS.matchedPublicUrl),
      ) || "",
    restorePath: normalizePlanningRestorePath(
      sanitizeText(input.restorePath, SEO_PLANNING_FIELD_CAPS.restorePath),
    ),
    searchIntent: sanitizeText(input.searchIntent, SEO_PLANNING_FIELD_CAPS.searchIntent).trim(),
    linkedPostId: sanitizeText(input.linkedPostId, SEO_PLANNING_FIELD_CAPS.linkedPostId).trim() || null,
    createdBy: sanitizeText(input.createdBy, SEO_PLANNING_FIELD_CAPS.createdBy).trim(),
    createdAt: sanitizeText(input.createdAt, 40).trim() || now,
    updatedAt: sanitizeText(input.updatedAt, 40).trim() || now,
    payload,
  };
}
