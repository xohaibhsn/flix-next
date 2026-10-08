/**
 * Research ↔ Decision Pipeline bridge V1 — combination tests.
 * Executes real Adapter evaluate; stubs Research/context. No OpenAI/GSC/CMS.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { ResearchUkOpportunitiesResult } from "../lib/cms/ai-seo/research";
import type {
  SeoResearchGscEvidence,
  SeoResearchOpportunity,
  SeoResearchResult,
} from "../lib/cms/ai-seo/research-schemas";
import type { BlogPost } from "../lib/cms/types";
import {
  combineResearchWithDecisionPipeline,
  createSeoDecisionPipelineContextFromData,
  evaluateSeoOpportunityPipelineBatch,
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
    content: "",
    categoryId: null,
    featuredImage: null,
    status: overrides.status || "published",
    featured: false,
    publishedAt: overrides.publishedAt ?? now,
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
    seoTitle: overrides.seoTitle || overrides.title,
    seoDescription: "",
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
    clicks: overrides.clicks ?? 10,
    impressions: overrides.impressions ?? 100,
    ctr: overrides.ctr ?? 0.1,
    position: overrides.position ?? 12,
    clicksDirection: "UP",
    impressionsDirection: "UP",
    ctrDirection: "FLAT",
    positionDirection: "UP",
  };
}

function researchSuccess(opportunities: SeoResearchOpportunity[]): ResearchUkOpportunitiesResult {
  const research: SeoResearchResult = {
    opportunities,
    sources: [{ title: "Example", url: "https://example.com/", domain: "example.com" }],
    gsc: {
      status: "AVAILABLE",
      statusLabel: "GSC available",
      helperText: "Evidence attached.",
    },
  };
  return { ok: true, research };
}

// --- Successful Research + Pipeline ---

test("successful Research + Pipeline: Research once, context once, batch once, order preserved", async () => {
  let researchCalls = 0;
  let contextBuilds = 0;
  let batchCalls = 0;

  const researchResult = researchSuccess([
    opportunity({
      topic: "Best IPTV apps for Firestick in 2026",
      workingTitle: "Best IPTV Apps for Firestick in 2026",
      recommendation: "NEW_BLOG",
      gscEvidence: [gscRow({ id: "Q1", kind: "query", query: "best iptv apps", impressions: 400 })],
      gscEvidenceRefs: ["Q1"],
    }),
  ]);
  researchCalls += 1;

  const combined = await combineResearchWithDecisionPipeline({
    researchResult,
    buildContext: () => {
      contextBuilds += 1;
      return createSeoDecisionPipelineContextFromData({ posts: [] });
    },
    evaluateBatch: (ctx, opps) => {
      batchCalls += 1;
      return evaluateSeoOpportunityPipelineBatch(ctx, opps);
    },
  });

  assert.equal(researchCalls, 1);
  assert.equal(contextBuilds, 1);
  assert.equal(batchCalls, 1);
  assert.equal(combined.ok, true);
  if (!combined.ok) return;

  assert.equal(combined.research.opportunities.length, 1);
  assert.equal(combined.research.sources.length, 1);
  assert.equal(combined.research.gsc?.status, "AVAILABLE");
  assert.equal(combined.decisionPipeline.runStatus, "OK");
  assert.equal(combined.decisionPipeline.pipelineVersion, SEO_DECISION_PIPELINE_VERSION);
  assert.equal(combined.decisionPipeline.evaluations.length, 1);
  assert.equal(combined.decisionPipeline.evaluations[0].opportunityIndex, 0);
  assert.equal(combined.decisionPipeline.evaluations[0].evaluationStatus, "OK");
  assert.equal(combined.decisionPipeline.evaluations[0].refreshFirst?.verdict, "PASS_NEW_CONTENT");
  assert.equal(combined.decisionPipeline.evaluations[0].nextBestAction?.action, "NEW_BLOG");
  assert.equal(combined.decisionPipeline.evaluations[0].nextBestAction?.autonomousEligible, true);
  assert.equal(combined.decisionPipeline.evaluations[0].priority?.automationSelectable, true);
});

// --- Multiple opportunities / context once ---

test("multiple opportunities: one context, one batch, deterministic association, no reorder", async () => {
  let contextBuilds = 0;
  let batchCalls = 0;
  const opps = [
    opportunity({
      topic: "Order Topic A Skip",
      workingTitle: "Order Topic A Skip Title",
      recommendation: "SKIP",
      confidence: "LOW",
      whyNow: "n/a placeholder",
      webEvidence: "n/a",
    }),
    opportunity({
      topic: "Order Topic B New Blog",
      workingTitle: "Order Topic B New Blog Title",
      recommendation: "NEW_BLOG",
      gscEvidence: [gscRow({ id: "Q1", kind: "query", query: "b", impressions: 800, clicks: 50 })],
      gscEvidenceRefs: ["Q1"],
    }),
    opportunity({
      topic: "Order Topic C Skip",
      workingTitle: "Order Topic C Skip Title",
      recommendation: "SKIP",
      confidence: "LOW",
      whyNow: "n/a placeholder",
      webEvidence: "n/a",
    }),
  ];

  const combined = await combineResearchWithDecisionPipeline({
    researchResult: researchSuccess(opps),
    buildContext: () => {
      contextBuilds += 1;
      return createSeoDecisionPipelineContextFromData({ posts: [] });
    },
    evaluateBatch: (ctx, rows) => {
      batchCalls += 1;
      return evaluateSeoOpportunityPipelineBatch(ctx, rows);
    },
  });

  assert.equal(contextBuilds, 1);
  assert.equal(batchCalls, 1);
  assert.ok(combined.ok);
  if (!combined.ok) return;

  assert.equal(combined.research.opportunities[0].topic, "Order Topic A Skip");
  assert.equal(combined.research.opportunities[1].topic, "Order Topic B New Blog");
  assert.equal(combined.research.opportunities[2].topic, "Order Topic C Skip");
  assert.equal(combined.decisionPipeline.evaluations.map((e) => e.opportunityIndex).join(","), "0,1,2");
  assert.equal(combined.decisionPipeline.evaluations[0].opportunity.topic, "Order Topic A Skip");
  assert.equal(combined.decisionPipeline.evaluations[1].opportunity.topic, "Order Topic B New Blog");
  // B should score higher but Research order unchanged
  assert.ok(
    (combined.decisionPipeline.evaluations[1].priority?.score || 0) >=
      (combined.decisionPipeline.evaluations[0].priority?.score || 0),
  );
});

// --- Context failure preserves Research ---

test("context failure preserves Research; runStatus=CONTEXT_ERROR; no Research retry", async () => {
  let researchBuilds = 0;
  let contextBuilds = 0;
  const researchResult = researchSuccess([
    opportunity({
      topic: "Preserved Research Topic",
      workingTitle: "Preserved Research Topic Title",
      recommendation: "NEW_BLOG",
    }),
  ]);
  researchBuilds += 1;

  const combined = await combineResearchWithDecisionPipeline({
    researchResult,
    buildContext: () => {
      contextBuilds += 1;
      throw new Error("CMS listPosts failed with password=supersecret api_key=sk-test");
    },
    evaluateBatch: evaluateSeoOpportunityPipelineBatch,
  });

  assert.equal(researchBuilds, 1);
  assert.equal(contextBuilds, 1);
  assert.ok(combined.ok);
  if (!combined.ok) return;

  assert.equal(combined.research.opportunities.length, 1);
  assert.equal(combined.research.opportunities[0].topic, "Preserved Research Topic");
  assert.equal(combined.research.sources.length, 1);
  assert.equal(combined.research.gsc?.status, "AVAILABLE");
  assert.equal(combined.decisionPipeline.runStatus, "CONTEXT_ERROR");
  assert.equal(combined.decisionPipeline.evaluations.length, 0);
  assert.equal(combined.decisionPipeline.errorCode, "pipeline_context_error");
  assert.equal(combined.decisionPipeline.errorMessage, "Decision pipeline context failed.");
  assert.doesNotMatch(combined.decisionPipeline.errorMessage!, /supersecret|sk-test|listPosts|password|api_key/i);
  // CONTEXT_ERROR branch must serialize cleanly for server-action response
  const parsed = JSON.parse(JSON.stringify(combined));
  assert.equal(parsed.decisionPipeline.runStatus, "CONTEXT_ERROR");
  assert.equal(parsed.research.sources.length, 1);
  assert.equal(parsed.research.gsc.status, "AVAILABLE");
});

test("evaluateBatch throw preserves Research as CONTEXT_ERROR (supplementary)", async () => {
  let contextBuilds = 0;
  const combined = await combineResearchWithDecisionPipeline({
    researchResult: researchSuccess([
      opportunity({
        topic: "Batch Throw Topic",
        workingTitle: "Batch Throw Topic Title",
        recommendation: "NEW_BLOG",
      }),
    ]),
    buildContext: () => {
      contextBuilds += 1;
      return createSeoDecisionPipelineContextFromData({ posts: [] });
    },
    evaluateBatch: () => {
      throw new Error("unexpected evaluate failure with token=abc123");
    },
  });
  assert.equal(contextBuilds, 1);
  assert.ok(combined.ok);
  if (!combined.ok) return;
  assert.equal(combined.research.opportunities[0].topic, "Batch Throw Topic");
  assert.equal(combined.decisionPipeline.runStatus, "CONTEXT_ERROR");
  assert.equal(combined.decisionPipeline.evaluations.length, 0);
  assert.doesNotMatch(combined.decisionPipeline.errorMessage || "", /token=abc123|abc123/);
});

// --- Research failure ---

test("Research failure passes through; context/evaluate never called", async () => {
  let contextBuilds = 0;
  let batchCalls = 0;
  const failed: ResearchUkOpportunitiesResult = {
    ok: false,
    code: "unavailable",
    error: "OpenAI research unavailable.",
  };

  const combined = await combineResearchWithDecisionPipeline({
    researchResult: failed,
    buildContext: () => {
      contextBuilds += 1;
      return createSeoDecisionPipelineContextFromData({ posts: [] });
    },
    evaluateBatch: (ctx, opps) => {
      batchCalls += 1;
      return evaluateSeoOpportunityPipelineBatch(ctx, opps);
    },
  });

  assert.equal(combined.ok, false);
  if (combined.ok) return;
  assert.equal(combined.code, "unavailable");
  assert.equal(contextBuilds, 0);
  assert.equal(batchCalls, 0);
  assert.equal("decisionPipeline" in combined, false);
});

// --- Row validation isolation ---

test("row VALIDATION_ERROR isolates; siblings OK; Research preserved; runStatus OK", async () => {
  const opps = [
    opportunity({
      topic: "Valid Sibling Alpha",
      workingTitle: "Valid Sibling Alpha Title",
      recommendation: "NEW_BLOG",
    }),
    {
      topic: "",
      workingTitle: "",
      recommendation: "NEW_BLOG",
    } as SeoResearchOpportunity,
    opportunity({
      topic: "Valid Sibling Beta",
      workingTitle: "Valid Sibling Beta Title",
      recommendation: "NEW_BLOG",
    }),
  ];

  const combined = await combineResearchWithDecisionPipeline({
    researchResult: researchSuccess(opps),
    buildContext: () => createSeoDecisionPipelineContextFromData({ posts: [] }),
    evaluateBatch: evaluateSeoOpportunityPipelineBatch,
  });

  assert.ok(combined.ok);
  if (!combined.ok) return;
  assert.equal(combined.research.opportunities.length, 3);
  assert.equal(combined.decisionPipeline.runStatus, "OK");
  assert.equal(combined.decisionPipeline.evaluations[0].evaluationStatus, "OK");
  assert.equal(combined.decisionPipeline.evaluations[1].evaluationStatus, "VALIDATION_ERROR");
  assert.equal(combined.decisionPipeline.evaluations[2].evaluationStatus, "OK");
  assert.equal(combined.decisionPipeline.evaluations[1].priority, null);
  assert.equal(combined.decisionPipeline.evaluations[0].priority?.automationSelectable, true);
});

// --- Safe NEW_BLOG exposure ---

test("safe NEW_BLOG pipeline values exposed unchanged (no extra eligibility logic)", async () => {
  const combined = await combineResearchWithDecisionPipeline({
    researchResult: researchSuccess([
      opportunity({
        topic: "Safe New Blog Topic Unique",
        workingTitle: "Safe New Blog Topic Unique Title",
        recommendation: "NEW_BLOG",
        confidence: "HIGH",
        gscEvidence: [gscRow({ id: "Q1", kind: "query", impressions: 500, clicks: 40 })],
        gscEvidenceRefs: ["Q1"],
      }),
    ]),
    buildContext: () => createSeoDecisionPipelineContextFromData({ posts: [] }),
    evaluateBatch: evaluateSeoOpportunityPipelineBatch,
  });
  assert.ok(combined.ok);
  if (!combined.ok) return;
  const row = combined.decisionPipeline.evaluations[0];
  assert.equal(row.refreshFirst?.verdict, "PASS_NEW_CONTENT");
  assert.equal(row.nextBestAction?.action, "NEW_BLOG");
  assert.equal(row.nextBestAction?.autonomousEligible, true);
  assert.equal(row.priority?.automationSelectable, true);
  assert.equal(combined.research.opportunities[0].recommendation, "NEW_BLOG");
});

// --- NEW_BLOG overridden ---

test("Research NEW_BLOG preserved while pipeline exposes REFRESH override", async () => {
  const post = blogPost({
    id: "post-existing",
    slug: "best-iptv-apps-for-firestick-in-2026",
    title: "Best IPTV Apps for Firestick in 2026",
  });
  const researchOpp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
    matchedPublicUrl: "/blogs/best-iptv-apps-for-firestick-in-2026/",
    existingCoverage: "NONE",
  });

  const combined = await combineResearchWithDecisionPipeline({
    researchResult: researchSuccess([researchOpp]),
    buildContext: () => createSeoDecisionPipelineContextFromData({ posts: [post] }),
    evaluateBatch: evaluateSeoOpportunityPipelineBatch,
  });

  assert.ok(combined.ok);
  if (!combined.ok) return;
  assert.equal(combined.research.opportunities[0].recommendation, "NEW_BLOG");
  const row = combined.decisionPipeline.evaluations[0];
  assert.equal(row.refreshFirst?.verdict, "REFRESH_EXISTING");
  assert.equal(row.nextBestAction?.action, "REFRESH_EXISTING");
  assert.equal(row.priority?.automationSelectable, false);
});

// --- Serialization ---

test("combined success result is JSON-serializable (no Map/Set/Error leakage)", async () => {
  const combined = await combineResearchWithDecisionPipeline({
    researchResult: researchSuccess([
      opportunity({
        topic: "Serialize Topic",
        workingTitle: "Serialize Topic Title",
        recommendation: "NEW_BLOG",
      }),
    ]),
    buildContext: () => createSeoDecisionPipelineContextFromData({ posts: [] }),
    evaluateBatch: evaluateSeoOpportunityPipelineBatch,
  });
  assert.ok(combined.ok);
  const json = JSON.stringify(combined);
  assert.ok(json.length > 100);
  const parsed = JSON.parse(json);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.decisionPipeline.runStatus, "OK");
  assert.equal(parsed.decisionPipeline.evaluations.length, 1);
});

// --- Provider / GSC / barrel safety ---

test("bridge core and action wiring: no second GSC/provider; barrel stays pure", () => {
  const core = readFileSync(
    path.join(root, "lib/cms/seo-decision-pipeline/research-bridge-core.ts"),
    "utf8",
  );
  const bridge = readFileSync(
    path.join(root, "lib/cms/seo-decision-pipeline/research-bridge.ts"),
    "utf8",
  );
  const indexSrc = readFileSync(
    path.join(root, "lib/cms/seo-decision-pipeline/index.ts"),
    "utf8",
  );
  const actions = readFileSync(path.join(root, "lib/cms/ai-seo-actions.ts"), "utf8");
  const panel = readFileSync(
    path.join(root, "components/sidhu/SeoOpportunitiesPanel.tsx"),
    "utf8",
  );

  assert.doesNotMatch(core, /openai|OpenAI|gemini|Gemini|buildUkGscEvidencePack|fetch\(/i);
  assert.doesNotMatch(core, /listPosts|listSeoPlanningDrafts|from "@\/lib\/cms\/repository"/);
  assert.match(bridge, /import "server-only"/);
  assert.match(bridge, /researchUkContentOpportunitiesFromCms/);
  assert.match(bridge, /buildSeoDecisionPipelineContextFromCms/);
  assert.match(bridge, /combineResearchWithDecisionPipeline/);
  assert.doesNotMatch(bridge, /requestOpenAi|gemini/i);
  // Bridge reuses Research helper — does not call GSC pack builder itself
  assert.doesNotMatch(bridge, /buildUkGscEvidencePack\(/);

  assert.doesNotMatch(indexSrc, /from ["']\.\/research-bridge["']/);
  assert.doesNotMatch(indexSrc, /from ["']@\/lib\/cms\/seo-decision-pipeline\/research-bridge["']/);

  assert.match(actions, /researchUkContentOpportunitiesWithDecisionPipelineFromCms/);
  assert.match(actions, /runResearchBridgeThenPersistLedger/);
  assert.match(actions, /insertResearchRunWithDecisions/);
  assert.doesNotMatch(bridge, /seo-experiment-ledger|insertResearchRunWithDecisions/);
  assert.doesNotMatch(panel, /decisionPipeline|seo-decision-pipeline|ledgerPersisted|insertResearchRunWithDecisions/);
});

test("UI / Proceed unchanged by bridge", () => {
  const proceed = readFileSync(path.join(root, "lib/cms/seo-planning/proceed.ts"), "utf8");
  assert.doesNotMatch(proceed, /decisionPipeline|research-bridge/);
});
