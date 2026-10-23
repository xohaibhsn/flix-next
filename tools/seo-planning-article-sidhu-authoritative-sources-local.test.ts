/**
 * A2-7 — focused authoritative Planning/evidence source tests (offline).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { SeoResearchOpportunity } from "../lib/cms/ai-seo/research-schemas";
import {
  createSeoDecisionPipelineContextFromData,
  evaluateSeoOpportunityPipeline,
} from "../lib/cms/seo-decision-pipeline";
import {
  assessTrustedEvidenceFromAuthoritativeReader,
  createSyntheticSidhuEvidenceReader,
  createUnavailableSidhuEvidenceReader,
  loadAuthoritativeSeoPlanningForApply,
  type SidhuAuthoritativePlanningCatalog,
} from "../lib/cms/seo-planning/article-sidhu-authoritative-sources-local";
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_a2_7_src",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:a2-7-src",
    topic: "UK IPTV buffering checklist",
    workingTitle: "Fix UK IPTV buffering without guesswork",
    proposedSlug: "uk-iptv-buffering-a2-7",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "TROUBLESHOOTING",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T01:00:00.000Z",
    payload: {
      opportunity: {
        topic: "Frozen topic",
        whyNow: "Readers report evening buffering.",
        webEvidence: "A support page describes a local network check.",
        existingCoverage: "PARTIAL",
        confidence: "HIGH",
        matchedTitle: "Existing guide",
        gscEvidence: [],
      },
      workspace: {
        contentAngle: "Practical home-network checks",
        nextStep: "Draft troubleshooting article",
        humanNotes: "Keep claims modest.",
      },
      sources: [],
      gsc: { included: true },
      editorialEvidenceV1: {
        version: "v1",
        originalContribution: "UK evening congestion checklist.",
        readerBenefit: "Isolate home Wi-Fi issues faster.",
        missingEvidenceNotes: "Need first-party verification later.",
        entries: [],
      },
    },
    ...overrides,
  };
}

function memoryCatalog(drafts: SeoPlanningDraft[], posts: BlogPost[] = []): SidhuAuthoritativePlanningCatalog {
  return {
    async getSeoPlanningDraftById(id) {
      return drafts.find((d) => d.id === id) || null;
    },
    async getPostById(id) {
      return posts.find((p) => p.id === id) || null;
    },
  };
}

function syntheticPackInput() {
  const ctx = createSeoDecisionPipelineContextFromData({
    posts: [],
    planningDrafts: [],
    runId: "a2-7-sources",
  });
  const opp: SeoResearchOpportunity = {
    topic: "Firestick IPTV setup checklist for UK viewers",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    searchIntent: "INFORMATIONAL",
    whyNow: "UK Firestick setup queries are rising while competitor guides stay generic.",
    webEvidence: "Competitor posts list apps without UK device steps or Flix-specific setup notes.",
    existingCoverage: "NONE",
    matchedTitle: null,
    matchedPublicUrl: null,
    recommendation: "NEW_BLOG",
    restorePath: "",
    suggestedAngle: "Practical UK Firestick setup angle.",
    nextStep: "Review in Planning.",
    confidence: "HIGH",
    gscEvidenceRefs: ["Q1"],
    gscEvidence: [
      {
        id: "Q1",
        kind: "query",
        query: "firestick iptv setup uk",
        pageUrl: undefined,
        normalizedPath: null,
        classification: undefined,
        clicks: 12,
        impressions: 200,
        ctr: 0.06,
        position: 18,
        clicksDirection: "UP",
        impressionsDirection: "UP",
        ctrDirection: "FLAT",
        positionDirection: "UP",
      },
    ],
    historicalSignal: false,
  };
  const pipeline = evaluateSeoOpportunityPipeline(ctx, opp);
  return {
    opportunityIndex: 0,
    pipeline,
    sources: [
      {
        title: "Amazon Fire TV setup help",
        url: "https://www.amazon.co.uk/gp/help/customer/display.html",
        domain: "amazon.co.uk",
      },
    ],
    groundedEvidence: [
      {
        id: "ge_amazon",
        kind: "source_verified" as const,
        description: "Amazon Fire TV help pages document device setup steps used in the angle.",
        sourceUrl: "https://www.amazon.co.uk/gp/help/customer/display.html",
      },
      {
        id: "ge_flix_fact",
        kind: "site_fact" as const,
        description: "The Flix IPTV publishes UK-focused Firestick setup guidance on-site.",
      },
    ],
    gscEvidence: opp.gscEvidence,
    originalContribution: {
      statement:
        "Compare Firestick setup steps against The Flix IPTV UK onboarding checklist and supported app list.",
      backing: "grounded_evidence" as const,
      evidenceIds: ["ge_flix_fact", "ge_amazon"],
    },
  };
}

test("load: missing / archived / fixture Planning fail closed", async () => {
  const catalog = memoryCatalog([
    draft({ id: "seoplan_arch", archivedAt: "2026-10-07T00:00:00.000Z" }),
    draft({
      id: "seoplan_fix",
      fingerprint: "TEST_FIXTURE:seo_editorial_evidence_acceptance:v1",
    }),
  ]);

  const missing = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: "seoplan_missing",
    catalog,
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "planning_not_found");

  const archived = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: "seoplan_arch",
    catalog,
  });
  assert.equal(archived.ok, false);
  if (!archived.ok) assert.equal(archived.code, "planning_archived");

  const fixture = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: "seoplan_fix",
    catalog,
  });
  assert.equal(fixture.ok, false);
  if (!fixture.ok) assert.equal(fixture.code, "protected_fixture");
});

test("load: eligible NEW_BLOG Planning with editorial trust classification", async () => {
  const planning = draft();
  const loaded = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: planning.id,
    catalog: memoryCatalog([planning]),
  });
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.planning.id, planning.id);
  assert.equal(loaded.editorialTrust, "EDITORIAL_UNVERIFIED");
  assert.equal(loaded.fixtureMarked, false);
});

test("evidence: unavailable reader and synthetic H3B READY are distinguished", async () => {
  const planning = draft();
  const unavailable = await assessTrustedEvidenceFromAuthoritativeReader({
    planning,
    evidenceReader: createUnavailableSidhuEvidenceReader(),
  });
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) {
    assert.equal(unavailable.code, "evidence_unavailable");
    assert.equal(unavailable.provenance, "unavailable");
  }

  const ready = await assessTrustedEvidenceFromAuthoritativeReader({
    planning,
    evidenceReader: createSyntheticSidhuEvidenceReader(syntheticPackInput()),
  });
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  assert.equal(ready.provenance, "synthetic_test");
  assert.equal(ready.trustedEvidencePack.applyEvidenceGate, "PASS_DRAFTING_REVIEW_ONLY");
  assert.equal(ready.trustedEvidencePack.authorizeApply, false);
});
