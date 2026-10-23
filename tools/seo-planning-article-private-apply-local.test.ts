/**
 * A2 Private Apply — offline mocked server-side boundary tests.
 * Injected memory catalog + trusted actor/approval/provenance only.
 * No providers, network, real SQL, or production Server Action.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { GENERATED_ARTICLE_HTML_MAX_CHARS } from "../lib/cms/ai-seo/config";
import type { SeoResearchOpportunity } from "../lib/cms/ai-seo/research-schemas";
import {
  createSeoDecisionPipelineContextFromData,
  evaluateSeoOpportunityPipeline,
} from "../lib/cms/seo-decision-pipeline";
import { assessArticleEvidencePackForApply } from "../lib/cms/seo-planning/article-evidence-pack-adapter";
import {
  applyPrivateNewBlogArticleLocal,
  buildTrustedPrivateApplyBindings,
  createMemoryPrivateApplyCatalog,
  SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_SPEC,
  type TrustedPrivateApplyActor,
} from "../lib/cms/seo-planning/article-private-apply-local";
import {
  evaluateNewBlogArticleEligibility,
  SEO_AI_ARTICLE_GENERATION_SPEC,
  type PrivateArticlePreview,
} from "../lib/cms/seo-planning/article-generation";
import {
  readSeoPlanningEditorialEvidence,
  SEO_PLANNING_EDITORIAL_TRUST,
} from "../lib/cms/seo-planning/editorial-evidence";
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
    runId: "a2-5b-harden-private-apply",
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

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_a2_apply",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:a2-apply",
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
        contentAngle: "Practical home-network checks for UK readers",
        nextStep: "Draft a clear troubleshooting article",
        humanNotes: "Keep claims modest; no speed guarantees.",
      },
      sources: [{ title: "Ofcom", domain: "ofcom.org.uk", url: "https://www.ofcom.org.uk/" }],
      gsc: { included: true },
      editorialEvidenceV1: {
        version: "v1",
        originalContribution: "Explain a short UK evening congestion checklist.",
        readerBenefit: "Readers can isolate home Wi-Fi issues faster.",
        missingEvidenceNotes: "Need first-party site fact verification later.",
        entries: [
          {
            id: "ed_1",
            evidenceType: "EXTERNAL_REFERENCE",
            claim: "Regulator publishes broadband advice",
            url: "https://www.ofcom.org.uk/",
            location: "home",
            notes: "Unverified editorial note",
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

function emptyPost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post_a2_shell",
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

test("CREATE: trusted approval → private draft create (in-memory only)", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({ drafts: [planning], posts: [] });

  const result = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
    now: "2026-10-21T12:00:00.000Z",
    createIdFn: () => "post_created_1",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec, SEO_AI_ARTICLE_PRIVATE_APPLY_LOCAL_SPEC);
  assert.equal(result.outcome, "created");
  assert.equal(result.postId, "post_created_1");
  assert.equal(result.status, "draft");
  assert.equal(result.publishedAt, null);
  assert.equal(result.publicationReady, false);
  assert.equal(result.realCmsWrite, false);
  assert.equal(result.simulatedBlogSaved, true);
  assert.equal(result.providerRequests, 0);
  assert.equal(catalog.getPost("post_created_1")?.status, "draft");
  assert.equal(catalog.getDraft(planning.id)?.linkedPostId, "post_created_1");
  assert.equal(result.audit.outcome, "created");
  assert.equal(result.audit.simulatedPersistence, false);
});

test("UPDATE: existing untouched linked shell → safe update", async () => {
  const planning = draft({ linkedPostId: "post_a2_shell" });
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({
    drafts: [planning],
    posts: [emptyPost()],
  });

  const result = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.outcome, "updated");
  assert.equal(result.simulatedBlogSaved, true);
  assert.equal(result.realCmsWrite, false);
  assert.equal(catalog.getPost("post_a2_shell")?.content, sampleArticle().html);
  assert.equal(catalog.getPost("post_a2_shell")?.status, "draft");
});

test("IDEMPOTENT: same approved Apply repeated → noop; no second write", async () => {
  const article = sampleArticle();
  const planning = draft({ linkedPostId: "post_a2_shell" });
  const preview = previewFor(planning, article);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({
    drafts: [planning],
    posts: [emptyPost({ content: article.html, excerpt: article.excerpt })],
  });
  const before = catalog.snapshot();

  const result = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.outcome, "noop");
  assert.equal(result.simulatedBlogSaved, false);
  assert.deepEqual(catalog.snapshot(), before);
});

test("BLOCK: conflicting repeated Apply does not overwrite editorial content", async () => {
  const planning = draft({ linkedPostId: "post_a2_shell" });
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({
    drafts: [planning],
    posts: [emptyPost({ content: "<p>Human edit</p>", excerpt: "Edited" })],
  });
  const before = catalog.snapshot();

  const result = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.code, "blog_content_conflict");
  assert.equal(result.simulatedBlogSaved, false);
  assert.equal(result.committed, false);
  assert.ok(result.readiness && result.readiness.ok === false);
  assert.ok(result.readiness && "proposedPrivateBlogDraft" in result.readiness);
  assert.deepEqual(catalog.snapshot(), before);
});

test("CONCURRENT: mock transaction accepts one outcome for parallel Applies", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({ drafts: [planning], posts: [] });
  let seq = 0;

  const [a, b] = await Promise.all([
    applyPrivateNewBlogArticleLocal({
      clientPreview: preview,
      actor: actor(),
      approval: bindings.approval,
      provenance: bindings.provenance,
      catalog,
      trustedEvidencePack: trustedDraftingReady(),
      createIdFn: () => `post_race_${++seq}`,
    }),
    applyPrivateNewBlogArticleLocal({
      clientPreview: preview,
      actor: actor(),
      approval: bindings.approval,
      provenance: bindings.provenance,
      catalog,
      trustedEvidencePack: trustedDraftingReady(),
      createIdFn: () => `post_race_${++seq}`,
    }),
  ]);

  const outcomes = [a, b];
  const created = outcomes.filter((r) => r.ok && r.outcome === "created");
  // Serialized mock txn: exactly one create. The loser is blocked or idempotent noop.
  assert.equal(created.length, 1);
  assert.equal(catalog.listPostsSync().length, 1);
  assert.ok(catalog.getDraft(planning.id)?.linkedPostId);
  assert.ok(outcomes.every((r) => r.realCmsWrite === false));
  assert.ok(outcomes.every((r) => r.providerRequests === 0));
});

test("BLOCK: published / non-draft target", async () => {
  const planning = draft({ linkedPostId: "post_a2_shell" });
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({
    drafts: [planning],
    posts: [
      emptyPost({
        status: "published",
        publishedAt: "2026-10-06T03:00:00.000Z",
      }),
    ],
  });
  const before = catalog.snapshot();

  const result = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.code, "published_blocked");
  assert.deepEqual(catalog.snapshot(), before);
});

test("BLOCK: duplicate / unrelated Blog association (slug conflict)", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({
    drafts: [planning],
    posts: [emptyPost({ id: "post_other", slug: "uk-iptv-buffering-checklist" })],
  });
  const before = catalog.snapshot();

  const result = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "slug_conflict");
  assert.equal(result.simulatedBlogSaved, false);
  assert.deepEqual(catalog.snapshot(), before);
});

test("BLOCK: stale Planning or preview fingerprint", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({
    drafts: [draft({ updatedAt: "2026-10-09T00:00:00.000Z" })],
    posts: [],
  });

  const result = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "stale_planning");
  assert.equal(result.simulatedBlogSaved, false);
});

test("BLOCK: forged client approval / missing trusted approval", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({ drafts: [planning], posts: [] });

  const missing = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: null,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "missing_approval");

  const forged = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: { ...bindings.approval, approvedByAdminId: "someone_else" },
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(forged.ok, false);
  if (!forged.ok) assert.equal(forged.code, "forged_approval");
  assert.equal(catalog.listPostsSync().length, 0);
});

test("BLOCK: trusted actor missing SEO or Blog permission", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({ drafts: [planning], posts: [] });

  const noSeo = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor({ hasSeoPermission: false }),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(noSeo.ok, false);
  if (!noSeo.ok) assert.equal(noSeo.code, "access_denied");

  const noBlog = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor({ hasBlogPermission: false }),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(noBlog.ok, false);
  if (!noBlog.ok) assert.equal(noBlog.code, "access_denied");
});

test("BLOCK: CMS write-freeze rejects before any simulated Blog write", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({ drafts: [planning], posts: [] });

  const frozen = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
    writeFreezeEnv: { CMS_WRITE_FREEZE: "1" },
  });
  assert.equal(frozen.ok, false);
  if (!frozen.ok) assert.equal(frozen.code, "cms_write_freeze");
  assert.equal(frozen.simulatedBlogSaved, false);
  assert.equal(frozen.realCmsWrite, false);
  assert.equal(catalog.listPostsSync().length, 0);
});

test("BLOCK: missing factual review on approval record", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({ drafts: [planning], posts: [] });

  const result = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: {
      ...bindings.approval,
      // @ts-expect-error intentional forged non-true review flag
      factualReviewConfirmed: false,
    },
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "missing_factual_review");
});

test("BLOCK: invalid / missing preview provenance fails closed", async () => {
  const planning = draft();
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({ drafts: [planning], posts: [] });

  const unavailable = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: null,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) {
    assert.equal(unavailable.code, "preview_provenance_unavailable");
    assert.equal(unavailable.status, "BLOCKED");
  }

  const mismatch = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: { ...bindings.provenance, contentFingerprint: "not-matching" },
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.code, "preview_provenance_mismatch");
  assert.equal(catalog.listPostsSync().length, 0);
});

test("EVIDENCE: editorial-only remains unverified after successful mock Apply", async () => {
  const planning = draft({ linkedPostId: "post_a2_shell" });
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({
    drafts: [planning],
    posts: [emptyPost()],
  });

  const result = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.readiness.ok, true);
  if (!result.readiness.ok) return;
  assert.equal(result.readiness.evidenceReview.editorialEvidencePromotedToVerified, false);
  assert.equal(result.readiness.evidenceReview.editorialTrust, SEO_PLANNING_EDITORIAL_TRUST);
  assert.equal(result.readiness.evidenceReview.evidencePackComplete, false);
  assert.equal(result.publicationReady, false);
});

test("BLOCK: unsafe HTML and false publication-ready claims", async () => {
  const planning = draft({ linkedPostId: "post_a2_shell" });
  const unsafePreview = previewFor(planning, {
    ...sampleArticle(),
    html: `<p>${"x".repeat(GENERATED_ARTICLE_HTML_MAX_CHARS + 20)}</p>`,
  });
  // Provenance built from unsafe preview will fail normalize at Apply — use valid bindings
  // then swap client HTML to exercise sanitize failure after provenance match attempt.
  const validPreview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview: validPreview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({
    drafts: [planning],
    posts: [emptyPost()],
  });

  const unsafe = await applyPrivateNewBlogArticleLocal({
    clientPreview: unsafePreview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) {
    assert.ok(
      unsafe.code === "unsafe_html" || unsafe.code === "preview_provenance_mismatch",
    );
  }

  const claimReady = await applyPrivateNewBlogArticleLocal({
    clientPreview: {
      ...validPreview,
      publicationReady: true,
    },
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });
  assert.equal(claimReady.ok, false);
  // parsePrivateArticlePreview rejects publicationReady !== false
  if (!claimReady.ok) assert.equal(claimReady.code, "invalid_preview");
  assert.equal(catalog.getPost("post_a2_shell")?.content, "<p></p>");
});

test("BLOCKED readiness with proposed payload → zero simulated writes", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({
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
  const before = catalog.snapshot();

  const result = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: trustedDraftingReady(),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.code, "duplicate_apply_risk");
  assert.ok(result.readiness && result.readiness.ok === false);
  if (result.readiness && !result.readiness.ok) {
    assert.ok(result.readiness.proposedPrivateBlogDraft);
    assert.equal(result.readiness.status, "BLOCKED");
  }
  assert.equal(result.simulatedBlogSaved, false);
  assert.deepEqual(catalog.snapshot(), before);
});

test("FAILURE: thrown mid-transaction rolls back partial simulated state", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const base = createMemoryPrivateApplyCatalog({ drafts: [planning], posts: [] });
  const before = base.snapshot();

  const flaky: typeof base = {
    ...base,
    async runInTransaction(fn) {
      return base.runInTransaction(async (tx) => {
        const wrapped = {
          ...tx,
          async createLinkedPrivateDraft(args: Parameters<typeof tx.createLinkedPrivateDraft>[0]) {
            await tx.createLinkedPrivateDraft(args);
            throw new Error("Injected failure after create");
          },
        };
        return fn(wrapped);
      });
    },
  };

  const result = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog: flaky,
    trustedEvidencePack: trustedDraftingReady(),
    createIdFn: () => "post_should_rollback",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "transaction_failed");
    assert.equal(result.committed, false);
    assert.equal(result.simulatedBlogSaved, false);
  }
  assert.deepEqual(base.snapshot(), before);
  assert.equal(base.getPost("post_should_rollback"), null);
  assert.equal(base.getDraft(planning.id)?.linkedPostId, null);
});

test("BLOCK: ABSENT / omitted / forged Evidence Pack cannot authorize private Apply", async () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const bindings = buildTrustedPrivateApplyBindings({
    preview,
    adminId: "admin_trusted_1",
  });
  const catalog = createMemoryPrivateApplyCatalog({ drafts: [planning], posts: [] });

  const absent = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    evidencePackStatus: "ABSENT",
    createIdFn: () => "post_should_not_create",
  });
  assert.equal(absent.ok, false);
  if (!absent.ok) assert.equal(absent.code, "evidence_pack_unavailable");
  assert.equal(catalog.listPostsSync().length, 0);

  const omitted = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    createIdFn: () => "post_should_not_create",
  });
  assert.equal(omitted.ok, false);
  if (!omitted.ok) assert.equal(omitted.code, "evidence_pack_unavailable");

  const forgedReady = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    evidencePackStatus: "READY_FOR_DRAFTING_REVIEW",
    createIdFn: () => "post_should_not_create",
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
    holdReasons: [],
    readyForDraftingReview: true,
    packVersion: "v1",
  };
  const forgedObject = await applyPrivateNewBlogArticleLocal({
    clientPreview: preview,
    actor: actor(),
    approval: bindings.approval,
    provenance: bindings.provenance,
    catalog,
    trustedEvidencePack: fakeSeal,
    createIdFn: () => "post_should_not_create",
  });
  assert.equal(forgedObject.ok, false);
  if (!forgedObject.ok) assert.equal(forgedObject.code, "untrusted_evidence_pack_claim");
  assert.equal(catalog.listPostsSync().length, 0);
});

test("SOURCE GUARDS: no production Apply action/UI; local module stays offline", () => {
  assert.equal(fileExists("lib/cms/seo-planning/article-apply.ts"), false);
  assert.equal(fileExists("lib/cms/seo-planning/article-private-apply-local.ts"), true);

  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.doesNotMatch(actions, /applyGeneratedArticleToNewBlogDraftAction/);
  assert.doesNotMatch(actions, /applyPrivateNewBlogArticleLocal/);

  const ui = read("components/sidhu/SeoPlanningArticleGeneration.tsx");
  assert.doesNotMatch(ui, /applyPrivateNewBlogArticleLocal/);
  assert.doesNotMatch(ui, /Apply to Private Blog Draft/i);

  const local = read("lib/cms/seo-planning/article-private-apply-local.ts");
  assert.match(local, /realCmsWrite: false/);
  assert.match(local, /preview_provenance_unavailable/);
  assert.doesNotMatch(local, /createPool|mysql2|requestOpenAi|requestGemini/);
  assert.doesNotMatch(local, /export async function applyGeneratedArticleToNewBlogDraftAction/);
});
