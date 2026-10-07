/**
 * Deterministic Next-Best-Action decide() — pure input → output.
 * No providers, network, CMS writes, or Planning mutations.
 */

import { createHash } from "node:crypto";
import { slugify } from "@/lib/cms/slug";
import type {
  SeoHistoricalDisposition,
  SeoNextBestAction,
  SeoNextBestActionDecision,
  SeoNextBestActionInput,
  SeoNextBestAlternative,
  SeoNextBestConfidence,
  SeoNextBestCoverage,
  SeoNextBestEvidence,
  SeoNextBestHoldReason,
  SeoNextBestStatus,
  SeoNextBestTarget,
  SeoRefreshFirstVerdict,
} from "@/lib/cms/seo-next-best-action/types";

function trimText(value: unknown, max = 280): string {
  return String(value || "")
    .trim()
    .slice(0, max);
}

function hasMaterialNarrative(value: unknown): boolean {
  const text = trimText(value, 400);
  if (text.length < 12) return false;
  // Reject placeholder-ish empties
  if (/^(n\/?a|none|tbd|todo|placeholder)$/i.test(text)) return false;
  return true;
}

function coverageOf(input: SeoNextBestActionInput): SeoNextBestCoverage | null {
  return input.corpus?.existingCoverage || input.opportunity?.existingCoverage || null;
}

function refreshVerdict(input: SeoNextBestActionInput): SeoRefreshFirstVerdict {
  return input.refreshFirst?.verdict || "UNKNOWN";
}

function isDuplicate(input: SeoNextBestActionInput): boolean {
  return Boolean(input.corpus?.duplicate) || refreshVerdict(input) === "DUPLICATE";
}

function isCannibalization(input: SeoNextBestActionInput): boolean {
  return (
    Boolean(input.corpus?.cannibalizationRisk) || refreshVerdict(input) === "CANNIBALIZATION_RISK"
  );
}

function matchedPostId(input: SeoNextBestActionInput): string | null {
  const id = trimText(input.corpus?.matchedPostId, 80);
  return id || null;
}

function matchedUrl(input: SeoNextBestActionInput): string | null {
  const fromCorpus = trimText(input.corpus?.matchedUrl, 300);
  if (fromCorpus) return fromCorpus;
  const fromOpp = trimText(input.opportunity?.matchedPublicUrl, 300);
  return fromOpp || null;
}

function historicalPath(input: SeoNextBestActionInput): string | null {
  const path = trimText(input.historical?.path || input.opportunity?.restorePath, 300);
  return path.startsWith("/") ? path : null;
}

function gscPresent(input: SeoNextBestActionInput): boolean {
  if (typeof input.evidence?.gscPresent === "boolean") return input.evidence.gscPresent;
  return Boolean(input.opportunity?.gscEvidencePresent);
}

function webEvidencePresent(input: SeoNextBestActionInput): boolean {
  if (typeof input.evidence?.webEvidencePresent === "boolean") {
    return input.evidence.webEvidencePresent;
  }
  return hasMaterialNarrative(input.opportunity?.webEvidence);
}

function corpusEvidencePresent(input: SeoNextBestActionInput): boolean {
  if (typeof input.evidence?.corpusEvidencePresent === "boolean") {
    return input.evidence.corpusEvidencePresent;
  }
  return Boolean(matchedPostId(input) || matchedUrl(input) || coverageOf(input));
}

function materialEvidence(input: SeoNextBestActionInput): boolean {
  const signal = gscPresent(input) || webEvidencePresent(input);
  const gapClear =
    coverageOf(input) === "NONE" ||
    (!coverageOf(input) && refreshVerdict(input) === "PASS_NEW_CONTENT");
  return signal && (gapClear || corpusEvidencePresent(input));
}

function confidenceOf(input: SeoNextBestActionInput): SeoNextBestConfidence {
  const fromOpp = input.opportunity?.confidence;
  if (fromOpp === "HIGH" || fromOpp === "MEDIUM" || fromOpp === "LOW") return fromOpp;
  if (materialEvidence(input) && coverageOf(input) === "NONE" && refreshVerdict(input) === "PASS_NEW_CONTENT") {
    return "HIGH";
  }
  if (materialEvidence(input) || hasMaterialNarrative(input.opportunity?.whyNow)) return "MEDIUM";
  return "LOW";
}

function topicOf(input: SeoNextBestActionInput): string {
  return trimText(input.opportunity?.topic || input.opportunity?.workingTitle, 160);
}

function proposedSlugOf(input: SeoNextBestActionInput): string {
  const title = trimText(input.opportunity?.workingTitle || input.opportunity?.topic, 180);
  return slugify(title);
}

function buildEvidence(input: SeoNextBestActionInput): SeoNextBestEvidence {
  return {
    gscPresent: gscPresent(input),
    webEvidencePresent: webEvidencePresent(input),
    corpusEvidencePresent: corpusEvidencePresent(input),
    existingCoverage: coverageOf(input),
    matchedPostId: matchedPostId(input),
    matchedUrl: matchedUrl(input),
    historicalPath: historicalPath(input),
    refreshFirstVerdict: input.refreshFirst?.verdict || null,
    duplicate: isDuplicate(input),
    cannibalizationRisk: isCannibalization(input),
  };
}

function refreshTarget(input: SeoNextBestActionInput): SeoNextBestTarget {
  const id = matchedPostId(input);
  const url = matchedUrl(input) || undefined;
  if (id) return { kind: "blog_post", postId: id, publicUrl: url };
  if (url) return { kind: "blog_post", postId: "", publicUrl: url };
  return { kind: "none" };
}

function newBlogTarget(input: SeoNextBestActionInput): SeoNextBestTarget {
  const topic = topicOf(input);
  if (!topic) return { kind: "none" };
  return { kind: "new_topic", topic, proposedSlug: proposedSlugOf(input) || undefined };
}

function historicalTarget(input: SeoNextBestActionInput): SeoNextBestTarget {
  const path = historicalPath(input);
  if (!path) return { kind: "none" };
  return { kind: "historical_path", path };
}

function targetKey(target: SeoNextBestTarget): string {
  switch (target.kind) {
    case "none":
      return "none";
    case "blog_post":
      return `post:${target.postId || ""}:${target.publicUrl || ""}`;
    case "historical_path":
      return `hist:${target.path}`;
    case "new_topic":
      return `topic:${target.proposedSlug || slugify(target.topic) || "topic"}`;
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

export function buildSeoNextBestActionFingerprint(args: {
  action: SeoNextBestAction;
  target: SeoNextBestTarget;
  topic?: string;
  historicalPath?: string | null;
  refreshFirstVerdict?: SeoRefreshFirstVerdict | null;
  historicalDisposition?: SeoHistoricalDisposition | null;
}): string {
  const material = [
    "seo-nba-v1",
    args.action,
    targetKey(args.target),
    slugify(args.topic || "") || "",
    args.historicalPath || "",
    args.refreshFirstVerdict || "",
    args.historicalDisposition || "",
  ].join("|");
  return createHash("sha256").update(material, "utf8").digest("hex");
}

export function buildSeoNextBestActionFingerprintAlias(
  decision: Pick<
    SeoNextBestActionDecision,
    "action" | "target" | "topic" | "evidence" | "historicalDisposition"
  >,
): string {
  return buildSeoNextBestActionFingerprint({
    action: decision.action,
    target: decision.target,
    topic: decision.topic,
    historicalPath: decision.evidence.historicalPath,
    refreshFirstVerdict: decision.evidence.refreshFirstVerdict,
    historicalDisposition: decision.historicalDisposition,
  });
}

function actionFingerprintOf(action: SeoNextBestAction, target: SeoNextBestTarget): string {
  return createHash("sha256")
    .update(`seo-nba-action-v1|${action}|${targetKey(target)}`, "utf8")
    .digest("hex");
}

function result(args: {
  input: SeoNextBestActionInput;
  action: SeoNextBestAction;
  status: SeoNextBestStatus;
  holdReason: SeoNextBestHoldReason | null;
  confidence: SeoNextBestConfidence;
  autonomousEligible: boolean;
  target: SeoNextBestTarget;
  reason: string;
  blockers?: string[];
  warnings?: string[];
  alternatives?: SeoNextBestAlternative[];
  historicalDisposition?: SeoHistoricalDisposition | null;
}): SeoNextBestActionDecision {
  const evidence = buildEvidence(args.input);
  const topic = topicOf(args.input);
  const historicalDisposition = args.historicalDisposition ?? null;
  const decisionFingerprint = buildSeoNextBestActionFingerprint({
    action: args.action,
    target: args.target,
    topic,
    historicalPath: evidence.historicalPath,
    refreshFirstVerdict: evidence.refreshFirstVerdict,
    historicalDisposition,
  });

  return {
    decisionFingerprint,
    action: args.action,
    status: args.status,
    holdReason: args.holdReason,
    confidence: args.confidence,
    autonomousEligible: args.autonomousEligible,
    target: args.target,
    topic,
    reason: trimText(args.reason, 280),
    evidence,
    blockers: args.blockers || [],
    warnings: args.warnings || [],
    alternatives: (args.alternatives || []).slice(0, 3),
    opportunityFingerprint: args.input.source?.opportunityFingerprint,
    actionFingerprint: actionFingerprintOf(args.action, args.target),
    historicalDisposition,
    source: args.input.source?.runId ? { runId: args.input.source.runId } : undefined,
  };
}

function isHistoricalEligible(input: SeoNextBestActionInput): boolean {
  const hist = input.historical;
  if (!hist) return false;
  if (!hist.registryMatch) return false;
  if (!hist.classificationEligible) return false;
  if (!hist.restoreEligible) return false;
  const path = historicalPath(input);
  if (!path || path === "/") return false;
  // Strong current coverage replaces historical recreate
  if (coverageOf(input) === "STRONG") return false;
  return true;
}

function hasExactExistingTarget(input: SeoNextBestActionInput): boolean {
  if (matchedPostId(input)) return true;
  if (matchedUrl(input) && (coverageOf(input) === "STRONG" || coverageOf(input) === "PARTIAL")) {
    return true;
  }
  return false;
}

function shouldRefreshExisting(input: SeoNextBestActionInput): boolean {
  if (refreshVerdict(input) === "REFRESH_EXISTING") return true;
  // Exact BlogPost match always outranks NEW_BLOG (even if coverage label is NONE/UNKNOWN).
  if (matchedPostId(input)) return true;
  if (hasExactExistingTarget(input) && coverageOf(input) === "STRONG") return true;
  if (hasExactExistingTarget(input) && refreshVerdict(input) !== "PASS_NEW_CONTENT") return true;
  if (isDuplicate(input) && (matchedPostId(input) || matchedUrl(input))) return true;
  if (isCannibalization(input) && (matchedPostId(input) || matchedUrl(input))) return true;
  return false;
}

function newBlogAutonomousEligible(args: {
  input: SeoNextBestActionInput;
  confidence: SeoNextBestConfidence;
  blockers: string[];
}): boolean {
  if (args.confidence !== "HIGH") return false;
  if (args.blockers.length > 0) return false;
  if (refreshVerdict(args.input) !== "PASS_NEW_CONTENT") return false;
  if (isDuplicate(args.input) || isCannibalization(args.input)) return false;
  if (coverageOf(args.input) !== "NONE") return false;
  if (!materialEvidence(args.input)) return false;
  if (args.input.technical?.technicalBlocker || args.input.technical?.indexingBlocker) return false;
  return true;
}

/**
 * Pure deterministic Next-Best-Action decision.
 * Precedence: technical → indexing → refresh/existing → historical → metadata →
 * internal links → image → NEW_BLOG → DO_NOTHING.
 */
export function decideSeoNextBestAction(input: SeoNextBestActionInput): SeoNextBestActionDecision {
  const confidence = confidenceOf(input);
  const rejectedNewBlog: SeoNextBestAlternative = {
    action: "NEW_BLOG",
    reason: "Higher-precedence reuse/recovery/technical action outranked a new article.",
  };

  // 1. Technical blocker
  if (input.technical?.technicalBlocker) {
    return result({
      input,
      action: "TECHNICAL_FIX",
      status: "HOLD",
      holdReason: "TECHNICAL_BLOCKER",
      confidence,
      autonomousEligible: false,
      target: { kind: "none" },
      reason: "A clear technical SEO blocker outranks content generation.",
      blockers: ["technical_blocker"],
      alternatives: [rejectedNewBlog],
    });
  }

  // 2. Indexing blocker
  if (input.technical?.indexingBlocker) {
    return result({
      input,
      action: "INDEXING_REVIEW",
      status: "HOLD",
      holdReason: "TECHNICAL_BLOCKER",
      confidence,
      autonomousEligible: false,
      target: { kind: "none" },
      reason: "A clear indexing/canonical/sitemap issue outranks content generation.",
      blockers: ["indexing_blocker"],
      alternatives: [rejectedNewBlog],
    });
  }

  // 3. Existing coverage / Refresh-First refresh / duplicate-with-target
  if (shouldRefreshExisting(input)) {
    const target = refreshTarget(input);
    const warnings: string[] = [];
    if (isCannibalization(input)) warnings.push("cannibalization_risk");
    if (isDuplicate(input)) warnings.push("duplicate");
    return result({
      input,
      action: "REFRESH_EXISTING",
      status: "ACTIONABLE",
      holdReason: null,
      confidence,
      autonomousEligible: false,
      target,
      reason: "Existing coverage or Refresh-First requires refreshing a current article, not creating a new one.",
      warnings,
      alternatives: [rejectedNewBlog],
    });
  }

  // Duplicate / cannibalization without a refresh target → fail closed
  if (isDuplicate(input) && !matchedPostId(input) && !matchedUrl(input)) {
    return result({
      input,
      action: "DO_NOTHING",
      status: "HOLD",
      holdReason: "DUPLICATE",
      confidence,
      autonomousEligible: false,
      target: { kind: "none" },
      reason: "Duplicate intent detected without a safe existing target to refresh.",
      blockers: ["duplicate"],
      alternatives: [rejectedNewBlog],
    });
  }

  if (isCannibalization(input) && !matchedPostId(input) && !matchedUrl(input)) {
    return result({
      input,
      action: "DO_NOTHING",
      status: "HOLD",
      holdReason: "CANNIBALIZATION_RISK",
      confidence,
      autonomousEligible: false,
      target: { kind: "none" },
      reason: "Cannibalization risk blocks autonomous new-blog creation without a refresh target.",
      blockers: ["cannibalization_risk"],
      alternatives: [rejectedNewBlog],
    });
  }

  // 4. Historical recovery (eligible only)
  if (isHistoricalEligible(input)) {
    const disposition: SeoHistoricalDisposition =
      input.historical?.preferredDisposition || "RECREATE";
    return result({
      input,
      action: "HISTORICAL_RECOVERY",
      status: "ACTIONABLE",
      holdReason: null,
      confidence,
      autonomousEligible: false,
      target: historicalTarget(input),
      reason: "A valid historical recovery candidate outranks creating an unrelated new article.",
      alternatives: [rejectedNewBlog],
      historicalDisposition: disposition,
    });
  }

  // 5. Metadata-only
  if (input.technical?.metadataOnly) {
    return result({
      input,
      action: "TITLE_META_UPDATE",
      status: "ACTIONABLE",
      holdReason: null,
      confidence,
      autonomousEligible: false,
      target: refreshTarget(input).kind === "none" ? { kind: "none" } : refreshTarget(input),
      reason: "The best action is title/meta optimization, not a new article.",
      alternatives: [rejectedNewBlog],
    });
  }

  // 6. Internal-link-only
  if (input.technical?.internalLinkOnly) {
    return result({
      input,
      action: "INTERNAL_LINKS",
      status: "ACTIONABLE",
      holdReason: null,
      confidence,
      autonomousEligible: false,
      target: refreshTarget(input).kind === "none" ? { kind: "none" } : refreshTarget(input),
      reason: "The best action is internal linking, not a new article.",
      alternatives: [rejectedNewBlog],
    });
  }

  // 7. Image-only
  if (input.technical?.imageOnly) {
    return result({
      input,
      action: "IMAGE",
      status: "ACTIONABLE",
      holdReason: null,
      confidence,
      autonomousEligible: false,
      target: refreshTarget(input).kind === "none" ? { kind: "none" } : refreshTarget(input),
      reason: "The best action is image work on an otherwise healthy article.",
      alternatives: [rejectedNewBlog],
    });
  }

  // 8. Genuine NEW_BLOG content gap
  const contentGap =
    coverageOf(input) === "NONE" &&
    refreshVerdict(input) === "PASS_NEW_CONTENT" &&
    !isDuplicate(input) &&
    !isCannibalization(input) &&
    Boolean(topicOf(input));

  const contentGapLoose =
    !hasExactExistingTarget(input) &&
    coverageOf(input) !== "STRONG" &&
    coverageOf(input) !== "PARTIAL" &&
    refreshVerdict(input) !== "REFRESH_EXISTING" &&
    !isDuplicate(input) &&
    !isCannibalization(input) &&
    Boolean(topicOf(input)) &&
    (input.opportunity?.recommendation === "NEW_BLOG" || coverageOf(input) === "NONE");

  if (contentGap || contentGapLoose) {
    if (!materialEvidence(input) && !hasMaterialNarrative(input.opportunity?.whyNow)) {
      return result({
        input,
        action: "DO_NOTHING",
        status: "HOLD",
        holdReason: "INSUFFICIENT_EVIDENCE",
        confidence: confidence === "HIGH" ? "LOW" : confidence,
        autonomousEligible: false,
        target: { kind: "none" },
        reason: "Content-gap signals exist but evidence is too weak to justify a new article.",
        blockers: ["insufficient_evidence"],
      });
    }

    // Refresh-First UNKNOWN blocks autonomy even if NEW_BLOG is shown for manual review
    const warnings: string[] = [];
    if (refreshVerdict(input) === "UNKNOWN") {
      warnings.push("refresh_first_unknown");
    }
    if (coverageOf(input) && coverageOf(input) !== "NONE") {
      warnings.push("existing_coverage_not_none");
    }

    const target = newBlogTarget(input);
    const blockers: string[] = [];
    if (refreshVerdict(input) !== "PASS_NEW_CONTENT") {
      blockers.push("refresh_first_not_pass");
    }
    if (coverageOf(input) !== "NONE") {
      blockers.push("existing_coverage");
    }

    // Strict gap for ACTIONABLE NEW_BLOG with PASS; otherwise still allow manual MEDIUM/LOW NEW_BLOG
    // when recommendation/topic points at new content and Refresh is not forcing refresh.
    const allowNewBlog =
      (contentGap && materialEvidence(input)) ||
      (contentGapLoose &&
        (materialEvidence(input) || hasMaterialNarrative(input.opportunity?.whyNow)) &&
        refreshVerdict(input) !== "REFRESH_EXISTING");

    if (allowNewBlog) {
      const autonomousEligible = newBlogAutonomousEligible({
        input,
        confidence,
        blockers,
      });
      return result({
        input,
        action: "NEW_BLOG",
        status: "ACTIONABLE",
        holdReason: null,
        confidence,
        autonomousEligible,
        target,
        reason: autonomousEligible
          ? "Genuine content gap with high confidence and material evidence; safe for future autonomous NEW_BLOG."
          : "Possible new-blog opportunity for manual review; not autonomously eligible under V1 rules.",
        blockers: autonomousEligible ? [] : blockers,
        warnings,
      });
    }
  }

  // 9. DO_NOTHING
  return result({
    input,
    action: "DO_NOTHING",
    status: "HOLD",
    holdReason: materialEvidence(input) ? "NO_WORTHWHILE_ACTION" : "INSUFFICIENT_EVIDENCE",
    confidence,
    autonomousEligible: false,
    target: { kind: "none" },
    reason: materialEvidence(input)
      ? "No worthwhile SEO action is indicated for this run."
      : "Evidence is insufficient for a safe SEO action.",
    blockers: materialEvidence(input) ? [] : ["insufficient_evidence"],
  });
}
