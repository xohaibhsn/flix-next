/**
 * A2-12 — Catalog / Ledger DI adapters (offline).
 * No ambient MySQL, cms runtime, GSC, or AI.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";
import {
  SEO_AI_ARTICLE_APPLY_PROTECTED_FIXTURE_FINGERPRINT_PREFIX,
} from "../lib/cms/seo-planning/article-apply-readiness";
import {
  loadAuthoritativeSeoPlanningForApply,
} from "../lib/cms/seo-planning/article-sidhu-authoritative-sources-local";
import {
  createFirstPartyVerifyCatalogFromInjected,
  createSidhuAuthoritativePlanningCatalogFromInjected,
  createSidhuLedgerRunDetailReaderFromInjected,
  SEO_AI_ARTICLE_SIDHU_CATALOG_LEDGER_DI_SPEC,
  SIDHU_CATALOG_LEDGER_DI_READ_BUDGET,
  sidhuCatalogAdapterExposesOnlyExactReads,
} from "../lib/cms/seo-planning/article-sidhu-catalog-ledger-di-local";
import type { SeoResearchRunRow } from "../lib/cms/seo-experiment-ledger/types";
import type { SeoOpportunityDecisionRow } from "../lib/cms/seo-experiment-ledger/types";
import {
  verifyPlanningFirstPartySiteFacts,
} from "../lib/cms/seo-autonomy/first-party-site-fact-verify";

const PLANNING_ID = "seoplan_a2_12_cat";
const RUN_ID = "seorun_a2_12_cat_0001";
const SITE_CLAIM =
  "The Flix IPTV publishes UK-focused Firestick setup guidance on-site.";
const SITE_SLUG = "firestick-setup-a212";
const SITE_URL = `https://theflixiptv.com/blogs/${SITE_SLUG}/`;

function baseDraft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: PLANNING_ID,
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:a2-12-cat",
    topic: "Firestick IPTV setup checklist for UK viewers",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    proposedSlug: "uk-firestick-a2-12-cat",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "INFORMATIONAL",
    linkedPostId: null,
    createdBy: "admin_super_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T01:00:00.000Z",
    payload: {
      opportunity: {
        topic: "Firestick IPTV setup checklist for UK viewers",
        whyNow: "UK setup queries rising.",
        webEvidence: "Competitor guides omit UK device steps.",
        existingCoverage: "NONE",
        confidence: "HIGH",
        matchedTitle: null,
        gscEvidence: [],
      },
      workspace: {
        contentAngle: "Practical UK Firestick setup",
        nextStep: "Draft",
        humanNotes: "Keep claims modest.",
      },
      sources: [],
      gsc: { included: true },
      editorialEvidenceV1: {
        version: "v1",
        originalContribution: "UK evening congestion checklist contribution.",
        readerBenefit: "Isolate home Wi-Fi issues faster for readers.",
        missingEvidenceNotes: "Need first-party verification later.",
        entries: [
          {
            id: "entry_sf_1",
            evidenceType: "PROPOSED_SITE_FACT",
            claim: SITE_CLAIM,
            url: SITE_URL,
            notes: "",
          },
        ],
      },
    },
    ...overrides,
  };
}

function publishedPost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post_a212_setup",
    title: "Firestick setup",
    slug: SITE_SLUG,
    excerpt: SITE_CLAIM,
    content: `<p>${SITE_CLAIM}</p><p>Additional UK onboarding checklist detail for viewers.</p>`,
    status: "published",
    categoryId: null,
    featuredImage: null,
    featured: false,
    publishedAt: "2026-10-01T00:00:00.000Z",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    seoTitle: "",
    seoDescription: "",
    focusKeyword: "",
    canonicalUrl: "",
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: true,
    ...overrides,
  };
}

function runRow(): SeoResearchRunRow {
  return {
    id: RUN_ID,
    createdAt: "2026-10-06T00:00:00.000Z",
    completedAt: "2026-10-06T00:00:01.000Z",
    source: "manual",
    actorAdminId: "admin_super_1",
    researchOk: true,
    researchErrorCode: null,
    pipelineRunStatus: "OK",
    pipelineVersion: "v1",
    pipelineErrorCode: null,
    opportunityCount: 1,
    gscStatus: "AVAILABLE",
    durabilityStatus: "COMPLETE",
  };
}

function decisionRow(): SeoOpportunityDecisionRow {
  return {
    id: "seodec_a2_12_cat_0001",
    runId: RUN_ID,
    opportunityIndex: 0,
    opportunityIdentity: "oid_a2_12_cat",
    createdAt: "2026-10-06T00:00:00.000Z",
    topic: "Firestick IPTV setup checklist for UK viewers",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    researchRecommendation: "NEW_BLOG",
    researchConfidence: "HIGH",
    existingCoverage: "NONE",
    matchedPublicUrl: "",
    restorePath: "",
    targetPostId: null,
    evaluationStatus: "OK",
    rfVerdict: "PASS_NEW_CONTENT",
    rfFingerprint: "rf_a212",
    nbaAction: "NEW_BLOG",
    nbaStatus: "OK",
    nbaAutonomousEligible: true,
    nbaFingerprint: "nba_a212",
    priorityScore: 80,
    priorityTier: "HIGH",
    priorityScoreVersion: "v1",
    priorityAutomationSelectable: true,
    priorityFingerprint: "pri_a212",
    pipelineFingerprint: "pipe_a212",
    selected: true,
    selectionSource: "manual_proceed",
  };
}

test("A2-12 catalog-ledger DI: exact Planning lookup + missing/archived/fixture exclusions", async () => {
  assert.equal(SEO_AI_ARTICLE_SIDHU_CATALOG_LEDGER_DI_SPEC, "a2-12-sidhu-catalog-ledger-di-local-v1");
  assert.equal(SIDHU_CATALOG_LEDGER_DI_READ_BUDGET.unboundedListingForbidden, true);

  const eligible = baseDraft();
  const archived = baseDraft({
    id: "seoplan_a2_12_arch",
    archivedAt: "2026-10-07T00:00:00.000Z",
  } as Partial<SeoPlanningDraft> & { archivedAt?: string });
  const fixture = baseDraft({
    id: "seoplan_a2_12_fix",
    fingerprint: `${SEO_AI_ARTICLE_APPLY_PROTECTED_FIXTURE_FINGERPRINT_PREFIX}gated`,
  });
  const byId = new Map<string, SeoPlanningDraft>([
    [eligible.id, eligible],
    [archived.id, archived],
    [fixture.id, fixture],
  ]);
  const catalog = createSidhuAuthoritativePlanningCatalogFromInjected({
    async getSeoPlanningDraftById(id) {
      return byId.get(id) ?? null;
    },
    async getPostById() {
      return null;
    },
  });
  assert.equal(sidhuCatalogAdapterExposesOnlyExactReads(catalog), true);
  assert.equal("listPosts" in catalog, false);
  assert.equal("savePost" in catalog, false);
  assert.equal("listSeoPlanningDrafts" in catalog, false);

  const found = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: PLANNING_ID,
    catalog,
  });
  assert.equal(found.ok, true);

  const missing = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: "seoplan_missing_zzzz",
    catalog,
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "planning_not_found");

  const arch = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: archived.id,
    catalog,
  });
  assert.equal(arch.ok, false);
  if (!arch.ok) assert.equal(arch.code, "planning_archived");

  const fix = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: fixture.id,
    catalog,
  });
  assert.equal(fix.ok, false);
  if (!fix.ok) assert.equal(fix.code, "protected_fixture");
});

test("A2-12 catalog-ledger DI: linked Blog identity + conflicting published content surface via loaders", async () => {
  const linked = publishedPost({
    id: "post_linked_shell",
    status: "draft",
    publishedAt: null,
    excerpt: "",
    content: "",
  });
  const planning = baseDraft({ linkedPostId: linked.id });
  const catalog = createSidhuAuthoritativePlanningCatalogFromInjected({
    async getSeoPlanningDraftById(id) {
      return id === planning.id ? planning : null;
    },
    async getPostById(id) {
      return id === linked.id ? linked : null;
    },
  });
  const loaded = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: planning.id,
    catalog,
  });
  assert.equal(loaded.ok, true);
  if (loaded.ok) {
    assert.equal(loaded.linkedPost?.id, linked.id);
    assert.equal(loaded.linkedPost?.status, "draft");
  }

  const missingLinked = baseDraft({
    id: "seoplan_a2_12_missing_link",
    linkedPostId: "post_gone",
  });
  const catalogMissing = createSidhuAuthoritativePlanningCatalogFromInjected({
    async getSeoPlanningDraftById(id) {
      return id === missingLinked.id ? missingLinked : null;
    },
    async getPostById() {
      return null;
    },
  });
  const loadedMissing = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: missingLinked.id,
    catalog: catalogMissing,
  });
  assert.equal(loadedMissing.ok, true);
  if (loadedMissing.ok) assert.equal(loadedMissing.linkedPost, null);
});

test("A2-12 catalog-ledger DI: read failure propagates; no unbounded listing API", async () => {
  const catalog = createSidhuAuthoritativePlanningCatalogFromInjected({
    async getSeoPlanningDraftById() {
      throw new Error("catalog timeout");
    },
    async getPostById() {
      return null;
    },
  });
  await assert.rejects(
    () =>
      loadAuthoritativeSeoPlanningForApply({
        planningDraftId: PLANNING_ID,
        catalog,
      }),
    /catalog timeout/,
  );
  assert.equal(SIDHU_CATALOG_LEDGER_DI_READ_BUDGET.maxPlanningExactLookups, 1);
  assert.equal(SIDHU_CATALOG_LEDGER_DI_READ_BUDGET.maxLinkedBlogLookups, 1);
});

test("A2-12 catalog-ledger DI: first-party catalog from injected slug readers (synthetic Blog)", async () => {
  const planning = baseDraft();
  const post = publishedPost();
  const fp = createFirstPartyVerifyCatalogFromInjected({
    async getSeoPlanningDraftById(id) {
      return id === planning.id ? planning : null;
    },
    async getPostBySlug(slug) {
      return slug === post.slug ? post : null;
    },
  });
  const verified = await verifyPlanningFirstPartySiteFacts({
    planningDraftId: planning.id,
    catalog: fp,
    authorized: true,
  });
  assert.equal(verified.status, "OK");
  assert.ok(verified.groundedEvidence.length >= 1);

  const missingSource = await verifyPlanningFirstPartySiteFacts({
    planningDraftId: planning.id,
    catalog: createFirstPartyVerifyCatalogFromInjected({
      async getSeoPlanningDraftById(id) {
        return id === planning.id ? planning : null;
      },
      async getPostBySlug() {
        return null;
      },
    }),
    authorized: true,
  });
  assert.equal(missingSource.groundedEvidence.length, 0);
  assert.ok(
    missingSource.entries.some((entry) => entry.reasonCode === "SOURCE_NOT_FOUND") ||
      missingSource.status === "FAILED" ||
      missingSource.status === "OK",
  );
  // Missing Blog source must not mint accepted site_fact grounded evidence.
  assert.equal(
    missingSource.entries.every((entry) => entry.reasonCode !== "ACCEPTED"),
    true,
  );
});

test("A2-12 catalog-ledger DI: ledger detail adapter sanitizes errors and bounds calls", async () => {
  const reader = createSidhuLedgerRunDetailReaderFromInjected(async ({ runId }) => {
    if (runId === "throw") throw new Error("ECONNREFUSED mysql://secret:hunter2@127.0.0.1/db");
    if (runId === "badmsg") {
      return {
        ok: false,
        errorCode: "query_error",
        errorMessage: "Access denied for user 'root'@'localhost' using password: YES",
      };
    }
    if (runId !== RUN_ID) {
      return { ok: false, errorCode: "not_found", errorMessage: "missing" };
    }
    return {
      ok: true,
      run: runRow(),
      decisions: [decisionRow()],
      decisionOverflow: false,
    };
  });

  const ok = await reader.getSeoResearchRunDetail({ runId: RUN_ID });
  assert.equal(ok.ok, true);
  assert.equal(reader.callCount, 1);

  const missing = await reader.getSeoResearchRunDetail({ runId: "seorun_other" });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.errorCode, "not_found");

  const thrown = await reader.getSeoResearchRunDetail({ runId: "throw" });
  assert.equal(thrown.ok, false);
  if (!thrown.ok) {
    assert.equal(thrown.errorCode, "query_error");
    assert.match(thrown.errorMessage, /failed closed/i);
    assert.doesNotMatch(thrown.errorMessage, /hunter2|mysql:\/\//i);
  }

  const leaked = await reader.getSeoResearchRunDetail({ runId: "badmsg" });
  assert.equal(leaked.ok, false);
  if (!leaked.ok) {
    assert.doesNotMatch(leaked.errorMessage, /password|root@/i);
  }

  const empty = await reader.getSeoResearchRunDetail({ runId: "  " });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.errorCode, "invalid_id");

  assert.equal(reader.callCount, 5);
  assert.equal(SIDHU_CATALOG_LEDGER_DI_READ_BUDGET.maxLedgerRunDetailLookups, 1);
});
