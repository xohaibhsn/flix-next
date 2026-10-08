/**
 * SEO Opportunity Priority Score V1 — pure scoreSeoPriority().
 * Input → serializable result. Zero writes, zero providers, zero network.
 *
 * Eligibility is NEVER recalculated. automationSelectable mirrors NBA:
 *   action === "NEW_BLOG" && autonomousEligible === true
 */

import { createHash } from "node:crypto";
import type { SeoNextBestAction, SeoNextBestConfidence } from "@/lib/cms/seo-next-best-action/types";
import {
  SEO_PRIORITY_CAPS,
  SEO_PRIORITY_SCORE_VERSION,
  type SeoPriorityComponent,
  type SeoPriorityComponentName,
  type SeoPriorityEffort,
  type SeoPriorityEvidenceCompleteness,
  type SeoPriorityGscEvidence,
  type SeoPriorityInput,
  type SeoPriorityOpportunitySlice,
  type SeoPriorityResult,
  type SeoPriorityTier,
} from "@/lib/cms/seo-priority/types";
import {
  CONFIDENCE_POINTS_HIGH,
  CONFIDENCE_POINTS_LOW,
  CONFIDENCE_POINTS_MEDIUM,
  COVERAGE_DEFERRED_BASE,
  COVERAGE_HISTORICAL_ELIGIBLE,
  COVERAGE_HOLD_BASE,
  COVERAGE_INTERNAL_BASE,
  COVERAGE_NEW_BLOG_NO_PASS,
  COVERAGE_NEW_BLOG_PASS_NONE,
  COVERAGE_NEW_BLOG_PASS_PARTIAL,
  COVERAGE_REFRESH_CLEAR_TARGET,
  COVERAGE_REFRESH_SOFT_TARGET,
  COVERAGE_TITLE_META_BASE,
  CTR_LOW_MAX,
  CTR_MID_MAX,
  CTR_POINTS_HIGH,
  CTR_POINTS_LOW_WITH_IMPRESSIONS,
  CTR_POINTS_MID,
  CTR_POINTS_NONE,
  DEMAND_POINTS_EXPLICIT_WEB_FLAG,
  DEMAND_POINTS_GSC_PRESENT_FLAG,
  DEMAND_POINTS_MATERIAL_WEB,
  DEMAND_POINTS_MATERIAL_WHY,
  IMPRESSIONS_BUCKET_LOW_MAX,
  IMPRESSIONS_BUCKET_MODERATE_MAX,
  IMPRESSIONS_BUCKET_NONE_MAX,
  IMPRESSIONS_BUCKET_STRONG_MAX,
  IMPRESSIONS_POINTS_LOW,
  IMPRESSIONS_POINTS_MODERATE,
  IMPRESSIONS_POINTS_NONE,
  IMPRESSIONS_POINTS_STRONG,
  IMPRESSIONS_POINTS_VERY_STRONG,
  MAX_CONFIDENCE_POINTS,
  MAX_COVERAGE_POINTS,
  MAX_DEMAND_POINTS,
  MAX_MOMENTUM_POINTS,
  MAX_OPPORTUNITY_POINTS,
  MAX_RISK_PENALTY,
  MOMENTUM_POINTS_DOWN_OTHER,
  MOMENTUM_POINTS_DOWN_REFRESH,
  MOMENTUM_POINTS_FLAT,
  MOMENTUM_POINTS_NONE,
  MOMENTUM_POINTS_UP,
  OPPORTUNITY_BASE_DEFERRED,
  OPPORTUNITY_BASE_HISTORICAL,
  OPPORTUNITY_BASE_HOLD,
  OPPORTUNITY_BASE_INTERNAL,
  OPPORTUNITY_BASE_NEW_BLOG,
  OPPORTUNITY_BASE_REFRESH,
  OPPORTUNITY_BASE_TITLE_META,
  POSITION_MID_MAX,
  POSITION_POINTS_FAR,
  POSITION_POINTS_MID,
  POSITION_POINTS_STRONG,
  POSITION_POINTS_UNAVAILABLE,
  POSITION_POINTS_WEAK,
  POSITION_STRONG_MAX,
  POSITION_WEAK_MAX,
  RISK_HOLD_STATUS,
  RISK_INCOMPLETE_CORPUS,
  RISK_MISSING_GSC_WHEN_EXPECTED,
  RISK_MISSING_REFRESH,
  RISK_MISSING_TARGET,
  RISK_NBA_BLOCKERS,
  RISK_REFRESH_CANNIBALIZATION,
  RISK_REFRESH_DUPLICATE,
  RISK_REFRESH_UNKNOWN,
  RISK_SPARSE_RESEARCH,
  SEO_PRIORITY_SCORE_MAX,
  SEO_PRIORITY_SCORE_MIN,
  SEO_PRIORITY_TIER_HIGH_MIN,
  SEO_PRIORITY_TIER_MEDIUM_MIN,
} from "@/lib/cms/seo-priority/weights";

function trimText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function hasMaterialNarrative(value: unknown): boolean {
  const text = trimText(value, SEO_PRIORITY_CAPS.narrative);
  if (text.length < 12) return false;
  if (/^(n\/?a|none|tbd|todo|placeholder|-|—)$/i.test(text)) return false;
  return true;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function tierFromScore(score: number): SeoPriorityTier {
  const s = clampInt(score, SEO_PRIORITY_SCORE_MIN, SEO_PRIORITY_SCORE_MAX);
  if (s >= SEO_PRIORITY_TIER_HIGH_MIN) return "HIGH";
  if (s >= SEO_PRIORITY_TIER_MEDIUM_MIN) return "MEDIUM";
  return "LOW";
}

export function isAutomationSelectable(decision: {
  action: SeoNextBestAction;
  autonomousEligible: boolean;
}): boolean {
  return decision.action === "NEW_BLOG" && decision.autonomousEligible === true;
}

function boundGsc(list: SeoPriorityGscEvidence[] | undefined): SeoPriorityGscEvidence[] {
  const out: SeoPriorityGscEvidence[] = [];
  for (const row of list || []) {
    if (out.length >= SEO_PRIORITY_CAPS.maxGscEvidence) break;
    if (!row || typeof row !== "object") continue;
    out.push({
      id: trimText(row.id, 40) || undefined,
      kind: trimText(row.kind, 24) || undefined,
      query: trimText(row.query, 120) || undefined,
      pageUrl: trimText(row.pageUrl, 300) || undefined,
      normalizedPath: trimText(row.normalizedPath, 300) || null,
      classification: trimText(row.classification, 40) || undefined,
      clicks: Number.isFinite(row.clicks) ? Math.max(0, Number(row.clicks)) : undefined,
      impressions: Number.isFinite(row.impressions) ? Math.max(0, Number(row.impressions)) : undefined,
      ctr: Number.isFinite(row.ctr) ? Math.max(0, Number(row.ctr)) : undefined,
      position: Number.isFinite(row.position) ? Math.max(0, Number(row.position)) : undefined,
      clicksDirection: row.clicksDirection ?? null,
      impressionsDirection: row.impressionsDirection ?? null,
      ctrDirection: row.ctrDirection ?? null,
      positionDirection: row.positionDirection ?? null,
    });
  }
  return out;
}

export type ImpressionsBucket = "NONE" | "LOW" | "MODERATE" | "STRONG" | "VERY_STRONG";

export function impressionsBucket(maxImpressions: number): ImpressionsBucket {
  const n = Number.isFinite(maxImpressions) ? Math.max(0, maxImpressions) : 0;
  if (n <= IMPRESSIONS_BUCKET_NONE_MAX) return "NONE";
  if (n <= IMPRESSIONS_BUCKET_LOW_MAX) return "LOW";
  if (n <= IMPRESSIONS_BUCKET_MODERATE_MAX) return "MODERATE";
  if (n <= IMPRESSIONS_BUCKET_STRONG_MAX) return "STRONG";
  return "VERY_STRONG";
}

export function impressionsPoints(bucket: ImpressionsBucket): number {
  switch (bucket) {
    case "NONE":
      return IMPRESSIONS_POINTS_NONE;
    case "LOW":
      return IMPRESSIONS_POINTS_LOW;
    case "MODERATE":
      return IMPRESSIONS_POINTS_MODERATE;
    case "STRONG":
      return IMPRESSIONS_POINTS_STRONG;
    case "VERY_STRONG":
      return IMPRESSIONS_POINTS_VERY_STRONG;
  }
}

export type PositionBucket = "STRONG" | "MID" | "WEAK" | "FAR" | "UNAVAILABLE";

export function positionBucket(position: number | null | undefined): PositionBucket {
  if (position == null || !Number.isFinite(position) || position <= 0) return "UNAVAILABLE";
  if (position <= POSITION_STRONG_MAX) return "STRONG";
  if (position <= POSITION_MID_MAX) return "MID";
  if (position <= POSITION_WEAK_MAX) return "WEAK";
  return "FAR";
}

export function positionPoints(bucket: PositionBucket): number {
  switch (bucket) {
    case "STRONG":
      return POSITION_POINTS_STRONG;
    case "MID":
      return POSITION_POINTS_MID;
    case "WEAK":
      return POSITION_POINTS_WEAK;
    case "FAR":
      return POSITION_POINTS_FAR;
    case "UNAVAILABLE":
      return POSITION_POINTS_UNAVAILABLE;
  }
}

function maxImpressions(gsc: SeoPriorityGscEvidence[]): number {
  let max = 0;
  for (const row of gsc) {
    if (typeof row.impressions === "number" && row.impressions > max) max = row.impressions;
  }
  return max;
}

function bestPosition(gsc: SeoPriorityGscEvidence[]): number | null {
  let best: number | null = null;
  for (const row of gsc) {
    if (typeof row.position !== "number" || row.position <= 0) continue;
    if (best == null || row.position < best) best = row.position;
  }
  return best;
}

function avgCtrAmongImpressed(gsc: SeoPriorityGscEvidence[]): number | null {
  let sum = 0;
  let n = 0;
  for (const row of gsc) {
    if (typeof row.ctr !== "number") continue;
    if ((row.impressions || 0) <= 0 && (row.clicks || 0) <= 0) continue;
    sum += row.ctr;
    n += 1;
  }
  return n ? sum / n : null;
}

function confidencePoints(confidence: SeoNextBestConfidence): number {
  if (confidence === "HIGH") return CONFIDENCE_POINTS_HIGH;
  if (confidence === "MEDIUM") return CONFIDENCE_POINTS_MEDIUM;
  return CONFIDENCE_POINTS_LOW;
}

function effortForAction(action: SeoNextBestAction): SeoPriorityEffort {
  switch (action) {
    case "TITLE_META_UPDATE":
      return "LOW";
    case "INTERNAL_LINKS":
      return "LOW";
    case "REFRESH_EXISTING":
      return "MEDIUM";
    case "HISTORICAL_RECOVERY":
      return "MEDIUM";
    case "TECHNICAL_FIX":
    case "INDEXING_REVIEW":
      return "MEDIUM";
    case "IMAGE":
    case "NEW_BLOG":
      return "HIGH";
    case "DO_NOTHING":
    default:
      return "LOW";
  }
}

function isContentFamily(action: SeoNextBestAction): boolean {
  return (
    action === "NEW_BLOG" ||
    action === "REFRESH_EXISTING" ||
    action === "HISTORICAL_RECOVERY" ||
    action === "INTERNAL_LINKS" ||
    action === "TITLE_META_UPDATE"
  );
}

function isDeferredFamily(action: SeoNextBestAction): boolean {
  return action === "TECHNICAL_FIX" || action === "INDEXING_REVIEW" || action === "IMAGE";
}

function gscExpectedForAction(action: SeoNextBestAction): boolean {
  return (
    action === "REFRESH_EXISTING" ||
    action === "TITLE_META_UPDATE" ||
    action === "HISTORICAL_RECOVERY"
  );
}

function targetPresent(decision: SeoPriorityInput["decision"]): boolean {
  const t = decision.target;
  if (!t || t.kind === "none") return false;
  if (t.kind === "blog_post") return Boolean(t.postId);
  if (t.kind === "historical_path") return Boolean(t.path);
  if (t.kind === "new_topic") return Boolean(t.topic);
  return false;
}

function component(
  name: SeoPriorityComponentName,
  points: number,
  maxPoints: number,
  explain: string,
): SeoPriorityComponent {
  return {
    name,
    points: clampInt(points, name === "risk" ? -maxPoints : 0, name === "risk" ? 0 : maxPoints),
    maxPoints,
    explain: trimText(explain, SEO_PRIORITY_CAPS.componentExplain),
  };
}

function scoreDemand(
  opp: SeoPriorityOpportunitySlice | undefined,
  gsc: SeoPriorityGscEvidence[],
  decision: SeoPriorityInput["decision"],
): SeoPriorityComponent {
  let points = 0;
  const parts: string[] = [];
  if (hasMaterialNarrative(opp?.webEvidence) || decision.evidence.webEvidencePresent) {
    points += DEMAND_POINTS_MATERIAL_WEB;
    parts.push("material web evidence");
  } else if (opp?.webEvidencePresent) {
    points += DEMAND_POINTS_EXPLICIT_WEB_FLAG;
    parts.push("web evidence flag");
  }
  if (hasMaterialNarrative(opp?.whyNow)) {
    points += DEMAND_POINTS_MATERIAL_WHY;
    parts.push("whyNow");
  }
  const impBucket = impressionsBucket(maxImpressions(gsc));
  const impPts = impressionsPoints(impBucket);
  if (impPts > 0) {
    points += Math.min(impPts, 8);
    parts.push(`GSC impressions ${impBucket.toLowerCase()}`);
  } else if (decision.evidence.gscPresent || opp?.gscEvidencePresent) {
    points += DEMAND_POINTS_GSC_PRESENT_FLAG;
    parts.push("GSC present");
  }
  points = Math.min(points, MAX_DEMAND_POINTS);
  return component(
    "demand",
    points,
    MAX_DEMAND_POINTS,
    parts.length ? parts.join("; ") : "limited demand evidence",
  );
}

function scoreOpportunity(
  action: SeoNextBestAction,
  gsc: SeoPriorityGscEvidence[],
): SeoPriorityComponent {
  let base = OPPORTUNITY_BASE_HOLD;
  if (action === "NEW_BLOG") base = OPPORTUNITY_BASE_NEW_BLOG;
  else if (action === "REFRESH_EXISTING") base = OPPORTUNITY_BASE_REFRESH;
  else if (action === "HISTORICAL_RECOVERY") base = OPPORTUNITY_BASE_HISTORICAL;
  else if (action === "INTERNAL_LINKS") base = OPPORTUNITY_BASE_INTERNAL;
  else if (action === "TITLE_META_UPDATE") base = OPPORTUNITY_BASE_TITLE_META;
  else if (isDeferredFamily(action)) base = OPPORTUNITY_BASE_DEFERRED;

  let gscAdd = 0;
  const parts: string[] = [`${action} base`];
  if (gsc.length) {
    const pos = positionBucket(bestPosition(gsc));
    const posPts = positionPoints(pos);
    if (posPts > 0) {
      gscAdd += posPts;
      parts.push(`position ${pos.toLowerCase()}`);
    }
    const imp = impressionsPoints(impressionsBucket(maxImpressions(gsc)));
    // Impressions already contribute to demand; keep a smaller additive here.
    const impOpp = Math.min(4, Math.floor(imp / 3));
    if (impOpp > 0) {
      gscAdd += impOpp;
      parts.push("impression support");
    }
    if (action === "TITLE_META_UPDATE" || action === "REFRESH_EXISTING") {
      const ctr = avgCtrAmongImpressed(gsc);
      const maxImp = maxImpressions(gsc);
      let ctrPts = CTR_POINTS_NONE;
      if (ctr != null && maxImp > IMPRESSIONS_BUCKET_LOW_MAX) {
        if (ctr <= CTR_LOW_MAX) ctrPts = CTR_POINTS_LOW_WITH_IMPRESSIONS;
        else if (ctr <= CTR_MID_MAX) ctrPts = CTR_POINTS_MID;
        else ctrPts = CTR_POINTS_HIGH;
      }
      if (ctrPts > 0) {
        gscAdd += ctrPts;
        parts.push("CTR support");
      }
    }
  }

  const points = Math.min(MAX_OPPORTUNITY_POINTS, base + gscAdd);
  return component("opportunity", points, MAX_OPPORTUNITY_POINTS, parts.join("; "));
}

function scoreConfidence(confidence: SeoNextBestConfidence): SeoPriorityComponent {
  const points = confidencePoints(confidence);
  return component("confidence", points, MAX_CONFIDENCE_POINTS, `NBA confidence ${confidence}`);
}

function scoreCoverage(
  input: SeoPriorityInput,
  action: SeoNextBestAction,
): SeoPriorityComponent {
  const rf = input.refreshFirst;
  const coverage =
    input.opportunity?.existingCoverage ?? input.decision.evidence.existingCoverage ?? null;

  if (action === "NEW_BLOG") {
    if (rf?.verdict === "PASS_NEW_CONTENT" && coverage === "NONE") {
      return component(
        "coverageDistinctness",
        COVERAGE_NEW_BLOG_PASS_NONE,
        MAX_COVERAGE_POINTS,
        "Governor PASS + coverage NONE",
      );
    }
    if (rf?.verdict === "PASS_NEW_CONTENT") {
      return component(
        "coverageDistinctness",
        COVERAGE_NEW_BLOG_PASS_PARTIAL,
        MAX_COVERAGE_POINTS,
        "Governor PASS with non-NONE coverage label",
      );
    }
    return component(
      "coverageDistinctness",
      COVERAGE_NEW_BLOG_NO_PASS,
      MAX_COVERAGE_POINTS,
      "NEW_BLOG without Governor PASS",
    );
  }

  if (action === "REFRESH_EXISTING") {
    if (targetPresent(input.decision) || rf?.target?.postId) {
      return component(
        "coverageDistinctness",
        COVERAGE_REFRESH_CLEAR_TARGET,
        MAX_COVERAGE_POINTS,
        "clear existing Blog target",
      );
    }
    return component(
      "coverageDistinctness",
      COVERAGE_REFRESH_SOFT_TARGET,
      MAX_COVERAGE_POINTS,
      "refresh without clear target id",
    );
  }

  if (action === "HISTORICAL_RECOVERY") {
    const eligible = Boolean(rf?.historicalCandidate?.restoreEligible) || Boolean(input.decision.evidence.historicalPath);
    return component(
      "coverageDistinctness",
      eligible ? COVERAGE_HISTORICAL_ELIGIBLE : COVERAGE_HOLD_BASE,
      MAX_COVERAGE_POINTS,
      eligible ? "historical restore path present" : "historical signal weak",
    );
  }

  if (action === "INTERNAL_LINKS") {
    return component("coverageDistinctness", COVERAGE_INTERNAL_BASE, MAX_COVERAGE_POINTS, "internal-link action");
  }
  if (action === "TITLE_META_UPDATE") {
    return component("coverageDistinctness", COVERAGE_TITLE_META_BASE, MAX_COVERAGE_POINTS, "metadata action");
  }
  if (isDeferredFamily(action)) {
    return component("coverageDistinctness", COVERAGE_DEFERRED_BASE, MAX_COVERAGE_POINTS, "deferred family base");
  }
  return component("coverageDistinctness", COVERAGE_HOLD_BASE, MAX_COVERAGE_POINTS, "hold/do-nothing coverage");
}

function scoreMomentum(action: SeoNextBestAction, gsc: SeoPriorityGscEvidence[]): SeoPriorityComponent {
  if (!gsc.length) {
    return component("momentum", MOMENTUM_POINTS_NONE, MAX_MOMENTUM_POINTS, "no trend evidence");
  }
  const dirs = gsc.flatMap((r) =>
    [r.impressionsDirection, r.clicksDirection, r.positionDirection].filter(Boolean),
  ) as Array<"UP" | "DOWN" | "FLAT">;
  if (!dirs.length) {
    return component("momentum", MOMENTUM_POINTS_NONE, MAX_MOMENTUM_POINTS, "trend unavailable");
  }
  const up = dirs.filter((d) => d === "UP").length;
  const down = dirs.filter((d) => d === "DOWN").length;
  const flat = dirs.filter((d) => d === "FLAT").length;

  if (action === "REFRESH_EXISTING" && down >= up && down > 0) {
    return component(
      "momentum",
      MOMENTUM_POINTS_DOWN_REFRESH,
      MAX_MOMENTUM_POINTS,
      "declining GSC momentum favors refresh urgency",
    );
  }
  if (action === "NEW_BLOG" && up > down) {
    return component("momentum", MOMENTUM_POINTS_UP, MAX_MOMENTUM_POINTS, "rising demand momentum");
  }
  if (down > up) {
    return component(
      "momentum",
      MOMENTUM_POINTS_DOWN_OTHER,
      MAX_MOMENTUM_POINTS,
      "net declining momentum",
    );
  }
  if (up > down) {
    return component("momentum", MOMENTUM_POINTS_UP, MAX_MOMENTUM_POINTS, "net rising momentum");
  }
  if (flat > 0) {
    return component("momentum", MOMENTUM_POINTS_FLAT, MAX_MOMENTUM_POINTS, "flat momentum");
  }
  return component("momentum", MOMENTUM_POINTS_NONE, MAX_MOMENTUM_POINTS, "neutral momentum");
}

function scoreRisk(
  input: SeoPriorityInput,
  gsc: SeoPriorityGscEvidence[],
  missing: string[],
): SeoPriorityComponent {
  let penalty = 0;
  const parts: string[] = [];
  const action = input.decision.action;
  const rf = input.refreshFirst;

  if (!rf) {
    if (isContentFamily(action)) {
      penalty += RISK_MISSING_REFRESH;
      parts.push("missing Refresh-First");
      missing.push("refreshFirst");
    }
  } else {
    if (rf.verdict === "UNKNOWN") {
      penalty += RISK_REFRESH_UNKNOWN;
      parts.push("Refresh UNKNOWN");
    }
    if (rf.verdict === "DUPLICATE" || rf.evidence.duplicate) {
      penalty += RISK_REFRESH_DUPLICATE;
      parts.push("duplicate risk");
    }
    if (rf.verdict === "CANNIBALIZATION_RISK" || rf.evidence.cannibalizationRisk) {
      penalty += RISK_REFRESH_CANNIBALIZATION;
      parts.push("cannibalization risk");
    }
    if (rf.evidence.corpusComplete === false && action === "NEW_BLOG") {
      penalty += RISK_INCOMPLETE_CORPUS;
      parts.push("incomplete corpus");
    }
  }

  if (gscExpectedForAction(action) && gsc.length === 0 && !input.decision.evidence.gscPresent) {
    penalty += RISK_MISSING_GSC_WHEN_EXPECTED;
    parts.push("missing GSC");
    missing.push("gscEvidence");
  }

  const sparseResearch =
    !hasMaterialNarrative(input.opportunity?.whyNow) &&
    !hasMaterialNarrative(input.opportunity?.webEvidence) &&
    !input.decision.evidence.webEvidencePresent;
  if (isContentFamily(action) && sparseResearch && gsc.length === 0) {
    penalty += RISK_SPARSE_RESEARCH;
    parts.push("sparse research");
    missing.push("researchEvidence");
  }

  if (
    (action === "REFRESH_EXISTING" || action === "HISTORICAL_RECOVERY") &&
    !targetPresent(input.decision)
  ) {
    penalty += RISK_MISSING_TARGET;
    parts.push("missing target");
    missing.push("target");
  }

  if (input.decision.blockers.length > 0) {
    penalty += RISK_NBA_BLOCKERS;
    parts.push("NBA blockers");
  }
  if (input.decision.status === "HOLD" || action === "DO_NOTHING") {
    penalty += RISK_HOLD_STATUS;
    parts.push("hold/do-nothing");
  }

  penalty = Math.min(MAX_RISK_PENALTY, penalty);
  return component(
    "risk",
    -penalty,
    MAX_RISK_PENALTY,
    parts.length ? parts.join("; ") : "no material risk penalties",
  );
}

function evidenceCompletenessOf(
  input: SeoPriorityInput,
  gsc: SeoPriorityGscEvidence[],
  missing: string[],
): SeoPriorityEvidenceCompleteness {
  const action = input.decision.action;
  const hasRf = Boolean(input.refreshFirst);
  const hasResearch =
    hasMaterialNarrative(input.opportunity?.whyNow) ||
    hasMaterialNarrative(input.opportunity?.webEvidence) ||
    input.decision.evidence.webEvidencePresent;
  const hasGsc = gsc.length > 0 || input.decision.evidence.gscPresent;

  if (!isContentFamily(action)) {
    if (missing.length >= 2) return "MINIMAL";
    return hasRf || hasResearch ? "PARTIAL" : "MINIMAL";
  }

  const expectedGsc = gscExpectedForAction(action);
  if (hasRf && hasResearch && (!expectedGsc || hasGsc) && missing.length === 0) {
    return "FULL";
  }
  if (hasResearch || hasGsc || hasRf) {
    return "PARTIAL";
  }
  return "MINIMAL";
}

function buildReason(
  action: SeoNextBestAction,
  tier: SeoPriorityTier,
  components: SeoPriorityComponent[],
): string {
  const positives = components
    .filter((c) => c.name !== "risk" && c.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((c) => c.explain);
  const risk = components.find((c) => c.name === "risk");
  const head =
    tier === "HIGH"
      ? "High priority"
      : tier === "MEDIUM"
        ? "Medium priority"
        : "Low priority";
  let text = `${head} for ${action}`;
  if (positives.length) text += `: ${positives.join("; ")}`;
  if (risk && risk.points < 0) text += `. Risk: ${risk.explain}`;
  return trimText(text, SEO_PRIORITY_CAPS.reason);
}

export function buildSeoPriorityFingerprint(args: {
  scoreVersion: string;
  decisionFingerprint: string;
  refreshFingerprint?: string | null;
  action: SeoNextBestAction;
  score: number;
  tier: SeoPriorityTier;
  automationSelectable: boolean;
  evidenceCompleteness: SeoPriorityEvidenceCompleteness;
  effort: SeoPriorityEffort;
  componentPoints: Array<{ name: string; points: number }>;
  impressionsBucket?: string;
  positionBucket?: string;
  confidence?: string;
}): string {
  const comps = args.componentPoints
    .map((c) => `${c.name}:${c.points}`)
    .sort()
    .join(",");
  const material = [
    "seo-priority",
    args.scoreVersion,
    args.decisionFingerprint,
    args.refreshFingerprint || "",
    args.action,
    String(args.score),
    args.tier,
    args.automationSelectable ? "1" : "0",
    args.evidenceCompleteness,
    args.effort,
    comps,
    args.impressionsBucket || "",
    args.positionBucket || "",
    args.confidence || "",
  ].join("|");
  return createHash("sha256").update(material, "utf8").digest("hex");
}

/**
 * Score an already-decided NBA action for ordering priority.
 * Pure: no CMS/DB/Planning/GSC/provider calls.
 */
export function scoreSeoPriority(input: SeoPriorityInput): SeoPriorityResult {
  const decision = input.decision;
  const action = decision.action;
  const gsc = boundGsc(input.gscEvidence);
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!input.refreshFirst && isContentFamily(action)) {
    warnings.push("refresh_first_missing");
  }
  if (input.refreshFirst?.verdict === "UNKNOWN") {
    warnings.push("refresh_first_unknown");
  }
  if (input.refreshFirst?.verdict === "DUPLICATE") {
    warnings.push("refresh_first_duplicate");
  }
  if (input.refreshFirst?.verdict === "CANNIBALIZATION_RISK") {
    warnings.push("refresh_first_cannibalization");
  }
  if (isDeferredFamily(action)) {
    warnings.push("deferred_family_minimal_scoring");
  }
  if (gscExpectedForAction(action) && gsc.length === 0) {
    warnings.push("gsc_evidence_absent");
  }

  const demand = scoreDemand(input.opportunity, gsc, decision);
  const opportunity = scoreOpportunity(action, gsc);
  const confidence = scoreConfidence(decision.confidence);
  const coverage = scoreCoverage(input, action);
  const momentum = scoreMomentum(action, gsc);
  const risk = scoreRisk(input, gsc, missing);

  const components: SeoPriorityComponent[] = [
    demand,
    opportunity,
    confidence,
    coverage,
    momentum,
    risk,
  ];

  const raw =
    demand.points +
    opportunity.points +
    confidence.points +
    coverage.points +
    momentum.points +
    risk.points;
  const score = clampInt(raw, SEO_PRIORITY_SCORE_MIN, SEO_PRIORITY_SCORE_MAX);
  const tier = tierFromScore(score);
  const automationSelectable = isAutomationSelectable(decision);
  const effort = effortForAction(action);
  const evidenceCompleteness = evidenceCompletenessOf(input, gsc, missing);
  const refreshFingerprint = input.refreshFirst?.fingerprint || null;
  const impBucket = impressionsBucket(maxImpressions(gsc));
  const posBucket = positionBucket(bestPosition(gsc));

  const uniqueMissing = [...new Set(missing)]
    .map((m) => trimText(m, SEO_PRIORITY_CAPS.missingInput))
    .filter(Boolean)
    .slice(0, SEO_PRIORITY_CAPS.maxMissingInputs);

  const uniqueWarnings = [...new Set(warnings)]
    .map((w) => trimText(w, SEO_PRIORITY_CAPS.warning))
    .filter(Boolean)
    .slice(0, SEO_PRIORITY_CAPS.maxWarnings);

  const priorityFingerprint = buildSeoPriorityFingerprint({
    scoreVersion: SEO_PRIORITY_SCORE_VERSION,
    decisionFingerprint: decision.decisionFingerprint,
    refreshFingerprint,
    action,
    score,
    tier,
    automationSelectable,
    evidenceCompleteness,
    effort,
    componentPoints: components.map((c) => ({ name: c.name, points: c.points })),
    impressionsBucket: impBucket,
    positionBucket: posBucket,
    confidence: decision.confidence,
  });

  return {
    score,
    tier,
    scoreVersion: SEO_PRIORITY_SCORE_VERSION,
    components,
    reason: buildReason(action, tier, components),
    warnings: uniqueWarnings,
    effort,
    evidenceCompleteness,
    missingInputs: uniqueMissing,
    automationSelectable,
    priorityFingerprint,
    action,
    decisionFingerprint: decision.decisionFingerprint,
    refreshFingerprint,
  };
}
