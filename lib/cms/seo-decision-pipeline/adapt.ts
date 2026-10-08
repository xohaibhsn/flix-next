/**
 * Pure mapping helpers for Decision Pipeline Adapter V1.
 * Zero I/O. Translates Research → Governor / NBA / Priority inputs only.
 */

import { createHash } from "node:crypto";
import {
  normalizePublicPath,
  type SeoResearchGscEvidence,
  type SeoResearchOpportunity,
  type SeoResearchRecommendation,
} from "@/lib/cms/ai-seo/research-schemas";
import {
  blogPostPath,
  migratePublicBlogPath,
} from "@/lib/cms/blog-paths";
import { gscKnownHistoricalPathSet } from "@/lib/cms/gsc/historical-registry";
import { withSlash } from "@/lib/cms/redirects";
import { slugify } from "@/lib/cms/slug";
import { normalizePlanningTopicKey } from "@/lib/cms/seo-planning/fingerprint";
import type {
  SeoNextBestActionInput,
  SeoNextBestConfidence,
  SeoNextBestCoverage,
} from "@/lib/cms/seo-next-best-action/types";
import type {
  SeoRefreshFirstCorpusCandidate,
  SeoRefreshFirstGscOwnershipEvidence,
  SeoRefreshFirstHistoricalCandidate,
  SeoRefreshFirstInput,
  SeoRefreshFirstResult,
} from "@/lib/cms/seo-refresh-first/types";
import type {
  SeoPriorityGscEvidence,
  SeoPriorityInput,
  SeoPriorityOpportunitySlice,
} from "@/lib/cms/seo-priority/types";
import type { SeoNextBestActionDecision } from "@/lib/cms/seo-next-best-action/types";
import type { SeoPlanningDraft } from "@/lib/cms/types";
import {
  SEO_DECISION_PIPELINE_CAPS,
  SEO_DECISION_PIPELINE_VERSION,
  type SeoDecisionPipelineBlogIdentity,
  type SeoDecisionPipelineOpportunitySlice,
  type SeoDecisionPipelineResolvedTarget,
} from "@/lib/cms/seo-decision-pipeline/types";

function trimText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Normalize public/blog paths using project rules (/blogs/, legacy /blog/, slash, host). */
export function normalizeDecisionPipelinePath(value: unknown): string {
  const raw = trimText(value, SEO_DECISION_PIPELINE_CAPS.url);
  if (!raw) return "";
  const fromPublic = normalizePublicPath(raw);
  const path =
    fromPublic ||
    (raw.startsWith("/") ? withSlash(raw.split("?")[0]?.split("#")[0] || "/") : "");
  if (!path) return "";
  return withSlash(migratePublicBlogPath(path));
}

/**
 * Derive proposedSlug only for NEW_BLOG-oriented evaluation.
 * Same semantics as Planning Proceed: slugify(workingTitle).
 */
export function deriveProposedSlugForNewBlog(
  opportunity: Pick<SeoResearchOpportunity, "recommendation" | "workingTitle" | "topic">,
): string | undefined {
  if (opportunity.recommendation !== "NEW_BLOG") return undefined;
  const title = trimText(opportunity.workingTitle, SEO_DECISION_PIPELINE_CAPS.workingTitle);
  if (!title) return undefined;
  const slug = slugify(title);
  return slug || undefined;
}

/**
 * Authoritative target resolution against the FULL lightweight corpus.
 * Does not depend on the Governor ≤20 candidate window.
 */
export function resolveSeoDecisionPipelineTarget(args: {
  matchedPublicUrl?: string | null;
  proposedSlug?: string;
  blogIdentities: readonly SeoDecisionPipelineBlogIdentity[];
}): SeoDecisionPipelineResolvedTarget | null {
  const identities = args.blogIdentities || [];
  if (identities.length === 0) return null;

  const matchedPath = normalizeDecisionPipelinePath(args.matchedPublicUrl);
  if (matchedPath) {
    const byUrl = identities.filter((row) => {
      const pub = normalizeDecisionPipelinePath(row.publicUrl);
      const can = normalizeDecisionPipelinePath(row.canonicalUrl);
      return pub === matchedPath || (can && can === matchedPath);
    });
    if (byUrl.length === 1) {
      const hit = byUrl[0];
      return {
        postId: hit.postId,
        publicUrl: hit.publicUrl,
        slug: hit.slug,
        status: hit.status,
        title: hit.title,
      };
    }
    if (byUrl.length > 1) {
      const published = byUrl.filter((r) => String(r.status).toLowerCase() === "published");
      const preferred = published.length === 1 ? published[0] : byUrl[0];
      return {
        postId: preferred.postId,
        publicUrl: preferred.publicUrl,
        slug: preferred.slug,
        status: preferred.status,
        title: preferred.title,
      };
    }
  }

  const proposed = slugify(trimText(args.proposedSlug, SEO_DECISION_PIPELINE_CAPS.slug));
  if (proposed) {
    const proposedPath = normalizeDecisionPipelinePath(blogPostPath(proposed));
    const bySlug = identities.filter((row) => {
      const slug = slugify(row.slug);
      const pub = normalizeDecisionPipelinePath(row.publicUrl);
      return slug === proposed || pub === proposedPath;
    });
    if (bySlug.length === 1) {
      const hit = bySlug[0];
      return {
        postId: hit.postId,
        publicUrl: hit.publicUrl,
        slug: hit.slug,
        status: hit.status,
        title: hit.title,
      };
    }
    if (bySlug.length > 1) {
      const published = bySlug.filter((r) => String(r.status).toLowerCase() === "published");
      const preferred = published.length === 1 ? published[0] : bySlug[0];
      return {
        postId: preferred.postId,
        publicUrl: preferred.publicUrl,
        slug: preferred.slug,
        status: preferred.status,
        title: preferred.title,
      };
    }
  }

  return null;
}

/**
 * Ensure an exact resolved target is present in the Governor candidate window.
 * Cap remains ≤20 — may replace the last candidate when needed.
 */
export function ensureTargetInCandidates(
  candidates: SeoRefreshFirstCorpusCandidate[],
  target: SeoDecisionPipelineResolvedTarget | null,
  identity: SeoDecisionPipelineBlogIdentity | null,
): SeoRefreshFirstCorpusCandidate[] {
  const max = SEO_DECISION_PIPELINE_CAPS.maxCandidates;
  const base = [...(candidates || [])].slice(0, max);
  if (!target) return base;
  if (base.some((c) => c.postId === target.postId)) return base;

  const injected: SeoRefreshFirstCorpusCandidate = identity
    ? {
        postId: identity.postId,
        publicUrl: identity.publicUrl,
        title: identity.title || undefined,
        slug: identity.slug || undefined,
        seoTitle: identity.seoTitle,
        canonicalUrl: identity.canonicalUrl,
        status: identity.status,
        categoryName: identity.categoryName,
        excerpt: identity.excerpt,
      }
    : {
        postId: target.postId,
        publicUrl: target.publicUrl,
        slug: target.slug,
        status: target.status,
        title: target.title,
      };

  if (base.length < max) return [...base, injected];
  const withoutLast = base.slice(0, max - 1);
  return [...withoutLast, injected];
}

/**
 * Map Research GSC evidence → Governor ownership evidence.
 * Only CURRENT_CMS with proven related query/page ownership.
 */
export function mapResearchGscToRefreshOwnership(args: {
  gscEvidence: readonly SeoResearchGscEvidence[] | undefined;
  matchedPublicUrl?: string | null;
  blogIdentities: readonly SeoDecisionPipelineBlogIdentity[];
}): SeoRefreshFirstGscOwnershipEvidence[] {
  const out: SeoRefreshFirstGscOwnershipEvidence[] = [];
  const matchedPath = normalizeDecisionPipelinePath(args.matchedPublicUrl);
  const byPath = new Map<string, string>();
  for (const row of args.blogIdentities || []) {
    const pub = normalizeDecisionPipelinePath(row.publicUrl);
    const can = normalizeDecisionPipelinePath(row.canonicalUrl);
    if (pub) byPath.set(pub, row.postId);
    if (can) byPath.set(can, row.postId);
  }

  for (const row of args.gscEvidence || []) {
    if (out.length >= SEO_DECISION_PIPELINE_CAPS.maxGscEvidence) break;
    if (row.classification !== "CURRENT_CMS") continue;
    const normalizedPath = normalizeDecisionPipelinePath(row.normalizedPath || row.pageUrl);
    if (!normalizedPath) continue;

    const isQueryPage = row.kind === "query_page";
    const isMatchedPage =
      row.kind === "page" && matchedPath !== "" && normalizedPath === matchedPath;
    if (!isQueryPage && !isMatchedPage) continue;

    out.push({
      normalizedPath,
      classification: "CURRENT_CMS",
      ownsRelatedQueryPage: true,
      evidenceId: trimText(row.id, 40) || undefined,
      relatedPostId: byPath.get(normalizedPath),
    });
  }
  return out;
}

/**
 * Deterministic historical candidate from Research path + registry + GSC classification.
 * AI RESTORE alone never sets restoreEligible=true.
 */
export function mapResearchHistoricalCandidate(args: {
  opportunity: Pick<
    SeoResearchOpportunity,
    "restorePath" | "historicalSignal" | "recommendation" | "gscEvidence"
  >;
}): SeoRefreshFirstHistoricalCandidate | null {
  const path = normalizeDecisionPipelinePath(args.opportunity.restorePath);
  if (!path || path === "/") return null;

  const registry = gscKnownHistoricalPathSet();
  const registryEntry = registry.get(path);
  const registryMatch = Boolean(registryEntry);

  let classification = "";
  let historicalKey = registryEntry?.key || "";
  for (const row of args.opportunity.gscEvidence || []) {
    const rowPath = normalizeDecisionPipelinePath(row.normalizedPath || row.pageUrl);
    if (rowPath !== path) continue;
    if (row.classification) classification = row.classification;
    if (row.historicalKey) historicalKey = row.historicalKey;
    break;
  }

  if (!classification && registryMatch) {
    classification = "REMOVED_OR_404";
  }

  const classificationEligible = classification === "REMOVED_OR_404";
  // Fail-closed: restoreEligible requires registry + REMOVED_OR_404 (+ optional key).
  const restoreEligible =
    registryMatch && classificationEligible && Boolean(historicalKey || registryEntry?.key);

  return {
    path,
    registryKey: historicalKey || registryEntry?.key || undefined,
    classification: classification || undefined,
    restoreEligible,
    dispositionHint: restoreEligible ? "RECREATE" : undefined,
  };
}

export function mapResearchGscToPriorityEvidence(
  gscEvidence: readonly SeoResearchGscEvidence[] | undefined,
): SeoPriorityGscEvidence[] {
  const out: SeoPriorityGscEvidence[] = [];
  for (const row of gscEvidence || []) {
    if (out.length >= SEO_DECISION_PIPELINE_CAPS.maxGscEvidence) break;
    out.push({
      id: row.id,
      kind: row.kind,
      query: row.query,
      pageUrl: row.pageUrl,
      normalizedPath: row.normalizedPath ?? null,
      classification: row.classification,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      clicksDirection: row.clicksDirection ?? null,
      impressionsDirection: row.impressionsDirection ?? null,
      ctrDirection: row.ctrDirection ?? null,
      positionDirection: row.positionDirection ?? null,
    });
  }
  return out;
}

/**
 * Extract Planning reservation keys from active NEW_BLOG drafts only.
 * REFRESH/RESTORE/INTERNAL drafts do not reserve new-topic slots.
 */
export function extractPlanningReservationKeys(
  drafts: readonly SeoPlanningDraft[],
  max = SEO_DECISION_PIPELINE_CAPS.maxReservations,
): {
  reservedTopicKeys: string[];
  reservedSlugs: string[];
  truncated: boolean;
} {
  const topicKeys: string[] = [];
  const slugs: string[] = [];
  const seenTopic = new Set<string>();
  const seenSlug = new Set<string>();
  let newBlogCount = 0;
  let truncated = false;

  for (const draft of drafts || []) {
    if (String(draft.recommendation || "") !== "NEW_BLOG") continue;
    newBlogCount += 1;
    if (newBlogCount > max) {
      truncated = true;
      continue;
    }

    const topicKey = normalizePlanningTopicKey(
      trimText(draft.topic, SEO_DECISION_PIPELINE_CAPS.topic),
    );
    if (topicKey && topicKey !== "topic" && !seenTopic.has(topicKey)) {
      seenTopic.add(topicKey);
      topicKeys.push(topicKey);
    }

    const slug = slugify(trimText(draft.proposedSlug, SEO_DECISION_PIPELINE_CAPS.slug));
    if (slug && !seenSlug.has(slug)) {
      seenSlug.add(slug);
      slugs.push(slug);
    }
  }

  return { reservedTopicKeys: topicKeys, reservedSlugs: slugs, truncated };
}

export function extractDraftBlogReservations(
  identities: readonly SeoDecisionPipelineBlogIdentity[],
  max = SEO_DECISION_PIPELINE_CAPS.maxReservations,
): { draftSlugs: string[]; draftTopicKeys: string[] } {
  const draftSlugs: string[] = [];
  const draftTopicKeys: string[] = [];
  const seenSlug = new Set<string>();
  const seenTopic = new Set<string>();

  for (const row of identities || []) {
    if (String(row.status || "").toLowerCase() !== "draft") continue;
    const slug = slugify(row.slug);
    if (slug && !seenSlug.has(slug) && draftSlugs.length < max) {
      seenSlug.add(slug);
      draftSlugs.push(slug);
    }
    const topicKey = normalizePlanningTopicKey(row.title || row.slug);
    if (topicKey && topicKey !== "topic" && !seenTopic.has(topicKey) && draftTopicKeys.length < max) {
      seenTopic.add(topicKey);
      draftTopicKeys.push(topicKey);
    }
  }
  return { draftSlugs, draftTopicKeys };
}

export function compactOpportunitySlice(
  opportunity: SeoResearchOpportunity,
): SeoDecisionPipelineOpportunitySlice {
  return {
    topic: trimText(opportunity.topic, SEO_DECISION_PIPELINE_CAPS.topic),
    workingTitle: trimText(opportunity.workingTitle, SEO_DECISION_PIPELINE_CAPS.workingTitle),
    searchIntent: opportunity.searchIntent,
    recommendation: opportunity.recommendation,
    existingCoverage: opportunity.existingCoverage ?? null,
    matchedPublicUrl: opportunity.matchedPublicUrl ?? null,
    restorePath: opportunity.restorePath || "",
    confidence: opportunity.confidence,
    whyNow: trimText(opportunity.whyNow, 280),
    webEvidence: trimText(opportunity.webEvidence, 360),
    gscEvidenceRefs: [...(opportunity.gscEvidenceRefs || [])].slice(
      0,
      SEO_DECISION_PIPELINE_CAPS.maxGscEvidence,
    ),
    historicalSignal: Boolean(opportunity.historicalSignal),
  };
}

/**
 * Deterministic opportunity identity — no UUID, no timestamps.
 */
export function buildSeoDecisionOpportunityIdentity(
  opportunity: Pick<
    SeoResearchOpportunity,
    | "topic"
    | "workingTitle"
    | "recommendation"
    | "matchedPublicUrl"
    | "restorePath"
    | "gscEvidenceRefs"
  >,
): string {
  const refs = [...(opportunity.gscEvidenceRefs || [])]
    .map((id) => trimText(id, 24))
    .filter(Boolean)
    .sort()
    .join(",");
  const material = [
    "seo-opp-id",
    slugify(trimText(opportunity.topic, SEO_DECISION_PIPELINE_CAPS.topic)) || "",
    slugify(trimText(opportunity.workingTitle, SEO_DECISION_PIPELINE_CAPS.workingTitle)) || "",
    trimText(opportunity.recommendation, 40),
    normalizeDecisionPipelinePath(opportunity.matchedPublicUrl) || "",
    normalizeDecisionPipelinePath(opportunity.restorePath) || "",
    refs,
  ].join("|");
  return createHash("sha256")
    .update(material.slice(0, SEO_DECISION_PIPELINE_CAPS.opportunityFingerprintMaterial), "utf8")
    .digest("hex");
}

export function buildSeoDecisionPipelineFingerprint(args: {
  pipelineVersion?: string;
  opportunityIdentity: string;
  refreshFingerprint: string | null | undefined;
  nbaDecisionFingerprint: string | null | undefined;
  priorityFingerprint: string | null | undefined;
}): string {
  const material = [
    "seo-decision-pipeline",
    args.pipelineVersion || SEO_DECISION_PIPELINE_VERSION,
    args.opportunityIdentity || "",
    args.refreshFingerprint || "",
    args.nbaDecisionFingerprint || "",
    args.priorityFingerprint || "",
  ].join("|");
  return createHash("sha256").update(material, "utf8").digest("hex");
}

export function validateResearchOpportunity(
  opportunity: SeoResearchOpportunity | null | undefined,
): { ok: true } | { ok: false; errorCode: string; errorMessage: string } {
  if (!opportunity || typeof opportunity !== "object") {
    return {
      ok: false,
      errorCode: "opportunity_missing",
      errorMessage: "Opportunity is missing or invalid.",
    };
  }
  const topic = trimText(opportunity.topic, SEO_DECISION_PIPELINE_CAPS.topic);
  const workingTitle = trimText(
    opportunity.workingTitle,
    SEO_DECISION_PIPELINE_CAPS.workingTitle,
  );
  if (!topic) {
    return {
      ok: false,
      errorCode: "topic_missing",
      errorMessage: "Opportunity topic is required.",
    };
  }
  if (!workingTitle) {
    return {
      ok: false,
      errorCode: "working_title_missing",
      errorMessage: "Opportunity workingTitle is required.",
    };
  }
  const recommendation = trimText(opportunity.recommendation, 40) as SeoResearchRecommendation;
  if (!recommendation) {
    return {
      ok: false,
      errorCode: "recommendation_missing",
      errorMessage: "Opportunity recommendation is required.",
    };
  }
  if (recommendation === "NEW_BLOG") {
    const slug = slugify(workingTitle);
    if (!slug) {
      return {
        ok: false,
        errorCode: "proposed_slug_invalid",
        errorMessage: "NEW_BLOG workingTitle could not produce a stable slug.",
      };
    }
  }
  return { ok: true };
}

function confidenceOf(
  value: unknown,
): SeoNextBestConfidence | undefined {
  if (value === "HIGH" || value === "MEDIUM" || value === "LOW") return value;
  return undefined;
}

function coverageOf(value: unknown): SeoNextBestCoverage | undefined {
  if (value === "NONE" || value === "PARTIAL" || value === "STRONG") return value;
  return undefined;
}

export function buildRefreshFirstInput(args: {
  opportunity: SeoResearchOpportunity;
  proposedSlug?: string;
  target: SeoDecisionPipelineResolvedTarget | null;
  candidates: SeoRefreshFirstCorpusCandidate[];
  gscOwnership: SeoRefreshFirstGscOwnershipEvidence[];
  historical: SeoRefreshFirstHistoricalCandidate | null;
  reservations: SeoRefreshFirstInput["reservations"];
  corpusComplete: boolean;
}): SeoRefreshFirstInput {
  const opp = args.opportunity;
  const gscPresent = (opp.gscEvidence || []).length > 0;
  return {
    opportunity: {
      topic: trimText(opp.topic, SEO_DECISION_PIPELINE_CAPS.topic),
      workingTitle: trimText(opp.workingTitle, SEO_DECISION_PIPELINE_CAPS.workingTitle),
      proposedSlug: args.proposedSlug,
      searchIntent: opp.searchIntent,
      existingCoverage: opp.existingCoverage,
      matchedPublicUrl: opp.matchedPublicUrl,
      confidence: opp.confidence,
      whyNow: opp.whyNow,
      webEvidence: opp.webEvidence,
      webEvidencePresent: Boolean(trimText(opp.webEvidence, 360)),
      gscOpportunityEvidencePresent: gscPresent,
    },
    targetPostId: args.target?.postId || null,
    candidates: args.candidates,
    gscOwnership: args.gscOwnership,
    historical: args.historical,
    reservations: args.reservations,
    corpusComplete: args.corpusComplete,
    signals: { duplicate: false, cannibalizationRisk: false },
  };
}

/**
 * Build NBA input from Research + Governor + resolved target.
 * Research recommendation is a signal only — never a forced final action.
 * SKIP translates to NBA HOLD-compatible evidence semantics (existing NBA fixture pattern).
 */
export function buildNextBestActionInput(args: {
  opportunity: SeoResearchOpportunity;
  refreshFirst: SeoRefreshFirstResult;
  target: SeoDecisionPipelineResolvedTarget | null;
  historical: SeoRefreshFirstHistoricalCandidate | null;
  opportunityIdentity: string;
  runId?: string;
}): SeoNextBestActionInput {
  const opp = args.opportunity;
  const rf = args.refreshFirst;
  const recommendation = opp.recommendation;
  const isSkip = recommendation === "SKIP";
  const isInternalLink = recommendation === "INTERNAL_LINK_ONLY";

  const hist = args.historical;
  const restoreEligible = Boolean(hist?.restoreEligible);
  const registryMatch = Boolean(hist?.registryKey);
  const classificationEligible = hist?.classification === "REMOVED_OR_404";

  // Invalid RESTORE must fail closed — never become autonomous NEW_BLOG via content-gap fallthrough.
  const isInvalidRestore =
    recommendation === "RESTORE_HISTORICAL" && !restoreEligible;

  const gscPresent = (opp.gscEvidence || []).length > 0;
  const webPresent = Boolean(trimText(opp.webEvidence, 360));

  // SKIP / invalid RESTORE → NBA HOLD semantics: do not claim material evidence for NEW_BLOG path.
  const holdStyle = isSkip || isInvalidRestore;
  const nbaGscPresent = holdStyle ? false : gscPresent;
  const nbaWebPresent = holdStyle ? false : webPresent;

  // Demote PASS for NBA only (RF result remains authoritative in pipeline output).
  let nbaVerdict = rf.verdict;
  if (holdStyle && nbaVerdict === "PASS_NEW_CONTENT") {
    nbaVerdict = "UNKNOWN";
  }

  return {
    opportunity: {
      recommendation,
      topic: trimText(opp.topic, SEO_DECISION_PIPELINE_CAPS.topic),
      workingTitle: holdStyle
        ? undefined
        : trimText(opp.workingTitle, SEO_DECISION_PIPELINE_CAPS.workingTitle),
      confidence: confidenceOf(opp.confidence),
      existingCoverage: coverageOf(opp.existingCoverage),
      matchedPublicUrl: opp.matchedPublicUrl,
      restorePath: opp.restorePath || undefined,
      whyNow: holdStyle ? undefined : opp.whyNow,
      webEvidence: holdStyle ? undefined : opp.webEvidence,
      gscEvidencePresent: nbaGscPresent,
    },
    corpus: {
      matchedPostId: args.target?.postId || rf.target?.postId || null,
      matchedUrl: args.target?.publicUrl || rf.target?.publicUrl || opp.matchedPublicUrl || null,
      existingCoverage: coverageOf(opp.existingCoverage),
      duplicate: Boolean(rf.evidence.duplicate),
      cannibalizationRisk: Boolean(rf.evidence.cannibalizationRisk),
    },
    refreshFirst: { verdict: nbaVerdict },
    technical: isInternalLink ? { internalLinkOnly: true } : undefined,
    historical:
      hist && (opp.restorePath || recommendation === "RESTORE_HISTORICAL")
        ? {
            registryMatch,
            classificationEligible,
            restoreEligible,
            path: hist.path,
            preferredDisposition: restoreEligible ? "RECREATE" : undefined,
          }
        : hist && restoreEligible
          ? {
              registryMatch,
              classificationEligible,
              restoreEligible,
              path: hist.path,
              preferredDisposition: "RECREATE",
            }
          : undefined,
    evidence: {
      gscPresent: nbaGscPresent,
      webEvidencePresent: nbaWebPresent,
      corpusEvidencePresent: Boolean(
        args.target?.postId || rf.target?.postId || opp.matchedPublicUrl || opp.existingCoverage,
      ),
    },
    source: {
      runId: args.runId,
      opportunityFingerprint: args.opportunityIdentity,
    },
  };
}

export function buildPriorityInput(args: {
  decision: SeoNextBestActionDecision;
  refreshFirst: SeoRefreshFirstResult;
  opportunity: SeoResearchOpportunity;
  opportunityIdentity: string;
  runId?: string;
}): SeoPriorityInput {
  const opp = args.opportunity;
  const slice: SeoPriorityOpportunitySlice = {
    topic: trimText(opp.topic, SEO_DECISION_PIPELINE_CAPS.topic),
    whyNow: opp.whyNow,
    webEvidence: opp.webEvidence,
    existingCoverage: opp.existingCoverage,
    searchIntent: opp.searchIntent,
    recommendation: opp.recommendation,
    confidence: opp.confidence,
    webEvidencePresent: Boolean(trimText(opp.webEvidence, 360)),
    gscEvidencePresent: (opp.gscEvidence || []).length > 0,
  };
  return {
    decision: args.decision,
    refreshFirst: args.refreshFirst,
    opportunity: slice,
    gscEvidence: mapResearchGscToPriorityEvidence(opp.gscEvidence),
    source: {
      runId: args.runId,
      opportunityFingerprint: args.opportunityIdentity,
    },
  };
}
