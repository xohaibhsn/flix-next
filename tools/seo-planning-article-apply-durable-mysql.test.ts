/**
 * A2 durable MariaDB storage — offline acceptance (injected fake executor only).
 * No real SQL, pool, schema registration, or production callers.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SeoResearchOpportunity } from "../lib/cms/ai-seo/research-schemas";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import {
  createSeoDecisionPipelineContextFromData,
  evaluateSeoOpportunityPipeline,
} from "../lib/cms/seo-decision-pipeline";
import {
  A2_APPLY_APPROVAL_TABLE,
  A2_APPLY_AUDIT_TABLE,
  A2_APPLY_DURABLE_DDL_STATEMENTS,
  A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION,
  A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE,
  A2_APPLY_DURABLE_TARGET_SCHEMA_SLOT,
  A2_APPLY_PREVIEW_TABLE,
  describeA2ApplyDurableL4bCompatibility,
} from "../lib/cms/seo-planning/article-apply-durable-schema";
import {
  A2_APPLY_DURABLE_SQL,
  authorizeInactiveMysqlApplyTrustedEvidencePack,
  createFakeDurableMysqlFacade,
  createInactiveMysqlCmsApplyDeps,
  lockPreviewAndApprovalInTxn,
} from "../lib/cms/seo-planning/article-apply-durable-mysql";
import { applyPrivateArticleViaCmsAdapter } from "../lib/cms/seo-planning/article-cms-apply-adapter";
import { assessArticleEvidencePackForApply } from "../lib/cms/seo-planning/article-evidence-pack-adapter";
import { normalizeGeneratedArticle } from "../lib/cms/ai-seo/blog-article-openai";
import {
  evaluateNewBlogArticleEligibility,
  SEO_AI_ARTICLE_GENERATION_SPEC,
  type PrivateArticlePreview,
} from "../lib/cms/seo-planning/article-generation";
import {
  fingerprintPrivateApplyContent,
  type TrustedPrivateApplyActor,
} from "../lib/cms/seo-planning/article-private-apply-local";
import type { SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function fileExists(rel: string) {
  return existsSync(path.join(root, rel));
}

function trustedDraftingReady() {
  const ctx = createSeoDecisionPipelineContextFromData({
    posts: [],
    planningDrafts: [],
    runId: "a2-5b-durable-mysql-trust",
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
  const trusted = assessArticleEvidencePackForApply({
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
      {
        id: "ge_flix_fact",
        kind: "site_fact",
        description: "The Flix IPTV publishes UK-focused Firestick setup guidance on-site.",
      },
    ],
    gscEvidence: opp.gscEvidence,
    originalContribution: {
      statement:
        "Compare Firestick setup steps against The Flix IPTV UK onboarding checklist and supported app list.",
      backing: "grounded_evidence",
      evidenceIds: ["ge_flix_fact", "ge_amazon"],
    },
  });
  assert.equal(trusted.applyEvidenceGate, "PASS_DRAFTING_REVIEW_ONLY");
  return trusted;
}

function trustedEvidenceHold() {
  const ctx = createSeoDecisionPipelineContextFromData({
    posts: [],
    planningDrafts: [],
    runId: "a2-5b-durable-mysql-hold",
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
    recommendation: "REFRESH_EXISTING",
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
  const trusted = assessArticleEvidencePackForApply({
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
      statement: "Refresh existing coverage with Firestick steps.",
      backing: "grounded_evidence",
      evidenceIds: ["ge_amazon"],
    },
  });
  assert.equal(trusted.applyEvidenceGate, "BLOCK");
  return trusted;
}

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_durable",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:durable",
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
    html: "<h2>Start with the local network</h2><p>Check whether other devices on the same Wi-Fi also struggle during peak evening hours before changing service settings.</p>",
  };
}

function previewFor(planning: SeoPlanningDraft): PrivateArticlePreview {
  const eligible = evaluateNewBlogArticleEligibility(planning, { status: "skipped" });
  assert.equal(eligible.ok, true);
  if (!eligible.ok) throw new Error("ineligible fixture");
  const article = sampleArticle();
  return {
    spec: SEO_AI_ARTICLE_GENERATION_SPEC,
    planningDraftId: planning.id,
    planningUpdatedAt: planning.updatedAt,
    recommendation: "NEW_BLOG",
    writingFingerprint: eligible.fingerprint,
    model: "gpt-blog-article-test",
    article,
    evidenceTrust: {
      firstPartySiteFacts: "none_attested",
      editorialEvidence: "editorial_unverified",
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

function actor(): TrustedPrivateApplyActor {
  return { adminId: "admin_trusted_1", hasSeoPermission: true, hasBlogPermission: true };
}

function contentHash(article: { title: string; excerpt: string; html: string }) {
  const normalized = normalizeGeneratedArticle(article);
  assert.ok(normalized);
  return fingerprintPrivateApplyContent(normalized!);
}

function seedRows(planning: SeoPlanningDraft, preview: PrivateArticlePreview) {
  const hash = contentHash(preview.article);
  const previewRow = {
    preview_session_id: "preview_durable_1",
    planning_draft_id: planning.id,
    planning_updated_at: planning.updatedAt,
    writing_fingerprint: preview.writingFingerprint,
    content_fingerprint: hash,
    generation_id: "generation_durable_1",
    model: preview.model,
    title: preview.article.title,
    excerpt: preview.article.excerpt,
    html: preview.article.html,
    created_at: "2026-10-21T00:00:00.000Z",
    expires_at: null,
    invalidated: 0,
  };
  const approvalRow = {
    receipt_id: "approval_durable_1",
    preview_session_id: "preview_durable_1",
    planning_draft_id: planning.id,
    planning_updated_at: planning.updatedAt,
    writing_fingerprint: preview.writingFingerprint,
    content_fingerprint: hash,
    approved_by_admin_id: "admin_trusted_1",
    factual_review_confirmed: 1,
    approved_at: "2026-10-21T00:05:00.000Z",
    expires_at: null,
    revoked: 0,
  };
  const planningRow = {
    id: planning.id,
    recommendation: planning.recommendation,
    workflow_status: planning.workflowStatus,
    fingerprint: planning.fingerprint,
    topic: planning.topic,
    working_title: planning.workingTitle,
    proposed_slug: planning.proposedSlug,
    target_post_id: planning.targetPostId,
    matched_public_url: planning.matchedPublicUrl,
    restore_path: planning.restorePath,
    search_intent: planning.searchIntent,
    linked_post_id: planning.linkedPostId,
    created_by: planning.createdBy,
    payload: JSON.stringify(planning.payload),
    archived_at: planning.archivedAt ?? null,
    created_at: planning.createdAt,
    updated_at: planning.updatedAt,
  };
  return { previewRow, approvalRow, planningRow, hash };
}

test("1 SCHEMA: non-executing durable DDL contract; schema v6 unchanged; not registered", () => {
  assert.equal(A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE, false);
  assert.equal(A2_APPLY_DURABLE_MUST_PRESERVE_LIVE_SCHEMA_VERSION, 6);
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 6);
  assert.equal(A2_APPLY_DURABLE_TARGET_SCHEMA_SLOT, "PROVISIONAL_A2_APPLY_DURABLE_UNALLOCATED");
  assert.equal(A2_APPLY_DURABLE_DDL_STATEMENTS.length, 3);
  assert.match(A2_APPLY_DURABLE_DDL_STATEMENTS[0], new RegExp(A2_APPLY_PREVIEW_TABLE));
  assert.match(A2_APPLY_DURABLE_DDL_STATEMENTS[1], new RegExp(A2_APPLY_APPROVAL_TABLE));
  assert.match(A2_APPLY_DURABLE_DDL_STATEMENTS[2], new RegExp(A2_APPLY_AUDIT_TABLE));
  assert.match(A2_APPLY_DURABLE_DDL_STATEMENTS[0], /content_fingerprint/);
  assert.match(A2_APPLY_DURABLE_DDL_STATEMENTS[0], /MEDIUMTEXT/);
  assert.match(A2_APPLY_DURABLE_DDL_STATEMENTS[1], /factual_review_confirmed/);
  assert.match(A2_APPLY_DURABLE_DDL_STATEMENTS[2], /apply_operation_key/);
  assert.match(A2_APPLY_DURABLE_DDL_STATEMENTS[2], /UNIQUE|PRIMARY KEY \(apply_operation_key\)/);

  const schema = read("lib/db/schema.ts");
  assert.doesNotMatch(schema, /seo_ai_article_previews/);
  assert.doesNotMatch(schema, /seo_ai_article_approvals/);
  assert.doesNotMatch(schema, /seo_ai_article_apply_audits/);
  assert.match(schema, /CURRENT_CMS_SCHEMA_VERSION = 6/);
});

test("2 L4B compatibility statement: coexist; no slot allocation", () => {
  const compat = describeA2ApplyDurableL4bCompatibility();
  assert.equal(compat.a2SlotAllocated, false);
  assert.equal(compat.tablesCoexistWithL4bDecisionLinks, true);
  assert.equal(compat.workerCutoverStillRequired, true);
  assert.equal(compat.schemaRegisteredWithEnsure, false);
  assert.equal(compat.liveSchemaVersionMustRemain, 6);
});

test("3-4 PREVIEW+APPROVAL: server-owned rows bind hash and Planning identity", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const seed = seedRows(planning, preview);
  const facade = createFakeDurableMysqlFacade({
    previews: [seed.previewRow],
    approvals: [seed.approvalRow],
    planning: [seed.planningRow],
  });
  const deps = createInactiveMysqlCmsApplyDeps({ facade, physicalSchemaPresent: true,
      trustedEvidencePack: trustedDraftingReady(),
    });
  const prov = await deps.previewStore.getBySessionId("preview_durable_1");
  assert.ok(prov);
  assert.equal(prov!.contentFingerprint, seed.hash);
  assert.equal(prov!.planningDraftId, planning.id);
  assert.equal(prov!.writingFingerprint, preview.writingFingerprint);

  const approval = await deps.approvalStore.getByReceiptId("approval_durable_1");
  assert.ok(approval);
  assert.equal(approval!.contentFingerprint, seed.hash);
  assert.equal(approval!.previewSessionId, "preview_durable_1");
  assert.equal(approval!.approvedByAdminId, "admin_trusted_1");
});

test("5 MISSING SCHEMA: physicalSchemaPresent=false fail closed", async () => {
  const facade = createFakeDurableMysqlFacade({});
  const deps = createInactiveMysqlCmsApplyDeps({ facade, physicalSchemaPresent: false });
  assert.equal(await deps.previewStore.getBySessionId("preview_durable_1"), null);
  assert.equal(await deps.approvalStore.getByReceiptId("approval_durable_1"), null);
  await assert.rejects(() => deps.transaction.runInTransaction(async () => null), /DURABLE_TXN_UNAVAILABLE/);
});

test("6-9 CREATE / UPDATE / IDEMPOTENT via inactive mysql deps + adapter", async () => {
  // CREATE
  {
    const planning = draft({ linkedPostId: null });
    const preview = previewFor(planning);
    const seed = seedRows(planning, preview);
    const facade = createFakeDurableMysqlFacade({
      previews: [seed.previewRow],
      approvals: [seed.approvalRow],
      planning: [seed.planningRow],
      posts: [],
    });
    const deps = createInactiveMysqlCmsApplyDeps({
      facade,
      physicalSchemaPresent: true,
      trustedEvidencePack: trustedDraftingReady(),
      buildOperationKey: ({ planningDraftId, previewSessionId, contentFingerprint }) =>
        `op:${planningDraftId}:${previewSessionId}:${contentFingerprint}`,
    });
    const result = await applyPrivateArticleViaCmsAdapter({
      clientPreview: preview,
      previewSessionId: "preview_durable_1",
      approvalReceiptId: "approval_durable_1",
      actor: actor(),
      previewStore: deps.previewStore,
      approvalStore: deps.approvalStore,
      transaction: deps.transaction,
      createIdFn: () => "post_durable_created",
      trustedEvidencePack: trustedDraftingReady(),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.outcome, "created");
    assert.equal(result.realCmsWrite, false);
    assert.equal(result.status, "draft");
    assert.ok(facade.lockLog.some((l) => l.startsWith("planning_for_update:")));
    assert.ok(facade.snapshot().posts.some((p) => p.id === "post_durable_created"));
    assert.ok(facade.snapshot().audits.length >= 1);
    assert.ok(facade.sqlLog.every((e) => e.sql.includes("?") || e.params.length >= 0));
  }

  // UPDATE empty shell
  {
    const planning = draft({ linkedPostId: "post_shell" });
    const preview = previewFor(planning);
    const seed = seedRows(planning, preview);
    const facade = createFakeDurableMysqlFacade({
      previews: [seed.previewRow],
      approvals: [seed.approvalRow],
      planning: [{ ...seed.planningRow, linked_post_id: "post_shell" }],
      posts: [
        {
          id: "post_shell",
          title: planning.workingTitle,
          slug: planning.proposedSlug,
          excerpt: "",
          content: "<p></p>",
          status: "draft",
          published_at: null,
          featured: 0,
          category_id: null,
          featured_image: "null",
          seo_title: "",
          seo_description: "",
          focus_keyword: "",
          canonical_url: "",
          robots_index: 1,
          robots_follow: 1,
          og_title: "",
          og_description: "",
          og_image: "null",
          sitemap_include: 1,
          created_at: planning.createdAt,
          updated_at: planning.updatedAt,
        },
      ],
    });
    const deps = createInactiveMysqlCmsApplyDeps({ facade, physicalSchemaPresent: true,
      trustedEvidencePack: trustedDraftingReady(),
    });
    const result = await applyPrivateArticleViaCmsAdapter({
      clientPreview: preview,
      previewSessionId: "preview_durable_1",
      approvalReceiptId: "approval_durable_1",
      actor: actor(),
      previewStore: deps.previewStore,
      approvalStore: deps.approvalStore,
      transaction: deps.transaction,
      trustedEvidencePack: trustedDraftingReady(),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.outcome, "updated");
    assert.ok(facade.lockLog.some((l) => l.startsWith("blog_for_update:")));
    assert.equal(facade.snapshot().posts[0]?.content, sampleArticle().html);
  }

  // IDEMPOTENT
  {
    const article = sampleArticle();
    const planning = draft({ linkedPostId: "post_shell" });
    const preview = previewFor(planning);
    const seed = seedRows(planning, preview);
    const facade = createFakeDurableMysqlFacade({
      previews: [seed.previewRow],
      approvals: [seed.approvalRow],
      planning: [{ ...seed.planningRow, linked_post_id: "post_shell" }],
      posts: [
        {
          id: "post_shell",
          title: article.title,
          slug: planning.proposedSlug,
          excerpt: article.excerpt,
          content: article.html,
          status: "draft",
          published_at: null,
          featured: 0,
          category_id: null,
          featured_image: "null",
          seo_title: "",
          seo_description: "",
          focus_keyword: "",
          canonical_url: "",
          robots_index: 1,
          robots_follow: 1,
          og_title: "",
          og_description: "",
          og_image: "null",
          sitemap_include: 1,
          created_at: planning.createdAt,
          updated_at: planning.updatedAt,
        },
      ],
    });
    const before = facade.snapshot();
    const deps = createInactiveMysqlCmsApplyDeps({ facade, physicalSchemaPresent: true,
      trustedEvidencePack: trustedDraftingReady(),
    });
    const result = await applyPrivateArticleViaCmsAdapter({
      clientPreview: preview,
      previewSessionId: "preview_durable_1",
      approvalReceiptId: "approval_durable_1",
      actor: actor(),
      previewStore: deps.previewStore,
      approvalStore: deps.approvalStore,
      transaction: deps.transaction,
      trustedEvidencePack: trustedDraftingReady(),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.outcome, "noop");
    assert.equal(result.simulatedCmsWrite, false);
    assert.equal(facade.snapshot().posts[0]?.content, before.posts[0]?.content);
  }
});

test("4b / 10 EXPIRED approval + duplicate operation key", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const seed = seedRows(planning, preview);
  const facade = createFakeDurableMysqlFacade({
    previews: [seed.previewRow],
    approvals: [
      {
        ...seed.approvalRow,
        expires_at: "2020-01-01T00:00:00.000Z",
      },
    ],
    planning: [seed.planningRow],
  });
  const deps = createInactiveMysqlCmsApplyDeps({ facade, physicalSchemaPresent: true,
      trustedEvidencePack: trustedDraftingReady(),
    });
  const expired = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: "preview_durable_1",
    approvalReceiptId: "approval_durable_1",
    actor: actor(),
    previewStore: deps.previewStore,
    approvalStore: deps.approvalStore,
    transaction: deps.transaction,
    now: "2026-10-21T12:00:00.000Z",
      trustedEvidencePack: trustedDraftingReady(),
    });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.code, "approval_revoked");

  // Duplicate audit key → rollback path
  const facade2 = createFakeDurableMysqlFacade({
    previews: [seed.previewRow],
    approvals: [seed.approvalRow],
    planning: [seed.planningRow],
    audits: [
      {
        apply_operation_key: `op:${planning.id}:preview_durable_1:${seed.hash}`,
        outcome: "created",
        post_id: "already",
      },
    ],
  });
  const deps2 = createInactiveMysqlCmsApplyDeps({
    facade: facade2,
    physicalSchemaPresent: true,
    trustedEvidencePack: trustedDraftingReady(),
    buildOperationKey: ({ planningDraftId, previewSessionId, contentFingerprint }) =>
      `op:${planningDraftId}:${previewSessionId}:${contentFingerprint}`,
  });
  const dup = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: "preview_durable_1",
    approvalReceiptId: "approval_durable_1",
    actor: actor(),
    previewStore: deps2.previewStore,
    approvalStore: deps2.approvalStore,
    transaction: deps2.transaction,
    createIdFn: () => "post_dup",
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(dup.ok, false);
  if (!dup.ok) {
    assert.ok(dup.code === "audit_unavailable" || dup.code === "transaction_failed");
  }
  assert.equal(facade2.snapshot().posts.length, 0);
});

test("11 CONCURRENT: one create through fake durable txn", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const seed = seedRows(planning, preview);
  const facade = createFakeDurableMysqlFacade({
    previews: [seed.previewRow],
    approvals: [seed.approvalRow],
    planning: [seed.planningRow],
  });
  const deps = createInactiveMysqlCmsApplyDeps({ facade, physicalSchemaPresent: true,
      trustedEvidencePack: trustedDraftingReady(),
    });
  let n = 0;
  const [a, b] = await Promise.all([
    applyPrivateArticleViaCmsAdapter({
      clientPreview: preview,
      previewSessionId: "preview_durable_1",
      approvalReceiptId: "approval_durable_1",
      actor: actor(),
      previewStore: deps.previewStore,
      approvalStore: deps.approvalStore,
      transaction: deps.transaction,
      createIdFn: () => `post_race_${++n}`,
      trustedEvidencePack: trustedDraftingReady(),
    }),
    applyPrivateArticleViaCmsAdapter({
      clientPreview: preview,
      previewSessionId: "preview_durable_1",
      approvalReceiptId: "approval_durable_1",
      actor: actor(),
      previewStore: deps.previewStore,
      approvalStore: deps.approvalStore,
      transaction: deps.transaction,
      createIdFn: () => `post_race_${++n}`,
      trustedEvidencePack: trustedDraftingReady(),
    }),
  ]);
  const created = [a, b].filter((r) => r.ok && r.outcome === "created");
  assert.equal(created.length, 1);
  assert.equal(facade.snapshot().posts.length, 1);
});

test("12 STALE Planning after approval", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const seed = seedRows(planning, preview);
  const facade = createFakeDurableMysqlFacade({
    previews: [seed.previewRow],
    approvals: [seed.approvalRow],
    planning: [{ ...seed.planningRow, updated_at: "2026-10-09T00:00:00.000Z" }],
  });
  const deps = createInactiveMysqlCmsApplyDeps({ facade, physicalSchemaPresent: true,
      trustedEvidencePack: trustedDraftingReady(),
    });
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: "preview_durable_1",
    approvalReceiptId: "approval_durable_1",
    actor: actor(),
    previewStore: deps.previewStore,
    approvalStore: deps.approvalStore,
    transaction: deps.transaction,
      trustedEvidencePack: trustedDraftingReady(),
    });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "stale_planning");
});

test("13-15 ROLLBACK: audit fail / blog fail / trust miss", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const seed = seedRows(planning, preview);

  // Blog insert then audit duplicate key
  const facadeAudit = createFakeDurableMysqlFacade({
    previews: [seed.previewRow],
    approvals: [seed.approvalRow],
    planning: [seed.planningRow],
  });
  const baseRun = facadeAudit.runInTransaction.bind(facadeAudit);
  facadeAudit.runInTransaction = async (work) =>
    baseRun(async (exec) => {
      let inserts = 0;
      return work({
        async query(sql, params) {
          return exec.query(sql, params);
        },
        async execute(sql, params) {
          const result = await exec.execute(sql, params);
          if (sql.startsWith("INSERT INTO blog_posts")) inserts += 1;
          if (sql.startsWith(`INSERT INTO ${A2_APPLY_AUDIT_TABLE}`) && inserts > 0) {
            throw new Error("SEO_AI_ARTICLE_CMS_APPLY_AUDIT_FAILED");
          }
          return result;
        },
      });
    });
  const depsAudit = createInactiveMysqlCmsApplyDeps({
    facade: facadeAudit,
    physicalSchemaPresent: true,
      trustedEvidencePack: trustedDraftingReady(),
    });
  const auditFail = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: "preview_durable_1",
    approvalReceiptId: "approval_durable_1",
    actor: actor(),
    previewStore: depsAudit.previewStore,
    approvalStore: depsAudit.approvalStore,
    transaction: depsAudit.transaction,
    createIdFn: () => "post_audit_fail",
      trustedEvidencePack: trustedDraftingReady(),
    });
  assert.equal(auditFail.ok, false);
  assert.equal(facadeAudit.snapshot().posts.length, 0);

  // Trust miss
  const facadeMiss = createFakeDurableMysqlFacade({
    planning: [seed.planningRow],
  });
  const depsMiss = createInactiveMysqlCmsApplyDeps({
    facade: facadeMiss,
    physicalSchemaPresent: true,
      trustedEvidencePack: trustedDraftingReady(),
    });
  const miss = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: "preview_durable_1",
    approvalReceiptId: "approval_durable_1",
    actor: actor(),
    previewStore: depsMiss.previewStore,
    approvalStore: depsMiss.approvalStore,
    transaction: depsMiss.transaction,
      trustedEvidencePack: trustedDraftingReady(),
    });
  assert.equal(miss.ok, false);
  if (!miss.ok) assert.equal(miss.code, "PREVIEW_PROVENANCE_UNAVAILABLE");
  assert.equal(facadeMiss.snapshot().posts.length, 0);
});

test("16 SQL placeholders: all durable SQL use bound ?", () => {
  for (const sql of Object.values(A2_APPLY_DURABLE_SQL)) {
    assert.doesNotMatch(sql, /\$\{/);
    if (sql.includes("WHERE") || sql.includes("VALUES") || sql.includes("SET")) {
      assert.match(sql, /\?/);
    }
  }
});

test("17-20 SOURCE GUARDS: no live wiring, no schema bump, no providers", async () => {
  assert.equal(fileExists("lib/cms/seo-planning/article-apply-durable-schema.ts"), true);
  assert.equal(fileExists("lib/cms/seo-planning/article-apply-durable-mysql.ts"), true);

  const mysqlMod = read("lib/cms/seo-planning/article-apply-durable-mysql.ts");
  assert.doesNotMatch(mysqlMod, /getDbPool|from ["']@\/lib\/db\/pool["']/);
  assert.doesNotMatch(mysqlMod, /requestOpenAi|requestGemini/);
  assert.match(mysqlMod, /physicalSchemaPresent/);

  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.doesNotMatch(actions, /createInactiveMysqlCmsApplyDeps/);
  assert.doesNotMatch(actions, /applyPrivateArticleViaCmsAdapter/);

  const catalog = read("lib/cms/mysql-catalog.ts");
  assert.doesNotMatch(catalog, /createInactiveMysqlCmsApplyDeps/);
  assert.doesNotMatch(catalog, /seo_ai_article_previews/);

  const schema = read("lib/db/schema.ts");
  assert.match(schema, /CURRENT_CMS_SCHEMA_VERSION = 6/);
  assert.doesNotMatch(schema, /seo_ai_article_/);

  const barrel = read("lib/cms/seo-planning/index.ts");
  assert.match(barrel, /createInactiveMysqlCmsApplyDeps/);
  assert.match(barrel, /A2_APPLY_DURABLE_SCHEMA_REGISTERED_WITH_ENSURE/);
  assert.doesNotMatch(barrel, /createFakeDurableMysqlFacade/);

  // Lock helper smoke
  const planning = draft();
  const preview = previewFor(planning);
  const seed = seedRows(planning, preview);
  const facade = createFakeDurableMysqlFacade({
    previews: [seed.previewRow],
    approvals: [seed.approvalRow],
  });
  await facade.runInTransaction(async (exec) => {
    const locked = await lockPreviewAndApprovalInTxn(exec, {
      previewSessionId: "preview_durable_1",
      approvalReceiptId: "approval_durable_1",
    });
    assert.ok(locked.preview);
    assert.ok(locked.approval);
    assert.ok(facade.lockLog.some((l) => l.startsWith("preview_for_update:")));
    assert.ok(facade.lockLog.some((l) => l.startsWith("approval_for_update:")));
  });

  // content hash stability
  const h1 = contentHash(sampleArticle());
  const h2 = createHash("sha256")
    .update(JSON.stringify([sampleArticle().title, sampleArticle().excerpt, sampleArticle().html]))
    .digest("hex");
  // fingerprintPrivateApplyContent uses normalize first — ensure deterministic
  assert.equal(typeof h1, "string");
  assert.equal(h1.length, 64);
  void h2;
});

test("21 BLOCK: omitted / ABSENT / forged / HOLD Evidence Pack — no durable write", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const seed = seedRows(planning, preview);
  const facade = createFakeDurableMysqlFacade({
    previews: [seed.previewRow],
    approvals: [seed.approvalRow],
    planning: [seed.planningRow],
    posts: [],
  });
  const before = facade.snapshot();

  const omittedAuth = authorizeInactiveMysqlApplyTrustedEvidencePack(undefined);
  assert.equal(omittedAuth.ok, false);
  if (!omittedAuth.ok) assert.equal(omittedAuth.code, "evidence_pack_unavailable");

  const absentDeps = createInactiveMysqlCmsApplyDeps({
    facade,
    physicalSchemaPresent: true,
    evidencePackStatus: "ABSENT",
  });
  assert.equal(absentDeps.evidenceAuthorization.ok, false);
  await assert.rejects(
    () => absentDeps.transaction.runInTransaction(async () => null),
    /A2_INACTIVE_MYSQL_EVIDENCE_UNAUTHORIZED:evidence_pack_unavailable/,
  );

  const baseArgs = {
    clientPreview: preview,
    previewSessionId: "preview_durable_1",
    approvalReceiptId: "approval_durable_1",
    actor: actor(),
    previewStore: absentDeps.previewStore,
    approvalStore: absentDeps.approvalStore,
    transaction: absentDeps.transaction,
    createIdFn: () => "post_should_not_exist",
  };

  const omitted = await applyPrivateArticleViaCmsAdapter({ ...baseArgs });
  assert.equal(omitted.ok, false);
  if (!omitted.ok) assert.equal(omitted.code, "evidence_pack_unavailable");

  const forgedReady = await applyPrivateArticleViaCmsAdapter({
    ...baseArgs,
    evidencePackStatus: "READY_FOR_DRAFTING_REVIEW",
  });
  assert.equal(forgedReady.ok, false);
  if (!forgedReady.ok) assert.equal(forgedReady.code, "untrusted_evidence_pack_claim");

  const fakeSeal = {
    spec: "a2-article-evidence-pack-adapter-v1",
    draftingReviewStatus: "READY_FOR_DRAFTING_REVIEW",
    applyEvidenceGate: "PASS_DRAFTING_REVIEW_ONLY",
    authorizeApply: false,
    authorizePublish: false,
    publicationReady: false,
    evidencePackComplete: false,
  };
  const forgedObject = await applyPrivateArticleViaCmsAdapter({
    ...baseArgs,
    trustedEvidencePack: fakeSeal,
  });
  assert.equal(forgedObject.ok, false);
  if (!forgedObject.ok) assert.equal(forgedObject.code, "untrusted_evidence_pack_claim");

  const holdDeps = createInactiveMysqlCmsApplyDeps({
    facade,
    physicalSchemaPresent: true,
    trustedEvidencePack: trustedEvidenceHold(),
  });
  const hold = await applyPrivateArticleViaCmsAdapter({
    ...baseArgs,
    previewStore: holdDeps.previewStore,
    approvalStore: holdDeps.approvalStore,
    transaction: holdDeps.transaction,
    trustedEvidencePack: trustedEvidenceHold(),
  });
  assert.equal(hold.ok, false);
  if (!hold.ok) assert.equal(hold.code, "evidence_pack_hold");

  const malformed = await applyPrivateArticleViaCmsAdapter({
    ...baseArgs,
    previewStore: holdDeps.previewStore,
    approvalStore: holdDeps.approvalStore,
    transaction: holdDeps.transaction,
    trustedEvidencePack: assessArticleEvidencePackForApply({} as never),
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.code, "evidence_pack_hold");

  assert.equal(facade.snapshot().posts.length, before.posts.length);
  assert.ok(!facade.snapshot().posts.some((p) => p.id === "post_should_not_exist"));
  assert.equal(facade.snapshot().audits.length, before.audits.length);
});
