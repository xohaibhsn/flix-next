/**
 * A2 controlled Sidhu Apply — fail-closed entry + foundation reuse.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import type { SeoResearchOpportunity } from "../lib/cms/ai-seo/research-schemas";
import {
  createSeoDecisionPipelineContextFromData,
  evaluateSeoOpportunityPipeline,
} from "../lib/cms/seo-decision-pipeline";
import {
  SEO_AI_ARTICLE_APPLY_BOUNDED_EXECUTION_ACK,
  SEO_AI_ARTICLE_CONTROLLED_APPLY_SPEC,
  assertTrustedApplyActor,
  executeControlledSidhuNewBlogArticleApply,
  parseControlledArticleApplyInput,
  probeControlledApplyBlockersForDiagnostics,
} from "../lib/cms/seo-planning/article-apply-controlled";
import {
  SEO_AI_ARTICLE_APPLY_PRODUCTION_GATE_CODE,
  SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED,
  evaluateArticleApplyProductionGate,
} from "../lib/cms/seo-planning/article-apply-production-gate";
import {
  A2_APPLY_SCHEMA_NOT_READY_CODE,
  evaluateA2ApplyDurableSchemaReadiness,
} from "../lib/cms/seo-planning/article-apply-schema-readiness";
import { prepareArticleApplyReadiness } from "../lib/cms/seo-planning/article-apply-readiness";
import {
  applyPrivateArticleViaCmsAdapter,
  buildCmsApplyTrustFixtures,
  createFakeCmsApplyTransaction,
  createMemoryCmsTrustStores,
} from "../lib/cms/seo-planning/article-cms-apply-adapter";
import { assessArticleEvidencePackForApply } from "../lib/cms/seo-planning/article-evidence-pack-adapter";
import {
  evaluateNewBlogArticleEligibility,
  SEO_AI_ARTICLE_GENERATION_SPEC,
  type PrivateArticlePreview,
} from "../lib/cms/seo-planning/article-generation";
import { readSeoPlanningEditorialEvidence } from "../lib/cms/seo-planning/editorial-evidence";
import {
  SEO_AI_ONESHOT_PUBLISHER_ACTIVATED,
  inactiveOneshotArticlePublisher,
  isOneshotPublisherActivated,
  oneshotPublisherRejectsPublishedPost,
} from "../lib/cms/seo-planning/article-oneshot-publisher";
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";
import type { TrustedPrivateApplyActor } from "../lib/cms/seo-planning/article-private-apply-local";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

const actor: TrustedPrivateApplyActor = {
  adminId: "admin_test_1",
  hasSeoPermission: true,
  hasBlogPermission: true,
};

function trustedDraftingReady() {
  const ctx = createSeoDecisionPipelineContextFromData({
    posts: [],
    planningDrafts: [],
    runId: "a2-controlled-apply-trust",
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
  return assessArticleEvidencePackForApply({
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
        kind: "source_verified",
        description: "Amazon Fire TV help pages document device setup steps used in the angle.",
        sourceUrl: "https://www.amazon.co.uk/gp/help/customer/display.html",
      },
    ],
    gscEvidence: opp.gscEvidence,
    originalContribution: {
      statement: "UK Firestick setup checklist for Flix readers.",
      backing: "grounded_evidence",
      evidenceIds: ["ge_amazon"],
    },
  });
}

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_controlled_apply",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:controlled-apply",
    topic: "UK IPTV buffering checklist",
    workingTitle: "Fix UK IPTV buffering without guesswork",
    proposedSlug: "uk-iptv-buffering-checklist",
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
        existingCoverage: "NONE",
        confidence: "HIGH",
        matchedTitle: null,
        gscEvidence: [],
      },
      workspace: {
        contentAngle: "Practical home-network checks",
        nextStep: "Draft troubleshooting article",
        humanNotes: "Keep claims modest.",
      },
      sources: [{ title: "Ofcom", domain: "ofcom.org.uk", url: "https://www.ofcom.org.uk/" }],
      gsc: { included: true },
      editorialEvidenceV1: {
        version: "v1",
        originalContribution: "UK evening congestion checklist.",
        readerBenefit: "Isolate home Wi-Fi issues faster.",
        missingEvidenceNotes: "Need first-party verification later.",
        entries: [
          {
            id: "ed_1",
            evidenceType: "EXTERNAL_REFERENCE",
            claim: "Regulator publishes broadband advice",
            url: "https://www.ofcom.org.uk/",
            location: "home",
            notes: "Unverified",
            trust: "EDITORIAL_UNVERIFIED",
          },
        ],
      },
    },
    ...overrides,
  };
}

function sampleArticle() {
  return {
    title: "Fix UK IPTV buffering without guesswork",
    excerpt: "A practical UK checklist to isolate home-network buffering causes.",
    html: "<h2>Start with the local network</h2><p>Check whether other devices on the same Wi-Fi also struggle during peak evening hours.</p>",
  };
}

function previewFor(planning: SeoPlanningDraft): PrivateArticlePreview {
  const eligible = evaluateNewBlogArticleEligibility(planning, { status: "skipped" });
  assert.equal(eligible.ok, true);
  if (!eligible.ok) throw new Error("fixture must be eligible");
  const editorial = readSeoPlanningEditorialEvidence(planning.payload);
  const hasEditorial =
    Boolean(editorial.originalContribution.trim()) ||
    Boolean(editorial.readerBenefit.trim()) ||
    Boolean(editorial.missingEvidenceNotes.trim()) ||
    editorial.entries.length > 0;
  return {
    spec: SEO_AI_ARTICLE_GENERATION_SPEC,
    planningDraftId: planning.id,
    planningUpdatedAt: planning.updatedAt,
    recommendation: "NEW_BLOG",
    writingFingerprint: eligible.fingerprint,
    model: "gpt-blog-article-test",
    article: sampleArticle(),
    evidenceTrust: {
      firstPartySiteFacts: "none_attested",
      editorialEvidence: hasEditorial ? "editorial_unverified" : "absent",
      externalReferences: "unverified",
      aiProse: "ai_generated_untrusted",
      evidencePackComplete: false,
      publicationReady: false,
    },
    requiresHumanFactualReview: true,
    publicationReady: false,
    privatePreview: true,
  };
}

test("GATE: production wiring remains compile-time OFF", () => {
  assert.equal(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED, false);
  const gate = evaluateArticleApplyProductionGate({ envFlag: "1", bodyFlag: { applyEnabled: true } });
  assert.equal(gate.ok, false);
  if (!gate.ok) assert.equal(gate.code, SEO_AI_ARTICLE_APPLY_PRODUCTION_GATE_CODE);
});

test("SCHEMA: durable A2 tables remain unregistered with ensure", () => {
  const schema = evaluateA2ApplyDurableSchemaReadiness();
  assert.equal(schema.ok, false);
  if (!schema.ok) {
    assert.equal(schema.code, A2_APPLY_SCHEMA_NOT_READY_CODE);
    assert.equal(schema.registeredWithEnsure, false);
    assert.equal(schema.workerCutoverStillRequired, true);
  }
});

test("PARSE: client approved=true is rejected", () => {
  const parsed = parseControlledArticleApplyInput({
    planningDraftId: "seoplan_x",
    previewSessionId: "prev_1",
    approvalReceiptId: "apr_1",
    approved: true,
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.code, "client_approval_rejected");
});

test("PARSE: REFRESH / HOLD / RESTORE / SKIP claims are rejected", () => {
  for (const recommendation of ["REFRESH_EXISTING", "HOLD", "RESTORE_HISTORICAL", "SKIP"] as const) {
    const parsed = parseControlledArticleApplyInput({
      planningDraftId: "seoplan_x",
      previewSessionId: "prev_1",
      approvalReceiptId: "apr_1",
      recommendation,
    });
    assert.equal(parsed.ok, false, recommendation);
  }
});

test("PARSE: valid ids accepted without trusting approval flags", () => {
  const parsed = parseControlledArticleApplyInput({
    planningDraftId: "seoplan_ok",
    previewSessionId: "prev_ok",
    approvalReceiptId: "apr_ok",
    clientPreview: { spec: "a1-1" },
    approved: false,
  });
  assert.equal(parsed.ok, true);
});

test("RBAC: missing SEO or Blog permission denied", () => {
  assert.equal(assertTrustedApplyActor(null).ok, false);
  assert.equal(
    assertTrustedApplyActor({
      adminId: "a",
      hasSeoPermission: true,
      hasBlogPermission: false,
    }).ok,
    false,
  );
});

test("ACTION PATH: controlled Apply fails closed on production gate OFF", async () => {
  const result = await executeControlledSidhuNewBlogArticleApply({
    actor,
    rawInput: {
      planningDraftId: "seoplan_ok",
      previewSessionId: "prev_ok",
      approvalReceiptId: "apr_ok",
      executionAcknowledgement: SEO_AI_ARTICLE_APPLY_BOUNDED_EXECUTION_ACK,
      clientPreview: { ignored: true },
      applyEnabled: true,
      approved: false,
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.spec, SEO_AI_ARTICLE_CONTROLLED_APPLY_SPEC);
    assert.equal(result.code, SEO_AI_ARTICLE_APPLY_PRODUCTION_GATE_CODE);
    assert.equal(result.realCmsWrite, false);
    assert.equal(result.committed, false);
    assert.equal(result.publicationReady, false);
    assert.equal(result.adapter, null);
  }
});

test("DIAGNOSTICS: probe reports gate closed and schema unregistered", () => {
  const probe = probeControlledApplyBlockersForDiagnostics();
  assert.equal(probe.productionGateOpen, false);
  assert.equal(probe.schemaRegistered, false);
});

test("FOUNDATION: eligible NEW_BLOG Apply succeeds via reused CMS adapter + memory trust", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: actor.adminId });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({ drafts: [planning], posts: [] });
  const trusted = trustedDraftingReady();
  assert.equal(trusted.applyEvidenceGate, "PASS_DRAFTING_REVIEW_ONLY");

  const applied = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor,
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trusted,
  });
  assert.equal(applied.ok, true);
  if (applied.ok) {
    assert.equal(applied.status, "draft");
    assert.equal(applied.publicationReady, false);
    assert.equal(applied.realCmsWrite, false);
  }
});

test("FOUNDATION: unauthorized actor is rejected by CMS adapter", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: actor.adminId });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({ drafts: [planning], posts: [] });
  const applied = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: { adminId: "admin_x", hasSeoPermission: false, hasBlogPermission: true },
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(applied.ok, false);
  if (!applied.ok) assert.equal(applied.code, "access_denied");
});

test("FOUNDATION: missing provenance fails closed on durable-unavailable path", async () => {
  const { applyPrivateArticleViaCmsAdapterUntilDurableReady } = await import(
    "../lib/cms/seo-planning/article-cms-apply-adapter"
  );
  const planning = draft();
  const preview = previewFor(planning);
  const result = await applyPrivateArticleViaCmsAdapterUntilDurableReady({
    clientPreview: preview,
    previewSessionId: "missing_session",
    approvalReceiptId: "missing_receipt",
    actor,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.code === "PREVIEW_PROVENANCE_UNAVAILABLE" ||
        result.code === "missing_approval" ||
        result.code === "evidence_pack_unavailable",
    );
  }
});

test("FOUNDATION: published Blog protection blocks Apply readiness", () => {
  const planning = draft({ linkedPostId: "post_published" });
  const preview = previewFor(planning);
  const published: BlogPost = {
    id: "post_published",
    title: preview.article.title,
    slug: "uk-iptv-buffering-checklist",
    excerpt: "Published excerpt",
    content: "<p>Published body</p>",
    categoryId: null,
    featuredImage: null,
    status: "published",
    featured: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
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
  };
  const readiness = prepareArticleApplyReadiness({
    planningDraft: planning,
    preview,
    linkedPost: published,
    humanApproval: {
      approvedByAdminId: actor.adminId,
      factualReviewConfirmed: true,
    },
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(readiness.ok, false);
  if (!readiness.ok) {
    assert.ok(readiness.blockingReasons.some((r) => r.code === "published_blocked"));
  }
});

test("ONESHOT: publisher interface remains inactive", async () => {
  assert.equal(SEO_AI_ONESHOT_PUBLISHER_ACTIVATED, false);
  assert.equal(isOneshotPublisherActivated(), false);
  const result = await inactiveOneshotArticlePublisher.publishOne({
    actor,
    article: {
      postId: "post_x",
      planningDraftId: "seoplan_x",
      contentFingerprint: "a".repeat(64),
      recommendation: "NEW_BLOG",
    },
    budget: { maxArticles: 1, maxPaidProviderCalls: 0, emergencyOff: false },
    supervisedPublicationReceiptId: "pub_receipt_1",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "publisher_inactive");
  assert.equal(
    oneshotPublisherRejectsPublishedPost({
      status: "published",
      publishedAt: "2026-01-01T00:00:00.000Z",
    }),
    true,
  );
});

test("WIRING: Server Action exports controlled Apply; gate constant stays false", () => {
  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.match(actions, /export async function applyNewBlogArticlePreviewToPrivateDraftAction/);
  assert.match(actions, /executeControlledSidhuNewBlogArticleApply/);
  const gateSrc = read("lib/cms/seo-planning/article-apply-production-gate.ts");
  assert.match(
    gateSrc,
    /export const SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED:\s*boolean\s*=\s*false/,
  );
});

test("WIRING: schema DDL remains disconnected from ensureCmsSchema", () => {
  const schema = read("lib/cms/seo-planning/article-apply-durable-schema.ts");
  assert.match(schema, /A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE = false/);
  const dbSchema = read("lib/db/schema.ts");
  assert.doesNotMatch(dbSchema, /seo_ai_article_previews/);
  assert.doesNotMatch(dbSchema, /seo_ai_article_approvals/);
  assert.doesNotMatch(dbSchema, /seo_ai_article_apply_audits/);
});
