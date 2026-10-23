/**
 * A2 CMS Apply adapter — offline transactional acceptance tests.
 * Injected fake txn + in-memory trust stores only. No MySQL, JSON CMS, or providers.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SeoResearchOpportunity } from "../lib/cms/ai-seo/research-schemas";
import {
  createSeoDecisionPipelineContextFromData,
  evaluateSeoOpportunityPipeline,
} from "../lib/cms/seo-decision-pipeline";
import {
  applyPrivateArticleViaCmsAdapter,
  applyPrivateArticleViaCmsAdapterUntilDurableReady,
  buildCmsApplyTrustFixtures,
  createDurableCmsApplyUnavailableDeps,
  createFakeCmsApplyTransaction,
  createMemoryCmsTrustStores,
  SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_SPEC,
  type CmsApplyTxnOps,
} from "../lib/cms/seo-planning/article-cms-apply-adapter";
import { assessArticleEvidencePackForApply } from "../lib/cms/seo-planning/article-evidence-pack-adapter";
import {
  evaluateNewBlogArticleEligibility,
  SEO_AI_ARTICLE_GENERATION_SPEC,
  type PrivateArticlePreview,
} from "../lib/cms/seo-planning/article-generation";
import {
  readSeoPlanningEditorialEvidence,
  SEO_PLANNING_EDITORIAL_TRUST,
} from "../lib/cms/seo-planning/editorial-evidence";
import type { TrustedPrivateApplyActor } from "../lib/cms/seo-planning/article-private-apply-local";
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";

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
    runId: "a2-5b-cms-adapter-trust",
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
    runId: "a2-5b-cms-adapter-hold",
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
    id: "seoplan_cms_apply",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:cms-apply",
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
    html: "<h2>Start with the local network</h2><p>Check whether other devices on the same Wi-Fi also struggle during peak evening hours.</p>",
  };
}

function emptyPost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post_cms_shell",
    title: "Fix UK IPTV buffering without guesswork",
    slug: "uk-iptv-buffering-checklist",
    excerpt: "",
    content: "<p></p>",
    categoryId: null,
    featuredImage: null,
    status: "draft",
    featured: false,
    publishedAt: null,
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T00:00:00.000Z",
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

function previewFor(planning: SeoPlanningDraft, article = sampleArticle()): PrivateArticlePreview {
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
    article,
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

function actor(overrides: Partial<TrustedPrivateApplyActor> = {}): TrustedPrivateApplyActor {
  return {
    adminId: "admin_trusted_1",
    hasSeoPermission: true,
    hasBlogPermission: true,
    ...overrides,
  };
}

function setup(planning: SeoPlanningDraft, posts: BlogPost[] = []) {
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({
    preview,
    adminId: "admin_trusted_1",
  });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({ drafts: [planning], posts });
  return { preview, fixtures, trusts, txn };
}

async function applyOk(
  planning: SeoPlanningDraft,
  posts: BlogPost[] = [],
  overrides: {
    actor?: TrustedPrivateApplyActor;
    createIdFn?: () => string;
    previewSessionId?: string;
    approvalReceiptId?: string;
  } = {},
) {
  const ctx = setup(planning, posts);
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: ctx.preview,
    previewSessionId: overrides.previewSessionId || ctx.fixtures.provenance.previewSessionId,
    approvalReceiptId: overrides.approvalReceiptId || ctx.fixtures.approval.receiptId,
    actor: overrides.actor || actor(),
    previewStore: ctx.trusts.previewStore,
    approvalStore: ctx.trusts.approvalStore,
    transaction: ctx.txn,
    trustedEvidencePack: trustedDraftingReady(),
    createIdFn: overrides.createIdFn,
  });
  return { ...ctx, result };
}

test("1 CREATE: trusted actor + provenance + approval → simulated private create", async () => {
  const { result, txn } = await applyOk(draft({ linkedPostId: null }), [], {
    createIdFn: () => "post_cms_created",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec, SEO_AI_ARTICLE_CMS_APPLY_ADAPTER_SPEC);
  assert.equal(result.outcome, "created");
  assert.equal(result.status, "draft");
  assert.equal(result.publishedAt, null);
  assert.equal(result.publicationReady, false);
  assert.equal(result.realCmsWrite, false);
  assert.equal(result.simulatedCmsWrite, true);
  assert.equal(result.auditCommitted, true);
  assert.equal(result.providerRequests, 0);
  assert.equal(txn.getPost("post_cms_created")?.status, "draft");
  assert.equal(txn.getDraft("seoplan_cms_apply")?.linkedPostId, "post_cms_created");
  assert.ok(txn.lockLog.some((l) => l.startsWith("planning_for_update:")));
});

test("2 UPDATE: valid linked untouched shell", async () => {
  const { result, txn } = await applyOk(draft({ linkedPostId: "post_cms_shell" }), [emptyPost()]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.outcome, "updated");
  assert.equal(txn.getPost("post_cms_shell")?.content, sampleArticle().html);
  assert.ok(txn.lockLog.some((l) => l.startsWith("blog_for_update:")));
});

test("3 IDEMPOTENT: exact retry → noop without write", async () => {
  const article = sampleArticle();
  const planning = draft({ linkedPostId: "post_cms_shell" });
  const preview = previewFor(planning, article);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({
    drafts: [planning],
    posts: [emptyPost({ content: article.html, excerpt: article.excerpt })],
  });
  const before = txn.snapshot();
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.outcome, "noop");
  assert.equal(result.simulatedCmsWrite, false);
  assert.deepEqual(txn.getPost("post_cms_shell")?.content, before.posts[0]?.content);
});

test("4 BLOCK: conflicting retry does not overwrite manual edits", async () => {
  const planning = draft({ linkedPostId: "post_cms_shell" });
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({
    drafts: [planning],
    posts: [emptyPost({ content: "<p>Human edit</p>", excerpt: "Edited" })],
  });
  const before = txn.snapshot();
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.code, "blog_content_conflict");
  assert.equal(result.simulatedCmsWrite, false);
  assert.equal(txn.getPost("post_cms_shell")?.content, "<p>Human edit</p>");
  assert.deepEqual(txn.snapshot().posts, before.posts);
});

test("5 CONCURRENT: one create in simulated atomic boundary", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({ drafts: [planning], posts: [] });
  let seq = 0;
  const [a, b] = await Promise.all([
    applyPrivateArticleViaCmsAdapter({
      clientPreview: preview,
      previewSessionId: fixtures.provenance.previewSessionId,
      approvalReceiptId: fixtures.approval.receiptId,
      actor: actor(),
      previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
    createIdFn: () => `post_race_${++seq}`,
    }),
    applyPrivateArticleViaCmsAdapter({
      clientPreview: preview,
      previewSessionId: fixtures.provenance.previewSessionId,
      approvalReceiptId: fixtures.approval.receiptId,
      actor: actor(),
      previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
    createIdFn: () => `post_race_${++seq}`,
    }),
  ]);
  const created = [a, b].filter((r) => r.ok && r.outcome === "created");
  assert.equal(created.length, 1);
  assert.equal(txn.listPosts().length, 1);
});

test("6 BLOCK: Planning changed after approval (stale)", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({
    drafts: [draft({ updatedAt: "2026-10-09T00:00:00.000Z" })],
    posts: [],
  });
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "stale_planning");
  assert.equal(txn.listPosts().length, 0);
});

test("7 BLOCK: preview/content hash changed", async () => {
  const planning = draft({ linkedPostId: "post_cms_shell" });
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({ drafts: [planning], posts: [emptyPost()] });
  const tampered = {
    ...preview,
    article: {
      ...preview.article,
      html: "<h2>Changed after approval</h2><p>This body is intentionally different from the trusted provenance hash and must not Apply.</p>",
    },
  };
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: tampered,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.code === "preview_provenance_mismatch" || result.code === "stale_approval",
      `unexpected code ${result.code}`,
    );
  }
  assert.equal(txn.getPost("post_cms_shell")?.content, "<p></p>");
});

test("8 BLOCK: missing trusted preview source → PREVIEW_PROVENANCE_UNAVAILABLE", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({ approvals: [fixtures.approval] });
  const txn = createFakeCmsApplyTransaction({ drafts: [planning], posts: [] });
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "PREVIEW_PROVENANCE_UNAVAILABLE");
    assert.equal(result.status, "BLOCKED");
  }
});

test("9 BLOCK: forged client approval (actor mismatch)", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({ drafts: [planning], posts: [] });
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor({ adminId: "impostor" }),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "forged_approval");
});

test("10 BLOCK: missing SEO or Blog permissions", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({ drafts: [planning], posts: [] });

  const noSeo = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor({ hasSeoPermission: false }),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(noSeo.ok, false);
  if (!noSeo.ok) assert.equal(noSeo.code, "access_denied");

  const noBlog = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor({ hasBlogPermission: false }),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(noBlog.ok, false);
  if (!noBlog.ok) assert.equal(noBlog.code, "access_denied");
});

test("11 BLOCK: published / scheduled target", async () => {
  const planning = draft({ linkedPostId: "post_cms_shell" });
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({
    drafts: [planning],
    posts: [
      emptyPost({
        status: "published",
        publishedAt: "2026-10-06T03:00:00.000Z",
      }),
    ],
  });
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "published_blocked");
});

test("12 BLOCK: manually edited Blog", async () => {
  const planning = draft({ linkedPostId: "post_cms_shell" });
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({
    drafts: [planning],
    posts: [emptyPost({ content: "<p>Manual</p>", excerpt: "x" })],
  });
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "blog_content_conflict");
});

test("13 BLOCK: conflicting slug / Planning link", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({
    drafts: [planning],
    posts: [emptyPost({ id: "post_other", slug: "uk-iptv-buffering-checklist" })],
  });
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
    createIdFn: () => "post_new",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "slug_conflict");
  assert.equal(txn.getPost("post_new"), null);
});

test("14 ROLLBACK: simulated Blog failure after insert", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const base = createFakeCmsApplyTransaction({ drafts: [planning], posts: [] });
  const before = base.snapshot();
  const flaky: typeof base = {
    ...base,
    async runInTransaction(work) {
      return base.runInTransaction(async (ops) => {
        const wrapped: CmsApplyTxnOps = {
          ...ops,
          async insertPrivateBlogDraft(post) {
            await ops.insertPrivateBlogDraft(post);
            throw new Error("Injected blog failure");
          },
        };
        return work(wrapped);
      });
    },
  };
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: flaky,
    trustedEvidencePack: trustedDraftingReady(),
    createIdFn: () => "post_should_rollback",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "transaction_failed");
    assert.equal(result.committed, false);
  }
  assert.deepEqual(base.snapshot().posts, before.posts);
  assert.equal(base.getDraft(planning.id)?.linkedPostId, null);
});

test("15 ROLLBACK: simulated audit failure → no partial Apply", async () => {
  const planning = draft({ linkedPostId: "post_cms_shell" });
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const base = createFakeCmsApplyTransaction({ drafts: [planning], posts: [emptyPost()] });
  const before = base.snapshot();
  const flaky: typeof base = {
    ...base,
    async runInTransaction(work) {
      return base.runInTransaction(async (ops) => {
        const wrapped: CmsApplyTxnOps = {
          ...ops,
          async recordApplyAudit() {
            throw new Error("SEO_AI_ARTICLE_CMS_APPLY_AUDIT_FAILED");
          },
        };
        return work(wrapped);
      });
    },
  };
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: flaky,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.code === "audit_unavailable" || result.code === "transaction_failed");
    assert.equal(result.simulatedCmsWrite, false);
  }
  assert.equal(base.getPost("post_cms_shell")?.content, before.posts[0]?.content);
});

test("16 BLOCKED readiness with proposed payload → zero Blog writes", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({
    drafts: [planning],
    posts: [
      emptyPost({
        id: "post_dup",
        slug: "other-slug",
        content: sampleArticle().html,
        excerpt: sampleArticle().excerpt,
      }),
    ],
  });
  const before = txn.snapshot();
  const result = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.code, "duplicate_apply_risk");
  assert.ok(result.readiness && result.readiness.ok === false);
  if (result.readiness && !result.readiness.ok) {
    assert.ok(result.readiness.proposedPrivateBlogDraft);
  }
  assert.equal(result.simulatedCmsWrite, false);
  assert.deepEqual(txn.snapshot().posts, before.posts);
});

test("17 Zero providers / network; editorial remains unverified on success", async () => {
  const { result } = await applyOk(draft({ linkedPostId: "post_cms_shell" }), [emptyPost()]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.providerRequests, 0);
  assert.equal(result.readiness.ok, true);
  if (!result.readiness.ok) return;
  assert.equal(result.readiness.evidenceReview.editorialEvidencePromotedToVerified, false);
  assert.equal(result.readiness.evidenceReview.editorialTrust, SEO_PLANNING_EDITORIAL_TRUST);
  assert.equal(result.publicationReady, false);
});

test("18 SOURCE GUARDS: no live catalog/action wiring; adapter offline", () => {
  assert.equal(fileExists("lib/cms/seo-planning/article-cms-apply-adapter.ts"), true);
  assert.equal(fileExists("lib/cms/seo-planning/article-apply.ts"), false);

  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.doesNotMatch(actions, /applyPrivateArticleViaCmsAdapter/);
  assert.doesNotMatch(actions, /applyGeneratedArticleToNewBlogDraftAction/);

  const mysql = read("lib/cms/mysql-catalog.ts");
  const json = read("lib/cms/json-catalog.ts");
  const catalog = read("lib/cms/catalog.ts");
  for (const src of [mysql, json, catalog]) {
    assert.doesNotMatch(src, /applyPrivateArticleViaCmsAdapter/);
    assert.doesNotMatch(src, /applyGeneratedArticleToPrivateBlogDraft/);
  }

  const ui = read("components/sidhu/SeoPlanningArticleGeneration.tsx");
  assert.doesNotMatch(ui, /applyPrivateArticleViaCmsAdapter/);
  assert.doesNotMatch(ui, /Apply to Private Blog Draft/i);

  const adapter = read("lib/cms/seo-planning/article-cms-apply-adapter.ts");
  assert.match(adapter, /PREVIEW_PROVENANCE_UNAVAILABLE/);
  assert.match(adapter, /lockPlanningForUpdate/);
  assert.match(adapter, /realCmsWrite: false/);
  assert.match(adapter, /createDurableCmsApplyUnavailableDeps/);
  assert.match(adapter, /applyPrivateArticleViaCmsAdapterUntilDurableReady/);
  // No live pool/import usage (comments may mention savePost as forbidden).
  assert.doesNotMatch(adapter, /from ["']@\/lib\/db\/pool["']/);
  assert.doesNotMatch(adapter, /getDbPool\s*\(/);
  assert.doesNotMatch(adapter, /createPool\s*\(/);
  assert.doesNotMatch(adapter, /\bsavePost\s*\(/);
  assert.doesNotMatch(adapter, /requestOpenAi|requestGemini/);

  // Production barrel must not re-export TEST-ONLY memory/fake authorities.
  const barrel = read("lib/cms/seo-planning/index.ts");
  assert.match(barrel, /applyPrivateArticleViaCmsAdapterUntilDurableReady/);
  assert.match(barrel, /createDurableCmsApplyUnavailableDeps/);
  assert.doesNotMatch(barrel, /createMemoryCmsTrustStores/);
  assert.doesNotMatch(barrel, /createFakeCmsApplyTransaction/);
  assert.doesNotMatch(barrel, /buildCmsApplyTrustFixtures/);
});

test("19 DURABLE GATE: unavailable deps / UntilDurableReady always fail closed", async () => {
  const planning = draft({ linkedPostId: "post_cms_shell" });
  const preview = previewFor(planning);
  const deps = createDurableCmsApplyUnavailableDeps();
  assert.equal(await deps.previewStore.getBySessionId("any"), null);
  assert.equal(await deps.approvalStore.getByReceiptId("any"), null);

  const gated = await applyPrivateArticleViaCmsAdapterUntilDurableReady({
    clientPreview: preview,
    previewSessionId: "preview_session_cms_1",
    approvalReceiptId: "approval_receipt_cms_1",
    actor: actor(),
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(gated.ok, false);
  if (!gated.ok) {
    assert.equal(gated.status, "BLOCKED");
    assert.equal(gated.code, "PREVIEW_PROVENANCE_UNAVAILABLE");
    assert.equal(gated.simulatedCmsWrite, false);
    assert.equal(gated.realCmsWrite, false);
    assert.equal(gated.committed, false);
  }
});

test("20 BLOCK: omitted / ABSENT / forged / HOLD Evidence Pack — zero Blog writes", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({ drafts: [planning], posts: [] });
  const before = txn.snapshot();

  const baseArgs = {
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    createIdFn: () => "post_should_not_exist",
  };

  const omitted = await applyPrivateArticleViaCmsAdapter({ ...baseArgs });
  assert.equal(omitted.ok, false);
  if (!omitted.ok) assert.equal(omitted.code, "evidence_pack_unavailable");

  const absent = await applyPrivateArticleViaCmsAdapter({
    ...baseArgs,
    evidencePackStatus: "ABSENT",
  });
  assert.equal(absent.ok, false);
  if (!absent.ok) assert.equal(absent.code, "evidence_pack_unavailable");

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

  const hold = await applyPrivateArticleViaCmsAdapter({
    ...baseArgs,
    trustedEvidencePack: trustedEvidenceHold(),
  });
  assert.equal(hold.ok, false);
  if (!hold.ok) assert.equal(hold.code, "evidence_pack_hold");

  const malformed = await applyPrivateArticleViaCmsAdapter({
    ...baseArgs,
    trustedEvidencePack: assessArticleEvidencePackForApply({} as never),
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.code, "evidence_pack_hold");

  assert.equal(txn.getPost("post_should_not_exist"), null);
  assert.deepEqual(txn.snapshot().posts, before.posts);
  assert.equal(txn.getDraft(planning.id)?.linkedPostId, null);
});

test("21 BLOCK: write-freeze / fixture-marked Planning reject with valid Evidence Pack", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const fixtures = buildCmsApplyTrustFixtures({ preview, adminId: "admin_trusted_1" });
  const trusts = createMemoryCmsTrustStores({
    provenance: [fixtures.provenance],
    approvals: [fixtures.approval],
  });
  const txn = createFakeCmsApplyTransaction({ drafts: [planning], posts: [] });

  const frozen = await applyPrivateArticleViaCmsAdapter({
    clientPreview: preview,
    previewSessionId: fixtures.provenance.previewSessionId,
    approvalReceiptId: fixtures.approval.receiptId,
    actor: actor(),
    previewStore: trusts.previewStore,
    approvalStore: trusts.approvalStore,
    transaction: txn,
    trustedEvidencePack: trustedDraftingReady(),
    writeFreezeEnv: { CMS_WRITE_FREEZE: "1" },
  });
  assert.equal(frozen.ok, false);
  if (!frozen.ok) assert.equal(frozen.code, "cms_write_freeze");
  assert.equal(txn.listPosts().length, 0);

  const fixturePlanning = draft({
    fingerprint: "TEST_FIXTURE:seo_editorial_evidence_acceptance:v1",
    linkedPostId: null,
  });
  const fixturePreview = previewFor(fixturePlanning);
  const fixtureFixtures = buildCmsApplyTrustFixtures({
    preview: fixturePreview,
    adminId: "admin_trusted_1",
  });
  const fixtureTrusts = createMemoryCmsTrustStores({
    provenance: [fixtureFixtures.provenance],
    approvals: [fixtureFixtures.approval],
  });
  const fixtureTxn = createFakeCmsApplyTransaction({
    drafts: [fixturePlanning],
    posts: [],
  });
  const fixtureBlocked = await applyPrivateArticleViaCmsAdapter({
    clientPreview: fixturePreview,
    previewSessionId: fixtureFixtures.provenance.previewSessionId,
    approvalReceiptId: fixtureFixtures.approval.receiptId,
    actor: actor(),
    previewStore: fixtureTrusts.previewStore,
    approvalStore: fixtureTrusts.approvalStore,
    transaction: fixtureTxn,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(fixtureBlocked.ok, false);
  if (!fixtureBlocked.ok) assert.equal(fixtureBlocked.code, "protected_fixture");
  assert.equal(fixtureTxn.listPosts().length, 0);
});
