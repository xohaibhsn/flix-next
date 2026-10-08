/**
 * SEO Decision Pipeline Adapter V1 — composition tests.
 * Executes real RF → NBA → Priority (not source-string assertions).
 * Fixtures only — zero CMS writes, zero providers, zero GSC API.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SeoResearchGscEvidence, SeoResearchOpportunity } from "../lib/cms/ai-seo/research-schemas";
import { GSC_KNOWN_HISTORICAL_URLS } from "../lib/cms/gsc/historical-registry";
import { slugify } from "../lib/cms/slug";
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";
import {
  buildSeoDecisionOpportunityIdentity,
  buildSeoDecisionPipelineFingerprint,
  createSeoDecisionPipelineContextFromData,
  evaluateSeoOpportunityPipeline,
  evaluateSeoOpportunityPipelineBatch,
  mapResearchGscToRefreshOwnership,
  mapResearchHistoricalCandidate,
  resolveSeoDecisionPipelineTarget,
  SEO_DECISION_PIPELINE_CAPS,
  SEO_DECISION_PIPELINE_VERSION,
} from "../lib/cms/seo-decision-pipeline";

const root = path.join(__dirname, "..");

function blogPost(
  overrides: Partial<BlogPost> & Pick<BlogPost, "id" | "slug" | "title">,
): BlogPost {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: overrides.id,
    title: overrides.title,
    slug: overrides.slug,
    excerpt: overrides.excerpt || "Excerpt",
    content: overrides.content || "",
    categoryId: overrides.categoryId ?? null,
    featuredImage: null,
    status: overrides.status || "published",
    featured: false,
    publishedAt: overrides.publishedAt ?? now,
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
    seoTitle: overrides.seoTitle || overrides.title,
    seoDescription: overrides.seoDescription || "",
    focusKeyword: "",
    canonicalUrl: overrides.canonicalUrl || "",
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: true,
  };
}

function planningDraft(
  overrides: Partial<SeoPlanningDraft> & Pick<SeoPlanningDraft, "id" | "topic" | "proposedSlug">,
): SeoPlanningDraft {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: overrides.id,
    recommendation: overrides.recommendation || "NEW_BLOG",
    workflowStatus: overrides.workflowStatus || "PLANNING",
    fingerprint: overrides.fingerprint || `NEW_BLOG:${overrides.proposedSlug}`,
    topic: overrides.topic,
    workingTitle: overrides.workingTitle || overrides.topic,
    proposedSlug: overrides.proposedSlug,
    targetPostId: overrides.targetPostId ?? null,
    matchedPublicUrl: overrides.matchedPublicUrl || "",
    restorePath: overrides.restorePath || "",
    searchIntent: overrides.searchIntent || "INFORMATIONAL",
    linkedPostId: null,
    createdBy: "test",
    createdAt: now,
    updatedAt: now,
    archivedAt: overrides.archivedAt ?? null,
    payload: {},
  };
}

function opportunity(
  overrides: Partial<SeoResearchOpportunity> &
    Pick<SeoResearchOpportunity, "topic" | "workingTitle" | "recommendation">,
): SeoResearchOpportunity {
  return {
    topic: overrides.topic,
    workingTitle: overrides.workingTitle,
    searchIntent: overrides.searchIntent || "INFORMATIONAL",
    whyNow:
      overrides.whyNow ??
      "Search demand is rising for Firestick IPTV app comparisons this quarter.",
    webEvidence:
      overrides.webEvidence ??
      "Competitor roundups rank for best firestick iptv apps with thin UK coverage.",
    existingCoverage: overrides.existingCoverage ?? "NONE",
    matchedTitle: overrides.matchedTitle ?? null,
    matchedPublicUrl: overrides.matchedPublicUrl ?? null,
    recommendation: overrides.recommendation,
    restorePath: overrides.restorePath ?? "",
    suggestedAngle: overrides.suggestedAngle || "Practical UK-focused angle.",
    nextStep: overrides.nextStep || "Review in Planning.",
    confidence: overrides.confidence || "HIGH",
    gscEvidenceRefs: overrides.gscEvidenceRefs || [],
    gscEvidence: overrides.gscEvidence || [],
    historicalSignal: overrides.historicalSignal ?? false,
  };
}

function gscRow(
  overrides: Partial<SeoResearchGscEvidence> & Pick<SeoResearchGscEvidence, "id" | "kind">,
): SeoResearchGscEvidence {
  return {
    id: overrides.id,
    kind: overrides.kind,
    query: overrides.query,
    pageUrl: overrides.pageUrl,
    normalizedPath: overrides.normalizedPath ?? null,
    classification: overrides.classification,
    historicalKey: overrides.historicalKey,
    clicks: overrides.clicks ?? 10,
    impressions: overrides.impressions ?? 100,
    ctr: overrides.ctr ?? 0.1,
    position: overrides.position ?? 12,
    clicksDirection: overrides.clicksDirection ?? "UP",
    impressionsDirection: overrides.impressionsDirection ?? "UP",
    ctrDirection: overrides.ctrDirection ?? "FLAT",
    positionDirection: overrides.positionDirection ?? "UP",
  };
}

function cleanContext(extraPosts: BlogPost[] = [], planningDrafts: SeoPlanningDraft[] = []) {
  return createSeoDecisionPipelineContextFromData({
    posts: extraPosts,
    planningDrafts,
    runId: "test-run",
  });
}

// --- Safe NEW_BLOG ---

test("safe NEW_BLOG → PASS → NBA eligible → automationSelectable", () => {
  const ctx = cleanContext();
  assert.equal(ctx.corpusComplete, true);
  const opp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
    confidence: "HIGH",
    existingCoverage: "NONE",
    gscEvidence: [
      gscRow({
        id: "Q1",
        kind: "query",
        query: "best iptv apps firestick",
        impressions: 500,
        clicks: 40,
      }),
    ],
    gscEvidenceRefs: ["Q1"],
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.equal(result.evaluationStatus, "OK");
  assert.equal(result.refreshFirst?.verdict, "PASS_NEW_CONTENT");
  assert.equal(result.nextBestAction?.action, "NEW_BLOG");
  assert.equal(result.nextBestAction?.autonomousEligible, true);
  assert.equal(result.priority?.automationSelectable, true);
  assert.ok(result.priority);
  assert.equal(result.pipelineVersion, SEO_DECISION_PIPELINE_VERSION);
});

// --- NEW_BLOG overridden by exact existing post ---

test("Research NEW_BLOG + exact existing post → REFRESH, never auto", () => {
  const post = blogPost({
    id: "post-existing",
    slug: "best-iptv-apps-for-firestick-in-2026",
    title: "Best IPTV Apps for Firestick in 2026",
  });
  const ctx = cleanContext([post]);
  const opp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
    existingCoverage: "NONE",
    matchedPublicUrl: "/blogs/best-iptv-apps-for-firestick-in-2026/",
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.equal(result.evaluationStatus, "OK");
  assert.equal(result.refreshFirst?.verdict, "REFRESH_EXISTING");
  assert.equal(result.nextBestAction?.action, "REFRESH_EXISTING");
  assert.equal(result.priority?.automationSelectable, false);
  assert.equal(result.resolvedTarget?.postId, "post-existing");
});

// --- Duplicate ---

test("duplicate via exact slug reservation → never automationSelectable", () => {
  const post = blogPost({
    id: "post-dup",
    slug: "best-iptv-apps-for-firestick-in-2026",
    title: "Best IPTV Apps for Firestick in 2026",
  });
  const ctx = cleanContext([post]);
  const opp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.notEqual(result.refreshFirst?.verdict, "PASS_NEW_CONTENT");
  assert.equal(result.priority?.automationSelectable, false);
  assert.ok(
    result.nextBestAction?.action === "REFRESH_EXISTING" ||
      result.nextBestAction?.action === "DO_NOTHING" ||
      result.refreshFirst?.evidence.duplicate === true ||
      result.refreshFirst?.verdict === "REFRESH_EXISTING" ||
      result.refreshFirst?.verdict === "DUPLICATE",
  );
});

// --- Cannibalization ---

test("cannibalization risk → never autonomous NEW_BLOG", () => {
  const posts = [
    blogPost({
      id: "post-a",
      slug: "firestick-iptv-apps-guide",
      title: "Firestick IPTV Apps Guide",
      updatedAt: "2026-02-01T00:00:00.000Z",
    }),
    blogPost({
      id: "post-b",
      slug: "best-iptv-apps-firestick",
      title: "Best IPTV Apps Firestick",
      updatedAt: "2026-02-02T00:00:00.000Z",
    }),
  ];
  const ctx = cleanContext(posts);
  // Force GSC ownership of two CURRENT_CMS paths for same intent
  const opp = opportunity({
    topic: "Best IPTV apps for Firestick",
    workingTitle: "Totally Unique Working Title XYZ 2026",
    recommendation: "NEW_BLOG",
    existingCoverage: "NONE",
    gscEvidence: [
      gscRow({
        id: "QP1",
        kind: "query_page",
        query: "best iptv apps firestick",
        normalizedPath: "/blogs/firestick-iptv-apps-guide/",
        classification: "CURRENT_CMS",
      }),
      gscRow({
        id: "QP2",
        kind: "query_page",
        query: "best iptv apps firestick",
        normalizedPath: "/blogs/best-iptv-apps-firestick/",
        classification: "CURRENT_CMS",
      }),
    ],
    gscEvidenceRefs: ["QP1", "QP2"],
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.equal(result.priority?.automationSelectable, false);
  assert.ok(
    result.refreshFirst?.verdict === "CANNIBALIZATION_RISK" ||
      result.refreshFirst?.verdict === "REFRESH_EXISTING" ||
      result.nextBestAction?.action !== "NEW_BLOG" ||
      result.nextBestAction?.autonomousEligible === false,
  );
  if (result.nextBestAction?.action === "NEW_BLOG") {
    assert.equal(result.nextBestAction.autonomousEligible, false);
  }
});

// --- Historical valid ---

test("valid historical → HISTORICAL_RECOVERY, no auto Blog", () => {
  const hist = GSC_KNOWN_HISTORICAL_URLS[0];
  assert.ok(hist);
  const ctx = cleanContext();
  const opp = opportunity({
    topic: "Fix buffering on IPTV",
    workingTitle: "How to Fix Buffering Issues on IPTV",
    recommendation: "RESTORE_HISTORICAL",
    restorePath: hist.path,
    historicalSignal: true,
    existingCoverage: "NONE",
    confidence: "HIGH",
    gscEvidence: [
      gscRow({
        id: "P1",
        kind: "page",
        pageUrl: `https://theflixiptv.com${hist.path}`,
        normalizedPath: hist.path,
        classification: "REMOVED_OR_404",
        historicalKey: hist.key,
        impressions: 200,
        clicks: 15,
      }),
    ],
    gscEvidenceRefs: ["P1"],
  });
  const histMapped = mapResearchHistoricalCandidate({ opportunity: opp });
  assert.equal(histMapped?.restoreEligible, true);

  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.equal(result.evaluationStatus, "OK");
  assert.equal(result.nextBestAction?.action, "HISTORICAL_RECOVERY");
  assert.equal(result.priority?.automationSelectable, false);
  assert.equal(result.priority?.action, "HISTORICAL_RECOVERY");
});

// --- Historical invalid ---

test("invalid historical RESTORE → no forced HISTORICAL_RECOVERY", () => {
  const ctx = cleanContext();
  const opp = opportunity({
    topic: "Random historical topic",
    workingTitle: "Random Historical Topic Title",
    recommendation: "RESTORE_HISTORICAL",
    restorePath: "/not-a-known-historical-path-xyz/",
    historicalSignal: true,
    existingCoverage: "NONE",
    gscEvidence: [
      gscRow({
        id: "P9",
        kind: "page",
        normalizedPath: "/not-a-known-historical-path-xyz/",
        classification: "UNKNOWN",
      }),
    ],
  });
  const histMapped = mapResearchHistoricalCandidate({ opportunity: opp });
  assert.equal(histMapped?.restoreEligible, false);

  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.notEqual(result.nextBestAction?.action, "HISTORICAL_RECOVERY");
  assert.notEqual(result.nextBestAction?.action, "NEW_BLOG");
  assert.equal(result.priority?.automationSelectable, false);
  assert.ok(
    result.nextBestAction?.action === "DO_NOTHING" ||
      result.nextBestAction?.status === "HOLD",
  );
});

// --- SKIP ---

test("Research SKIP → DO_NOTHING/HOLD, no auto", () => {
  const ctx = cleanContext();
  const opp = opportunity({
    topic: "Skip this idea",
    workingTitle: "Skip This Idea Entirely",
    recommendation: "SKIP",
    confidence: "LOW",
    existingCoverage: "NONE",
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.equal(result.evaluationStatus, "OK");
  assert.equal(result.nextBestAction?.action, "DO_NOTHING");
  assert.equal(result.nextBestAction?.status, "HOLD");
  assert.equal(result.priority?.automationSelectable, false);
  assert.ok(result.priority);
});

// --- Internal link ---

test("INTERNAL_LINK_ONLY → NBA INTERNAL_LINKS when no stronger precedence, no auto", () => {
  // NONE coverage + no resolved Blog target so REFRESH_EXISTING does not outrank.
  // (PARTIAL + matchedPublicUrl triggers NBA refresh precedence by design.)
  const ctx = cleanContext();
  const opp = opportunity({
    topic: "Link related setup tips",
    workingTitle: "Link Related Setup Tips",
    recommendation: "INTERNAL_LINK_ONLY",
    matchedPublicUrl: null,
    matchedTitle: null,
    existingCoverage: "NONE",
    confidence: "MEDIUM",
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.equal(result.evaluationStatus, "OK");
  assert.equal(result.nextBestAction?.action, "INTERNAL_LINKS");
  assert.equal(result.priority?.automationSelectable, false);
  assert.equal(result.priority?.action, "INTERNAL_LINKS");
});

// --- GSC reuse ---

test("GSC ownership mapper uses attached evidence only", () => {
  const post = blogPost({
    id: "post-gsc",
    slug: "firestick-setup",
    title: "Firestick Setup",
  });
  const ctx = cleanContext([post]);
  const evidence = [
    gscRow({
      id: "QP1",
      kind: "query_page",
      query: "firestick setup",
      normalizedPath: "/blogs/firestick-setup/",
      classification: "CURRENT_CMS",
      impressions: 300,
    }),
    gscRow({
      id: "Q2",
      kind: "query",
      query: "unrelated query",
      // no page — must NOT become ownership
    }),
  ];
  const ownership = mapResearchGscToRefreshOwnership({
    gscEvidence: evidence,
    matchedPublicUrl: "/blogs/firestick-setup/",
    blogIdentities: ctx.blogIdentities,
  });
  assert.equal(ownership.length, 1);
  assert.equal(ownership[0].classification, "CURRENT_CMS");
  assert.equal(ownership[0].ownsRelatedQueryPage, true);
  assert.equal(ownership[0].relatedPostId, "post-gsc");

  const opp = opportunity({
    topic: "Firestick setup tips",
    workingTitle: "Firestick Setup Tips Unique",
    recommendation: "REFRESH_EXISTING",
    matchedPublicUrl: "/blogs/firestick-setup/",
    existingCoverage: "STRONG",
    gscEvidence: evidence,
    gscEvidenceRefs: ["QP1", "Q2"],
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.equal(result.evaluationStatus, "OK");
  assert.ok((result.priority?.components.length || 0) > 0);
  // Priority consumed attached rows (demand/momentum may use impressions)
  assert.equal(result.nextBestAction?.evidence.gscPresent, true);
});

// --- Context once (no per-row Blog/Planning reads) ---

test("batch reuses one context — no per-row listPosts/listSeoPlanningDrafts", () => {
  let blogReads = 0;
  let planningReads = 0;
  const posts: BlogPost[] = [];
  const drafts: SeoPlanningDraft[] = [];

  // Simulate context builder counters
  const buildOnce = () => {
    blogReads += 1;
    planningReads += 1;
    return createSeoDecisionPipelineContextFromData({ posts, planningDrafts: drafts });
  };

  const ctx = buildOnce();
  const opps = [
    opportunity({
      topic: "Topic Alpha Unique",
      workingTitle: "Topic Alpha Unique Title",
      recommendation: "NEW_BLOG",
    }),
    opportunity({
      topic: "Topic Beta Unique",
      workingTitle: "Topic Beta Unique Title",
      recommendation: "NEW_BLOG",
    }),
    opportunity({
      topic: "Topic Gamma Unique",
      workingTitle: "Topic Gamma Unique Title",
      recommendation: "NEW_BLOG",
    }),
  ];
  const batch = evaluateSeoOpportunityPipelineBatch(ctx, opps);
  assert.equal(batch.results.length, 3);
  assert.equal(blogReads, 1);
  assert.equal(planningReads, 1);
  // Pure batch has no I/O hooks — provenance: evaluate.ts must not import repository
  const evaluateSrc = readFileSync(
    path.join(root, "lib/cms/seo-decision-pipeline/evaluate.ts"),
    "utf8",
  );
  assert.doesNotMatch(evaluateSrc, /listPosts|listSeoPlanningDrafts|from "@\/lib\/cms\/repository"/);
  assert.doesNotMatch(evaluateSrc, /fetch\(|OpenAI|Gemini|buildUkGscEvidencePack/);
});

// --- Corpus completeness ---

test("corpusComplete true when total blogs ≤ maxCandidates", () => {
  const posts = Array.from({ length: 5 }, (_, i) =>
    blogPost({
      id: `p-${i}`,
      slug: `post-${i}`,
      title: `Post ${i}`,
      updatedAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
    }),
  );
  const ctx = createSeoDecisionPipelineContextFromData({ posts });
  assert.equal(ctx.totalBlogCount, 5);
  assert.ok(ctx.totalBlogCount <= SEO_DECISION_PIPELINE_CAPS.maxCandidates);
  assert.equal(ctx.corpusComplete, true);
});

test("corpusComplete false when total blogs > maxCandidates (truncated candidates)", () => {
  const posts = Array.from({ length: 25 }, (_, i) =>
    blogPost({
      id: `big-${i}`,
      slug: `big-post-${i}`,
      title: `Big Post ${i}`,
      updatedAt: `2026-03-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    }),
  );
  const ctx = createSeoDecisionPipelineContextFromData({ posts });
  assert.equal(ctx.totalBlogCount, 25);
  assert.ok(ctx.candidates.length <= SEO_DECISION_PIPELINE_CAPS.maxCandidates);
  assert.equal(ctx.corpusComplete, false);

  const opp = opportunity({
    topic: "Brand new uncovered topic xyz",
    workingTitle: "Brand New Uncovered Topic Xyz 2026",
    recommendation: "NEW_BLOG",
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.notEqual(result.refreshFirst?.verdict, "PASS_NEW_CONTENT");
  assert.equal(result.priority?.automationSelectable, false);
});

// --- Exact post outside candidate cap ---

test("exact matched post outside candidate window still refreshes", () => {
  // Newest-first candidates: posts 24..5 fill the 20-cap; post-0 is oldest and outside window
  const posts = Array.from({ length: 25 }, (_, i) =>
    blogPost({
      id: `cap-${i}`,
      slug: `cap-post-${i}`,
      title: `Cap Post ${i}`,
      updatedAt: `2026-04-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
    }),
  );
  const ctx = createSeoDecisionPipelineContextFromData({ posts });
  assert.equal(ctx.corpusComplete, false);
  assert.ok(!ctx.candidates.some((c) => c.postId === "cap-0"));

  const target = resolveSeoDecisionPipelineTarget({
    matchedPublicUrl: "/blogs/cap-post-0/",
    blogIdentities: ctx.blogIdentities,
  });
  assert.equal(target?.postId, "cap-0");

  const opp = opportunity({
    topic: "Cap Post 0 topic",
    workingTitle: "Something Else Entirely Unique",
    recommendation: "NEW_BLOG",
    matchedPublicUrl: "/blogs/cap-post-0/",
    existingCoverage: "NONE",
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.equal(result.resolvedTarget?.postId, "cap-0");
  assert.equal(result.refreshFirst?.verdict, "REFRESH_EXISTING");
  assert.equal(result.nextBestAction?.action, "REFRESH_EXISTING");
  assert.equal(result.priority?.automationSelectable, false);
});

// --- Planning reservation ---

test("active Planning NEW_BLOG reservation blocks PASS / auto", () => {
  const draft = planningDraft({
    id: "seoplan_fbf7dfc4-81d4-4d81-bd91-c4f1e9c317c8",
    topic: "Best IPTV apps for Firestick in 2026",
    proposedSlug: "best-iptv-apps-for-firestick-in-2026",
    recommendation: "NEW_BLOG",
  });
  const ctx = cleanContext([], [draft]);
  assert.ok(ctx.reservations.reservedSlugs?.includes("best-iptv-apps-for-firestick-in-2026"));

  const opp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.notEqual(result.refreshFirst?.verdict, "PASS_NEW_CONTENT");
  assert.equal(result.priority?.automationSelectable, false);
});

test("unrelated Planning reservation does not block different NEW_BLOG", () => {
  const draft = planningDraft({
    id: "plan-other",
    topic: "Completely Unrelated Planning Topic",
    proposedSlug: "completely-unrelated-planning-topic",
    recommendation: "NEW_BLOG",
  });
  const ctx = cleanContext([], [draft]);
  const opp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.equal(result.refreshFirst?.verdict, "PASS_NEW_CONTENT");
  assert.equal(result.nextBestAction?.autonomousEligible, true);
});

// --- Draft Blog reservation ---

test("draft Blog owns proposed slug → never autonomous new Blog", () => {
  const draft = blogPost({
    id: "draft-1",
    slug: "best-iptv-apps-for-firestick-in-2026",
    title: "Best IPTV Apps for Firestick in 2026",
    status: "draft",
  });
  const ctx = cleanContext([draft]);
  const opp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.notEqual(result.refreshFirst?.verdict, "PASS_NEW_CONTENT");
  assert.equal(result.priority?.automationSelectable, false);
  assert.ok(
    result.refreshFirst?.verdict === "REFRESH_EXISTING" ||
      result.refreshFirst?.verdict === "DUPLICATE" ||
      result.refreshFirst?.evidence.draftReservation === true,
  );
});

// --- Batch error isolation ---

test("batch isolates VALIDATION_ERROR without erasing siblings", () => {
  const ctx = cleanContext();
  const validA = opportunity({
    topic: "Valid Opportunity Alpha Unique",
    workingTitle: "Valid Opportunity Alpha Unique Title",
    recommendation: "NEW_BLOG",
  });
  const malformed = {
    topic: "",
    workingTitle: "",
    recommendation: "NEW_BLOG",
  } as SeoResearchOpportunity;
  const validB = opportunity({
    topic: "Valid Opportunity Beta Unique",
    workingTitle: "Valid Opportunity Beta Unique Title",
    recommendation: "NEW_BLOG",
  });
  const batch = evaluateSeoOpportunityPipelineBatch(ctx, [validA, malformed, validB]);
  assert.equal(batch.results.length, 3);
  assert.equal(batch.results[0].evaluationStatus, "OK");
  assert.equal(batch.results[1].evaluationStatus, "VALIDATION_ERROR");
  assert.equal(batch.results[2].evaluationStatus, "OK");
  assert.equal(batch.results[0].nextBestAction?.action, "NEW_BLOG");
  assert.equal(batch.results[2].nextBestAction?.action, "NEW_BLOG");
  assert.equal(batch.results[1].nextBestAction, null);
});

// --- Fingerprint ---

test("pipeline fingerprint stable for same inputs; changes with logical identity", () => {
  const ctx = cleanContext();
  const opp = opportunity({
    topic: "Fingerprint Topic Unique",
    workingTitle: "Fingerprint Topic Unique Title",
    recommendation: "NEW_BLOG",
  });
  const a = evaluateSeoOpportunityPipeline(ctx, opp);
  const b = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.equal(a.pipelineFingerprint, b.pipelineFingerprint);
  assert.equal(a.opportunityIdentity, b.opportunityIdentity);

  const changed = opportunity({
    topic: "Fingerprint Topic Unique Changed",
    workingTitle: "Fingerprint Topic Unique Title",
    recommendation: "NEW_BLOG",
  });
  const c = evaluateSeoOpportunityPipeline(ctx, changed);
  assert.notEqual(a.pipelineFingerprint, c.pipelineFingerprint);

  const fp1 = buildSeoDecisionPipelineFingerprint({
    opportunityIdentity: a.opportunityIdentity,
    refreshFingerprint: a.refreshFirst?.fingerprint,
    nbaDecisionFingerprint: a.nextBestAction?.decisionFingerprint,
    priorityFingerprint: a.priority?.priorityFingerprint,
  });
  assert.equal(fp1, a.pipelineFingerprint);

  const fpVersion = buildSeoDecisionPipelineFingerprint({
    pipelineVersion: "v2",
    opportunityIdentity: a.opportunityIdentity,
    refreshFingerprint: a.refreshFirst?.fingerprint,
    nbaDecisionFingerprint: a.nextBestAction?.decisionFingerprint,
    priorityFingerprint: a.priority?.priorityFingerprint,
  });
  assert.notEqual(fpVersion, a.pipelineFingerprint);

  // Reason prose / timestamps not in fingerprint material
  const id1 = buildSeoDecisionOpportunityIdentity(opp);
  const id2 = buildSeoDecisionOpportunityIdentity(
    opportunity({
      topic: opp.topic,
      workingTitle: opp.workingTitle,
      recommendation: opp.recommendation,
      matchedPublicUrl: opp.matchedPublicUrl,
      restorePath: opp.restorePath,
      gscEvidenceRefs: opp.gscEvidenceRefs,
      whyNow: "Completely different prose that should not affect identity.",
      nextStep: "Different next step text.",
      suggestedAngle: "Different angle text.",
    }),
  );
  assert.equal(id1, id2);
});

// --- Order preservation ---

test("batch preserves Research input order (no Priority sort)", () => {
  const ctx = cleanContext();
  const opps = [
    opportunity({
      topic: "Order Topic A",
      workingTitle: "Order Topic A Title",
      recommendation: "SKIP",
      confidence: "LOW",
      whyNow: "n/a placeholder",
      webEvidence: "n/a",
    }),
    opportunity({
      topic: "Order Topic B High Priority Candidate",
      workingTitle: "Order Topic B High Priority Candidate Title",
      recommendation: "NEW_BLOG",
      confidence: "HIGH",
      gscEvidence: [
        gscRow({ id: "Q1", kind: "query", query: "order b", impressions: 900, clicks: 80 }),
      ],
      gscEvidenceRefs: ["Q1"],
    }),
    opportunity({
      topic: "Order Topic C",
      workingTitle: "Order Topic C Title",
      recommendation: "SKIP",
      confidence: "LOW",
      whyNow: "n/a placeholder",
      webEvidence: "n/a",
    }),
  ];
  const batch = evaluateSeoOpportunityPipelineBatch(ctx, opps);
  assert.equal(batch.results[0].opportunity.topic, "Order Topic A");
  assert.equal(batch.results[1].opportunity.topic, "Order Topic B High Priority Candidate");
  assert.equal(batch.results[2].opportunity.topic, "Order Topic C");
  // B should score higher but must not reorder
  assert.ok((batch.results[1].priority?.score || 0) >= (batch.results[0].priority?.score || 0));
});

// --- Provider / write safety ---

test("adapter modules have no provider/GSC/write imports in pure core", () => {
  const files = [
    "lib/cms/seo-decision-pipeline/adapt.ts",
    "lib/cms/seo-decision-pipeline/evaluate.ts",
    "lib/cms/seo-decision-pipeline/types.ts",
    "lib/cms/seo-decision-pipeline/context.ts",
    "lib/cms/seo-decision-pipeline/index.ts",
  ];
  for (const rel of files) {
    const src = readFileSync(path.join(root, rel), "utf8");
    assert.doesNotMatch(src, /openai|OpenAI|gemini|Gemini/i);
    assert.doesNotMatch(src, /buildUkGscEvidencePack|gscQuery|searchanalytics/i);
    assert.doesNotMatch(src, /saveSeoPlanningDraft|savePost|createPost|updatePost/);
    assert.doesNotMatch(src, /fetch\(/);
  }
  const cmsSrc = readFileSync(
    path.join(root, "lib/cms/seo-decision-pipeline/context-cms.ts"),
    "utf8",
  );
  assert.match(cmsSrc, /import "server-only"/);
  assert.match(cmsSrc, /listPosts/);
  assert.match(cmsSrc, /listSeoPlanningDrafts/);
  assert.doesNotMatch(cmsSrc, /saveSeoPlanningDraft|savePost/);
  assert.doesNotMatch(cmsSrc, /openai|OpenAI|buildUkGscEvidencePack/i);
});

// --- Proposed slug policy ---

test("proposedSlug derived only for NEW_BLOG via slugify(workingTitle)", () => {
  const title = "Best IPTV Apps for Firestick in 2026";
  assert.equal(slugify(title), "best-iptv-apps-for-firestick-in-2026");
  const ctx = cleanContext();
  const refreshOpp = opportunity({
    topic: "Refresh topic",
    workingTitle: title,
    recommendation: "REFRESH_EXISTING",
    matchedPublicUrl: "/blogs/some-post/",
    existingCoverage: "STRONG",
  });
  // No crash; REFRESH path does not invent NEW_BLOG slug collision from workingTitle alone
  // when matched URL missing from corpus → UNKNOWN/HOLD family, not PASS
  const result = evaluateSeoOpportunityPipeline(ctx, refreshOpp);
  assert.notEqual(result.refreshFirst?.verdict, "PASS_NEW_CONTENT");
});

test("UI / Proceed remain unwired; Research action may call research-bridge only", () => {
  const panel = readFileSync(
    path.join(root, "components/sidhu/SeoOpportunitiesPanel.tsx"),
    "utf8",
  );
  const actions = readFileSync(path.join(root, "lib/cms/ai-seo-actions.ts"), "utf8");
  const proceed = readFileSync(path.join(root, "lib/cms/seo-planning/proceed.ts"), "utf8");
  assert.doesNotMatch(panel, /seo-decision-pipeline|decisionPipeline/);
  assert.doesNotMatch(proceed, /seo-decision-pipeline|decisionPipeline/);
  // Server action may invoke the Research bridge; must not pull pure barrel into client UI.
  assert.match(actions, /researchUkContentOpportunitiesWithDecisionPipelineFromCms/);
  assert.match(actions, /seo-decision-pipeline\/research-bridge/);
});

// --- Review-gap tests ---

test("index barrel does not export or import context-cms / server-only", () => {
  const indexSrc = readFileSync(
    path.join(root, "lib/cms/seo-decision-pipeline/index.ts"),
    "utf8",
  );
  // Comments may mention the server module; actual imports must not pull it.
  assert.doesNotMatch(indexSrc, /from ["']\.\/context-cms["']/);
  assert.doesNotMatch(indexSrc, /from ["']@\/lib\/cms\/seo-decision-pipeline\/context-cms["']/);
  assert.doesNotMatch(indexSrc, /^import ["']server-only["']/m);
  assert.doesNotMatch(indexSrc, /from ["']@\/lib\/cms\/repository["']/);
  assert.doesNotMatch(indexSrc, /export[\s\S]*buildSeoDecisionPipelineContextFromCms/);
  // This test file imports the public barrel at module load — if server-only were pulled, no tests would run.
  assert.equal(typeof evaluateSeoOpportunityPipeline, "function");
  assert.equal(typeof createSeoDecisionPipelineContextFromData, "function");
});

test(">40 Planning NEW_BLOG reservations → reservationsTruncated, corpusComplete false", () => {
  const drafts = Array.from({ length: 41 }, (_, i) =>
    planningDraft({
      id: `plan-${i}`,
      topic: `Reserved Topic Number ${i}`,
      proposedSlug: `reserved-topic-number-${i}`,
      recommendation: "NEW_BLOG",
    }),
  );
  const ctx = createSeoDecisionPipelineContextFromData({ posts: [], planningDrafts: drafts });
  assert.equal(ctx.reservationsTruncated, true);
  assert.equal(ctx.corpusComplete, false);

  const opp = opportunity({
    topic: "Unrelated clean new blog topic",
    workingTitle: "Unrelated Clean New Blog Topic Title",
    recommendation: "NEW_BLOG",
  });
  const result = evaluateSeoOpportunityPipeline(ctx, opp);
  assert.notEqual(result.refreshFirst?.verdict, "PASS_NEW_CONTENT");
  assert.equal(result.priority?.automationSelectable, false);
});

test("reordered GSC evidence refs keep stable opportunity identity", () => {
  const base = {
    topic: "Stable Identity Topic",
    workingTitle: "Stable Identity Topic Title",
    recommendation: "NEW_BLOG" as const,
    matchedPublicUrl: null as string | null,
    restorePath: "",
  };
  const idA = buildSeoDecisionOpportunityIdentity({
    ...base,
    gscEvidenceRefs: ["Q1", "P2", "QP3"],
  });
  const idB = buildSeoDecisionOpportunityIdentity({
    ...base,
    gscEvidenceRefs: ["QP3", "Q1", "P2"],
  });
  assert.equal(idA, idB);
});

test("NEW_BLOG with empty workingTitle → VALIDATION_ERROR", () => {
  const ctx = cleanContext();
  const bad = {
    topic: "Has topic but no title",
    workingTitle: "",
    recommendation: "NEW_BLOG",
  } as SeoResearchOpportunity;
  const result = evaluateSeoOpportunityPipeline(ctx, bad);
  assert.equal(result.evaluationStatus, "VALIDATION_ERROR");
  assert.equal(result.errorCode, "working_title_missing");
  assert.equal(result.nextBestAction, null);
  assert.equal(result.priority, null);
});

test("successful SKIP HOLD remains evaluationStatus=OK", () => {
  const ctx = cleanContext();
  const result = evaluateSeoOpportunityPipeline(
    ctx,
    opportunity({
      topic: "Hold Ok Topic",
      workingTitle: "Hold Ok Topic Title",
      recommendation: "SKIP",
      confidence: "LOW",
      whyNow: "n/a placeholder",
      webEvidence: "n/a",
    }),
  );
  assert.equal(result.evaluationStatus, "OK");
  assert.equal(result.nextBestAction?.action, "DO_NOTHING");
  assert.equal(result.nextBestAction?.status, "HOLD");
});
