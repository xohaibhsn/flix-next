/**
 * A2 Apply-readiness — offline deterministic boundary tests.
 * No provider calls. No CMS/Blog persistence. In-memory fixtures only.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { GENERATED_ARTICLE_HTML_MAX_CHARS } from "../lib/cms/ai-seo/config";
import type { SeoResearchOpportunity } from "../lib/cms/ai-seo/research-schemas";
import {
  createSeoDecisionPipelineContextFromData,
  evaluateSeoOpportunityPipeline,
} from "../lib/cms/seo-decision-pipeline";
import {
  prepareArticleApplyReadiness,
  SEO_AI_ARTICLE_APPLY_READINESS_SPEC,
  type ArticleApplyHumanApprovalInput,
} from "../lib/cms/seo-planning/article-apply-readiness";
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
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function fileExists(rel: string) {
  return existsSync(path.join(root, rel));
}

/** Server-sealed H3B drafting-READY assessment for Apply-authorizing fixtures. */
function trustedDraftingReady() {
  const ctx = createSeoDecisionPipelineContextFromData({
    posts: [],
    planningDrafts: [],
    runId: "a2-5b-harden-readiness",
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
    id: "seoplan_a2",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:a2-demo",
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
    html: "<h2>Start with the local network</h2><p>Check whether other devices on the same Wi-Fi also struggle during peak evening hours before changing service settings.</p><h3>Useful next checks</h3><ul><li>Restart the router after noting current symptoms.</li><li>Try a wired connection if available.</li></ul>",
  };
}

function emptyPost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post_a2",
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
  if (!eligible.ok) throw new Error("fixture draft must be eligible");
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

function approved(): ArticleApplyHumanApprovalInput {
  return {
    factualReviewConfirmed: true,
    approvedByAdminId: "admin_trusted_1",
    clientApprovedFlag: true,
  };
}

/** Mutable in-memory repo — readiness must never write. */
function memoryRepo(initialDraft: SeoPlanningDraft, initialPosts: BlogPost[] = []) {
  const drafts = new Map([[initialDraft.id, structuredClone(initialDraft)]]);
  const posts = new Map(initialPosts.map((post) => [post.id, structuredClone(post)]));
  const snapshot = () => ({
    drafts: structuredClone([...drafts.values()]),
    posts: structuredClone([...posts.values()]),
  });
  const before = snapshot();
  return {
    getDraft(id: string) {
      return drafts.get(id) ? structuredClone(drafts.get(id)!) : null;
    },
    getPost(id: string) {
      return posts.get(id) ? structuredClone(posts.get(id)!) : null;
    },
    listPosts() {
      return structuredClone([...posts.values()]);
    },
    assertUnchanged() {
      assert.deepEqual(snapshot(), before);
    },
  };
}

test("READY: valid NEW_BLOG A1 preview + human approval → private-draft Apply readiness", () => {
  const planning = draft({ linkedPostId: "post_a2" });
  const post = emptyPost();
  const repo = memoryRepo(planning, [post]);
  const preview = previewFor(planning);

  const result = prepareArticleApplyReadiness({
    preview,
    planningDraft: repo.getDraft(planning.id),
    linkedPost: repo.getPost(post.id),
    existingPosts: repo.listPosts(),
    trustedEvidencePack: trustedDraftingReady(),
    humanApproval: approved(),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec, SEO_AI_ARTICLE_APPLY_READINESS_SPEC);
  assert.equal(result.status, "READY_FOR_HUMAN_APPROVED_PRIVATE_DRAFT_APPLY");
  assert.equal(result.publicationReady, false);
  assert.equal(result.blogSaved, false);
  assert.equal(result.persisted, false);
  assert.equal(result.providerRequests, 0);
  assert.equal(result.proposedPrivateBlogDraft.status, "draft");
  assert.equal(result.proposedPrivateBlogDraft.publishedAt, null);
  assert.equal(result.proposedPrivateBlogDraft.mode, "update_linked_empty_shell");
  assert.equal(result.evidenceReview.editorialEvidencePromotedToVerified, false);
  assert.equal(result.evidenceReview.evidencePackComplete, false);
  assert.equal(result.evidenceReview.autonomousNewBlogEligible, false);
  assert.equal(result.evidenceReview.editorialTrust, SEO_PLANNING_EDITORIAL_TRUST);
  repo.assertUnchanged();
});

test("BLOCK: stale Planning updatedAt or writing fingerprint", () => {
  const planning = draft();
  const preview = previewFor(planning);
  const staleUpdated = prepareArticleApplyReadiness({
    preview,
    planningDraft: draft({ updatedAt: "2026-10-07T00:00:00.000Z" }),
    humanApproval: approved(),
  });
  assert.equal(staleUpdated.ok, false);
  if (staleUpdated.ok) return;
  assert.equal(staleUpdated.status, "BLOCKED");
  assert.ok(staleUpdated.blockingReasons.some((r) => r.code === "stale_planning"));

  const staleFp = prepareArticleApplyReadiness({
    preview: { ...preview, writingFingerprint: "not-the-current-fingerprint" },
    planningDraft: planning,
    humanApproval: approved(),
  });
  assert.equal(staleFp.ok, false);
  if (staleFp.ok) return;
  assert.equal(staleFp.status, "BLOCKED");
  assert.ok(staleFp.blockingReasons.some((r) => r.code === "stale_planning"));
  assert.equal(staleFp.blogSaved, false);
});

test("BLOCK: mismatched preview / Planning draft identity", () => {
  const planning = draft();
  const preview = previewFor(planning);
  const result = prepareArticleApplyReadiness({
    preview: { ...preview, planningDraftId: "seoplan_other" },
    planningDraft: planning,
    humanApproval: approved(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockingReasons.some((r) => r.code === "preview_draft_mismatch"));
});

test("BLOCK: conflicting Blog content and duplicate / slug association risks", () => {
  const planning = draft({ linkedPostId: "post_a2" });
  const preview = previewFor(planning);
  const conflict = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    linkedPost: emptyPost({ content: "<p>Human edited already</p>", excerpt: "Edited" }),
    humanApproval: approved(),
  });
  assert.equal(conflict.ok, false);
  if (conflict.ok) return;
  assert.equal(conflict.status, "BLOCKED");
  assert.ok(conflict.blockingReasons.some((r) => r.code === "blog_content_conflict"));

  const missing = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    linkedPost: null,
    humanApproval: approved(),
  });
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.status, "BLOCKED");
  assert.ok(missing.blockingReasons.some((r) => r.code === "linked_post_missing"));

  const unlinked = draft({ linkedPostId: null });
  const createPreview = previewFor(unlinked);
  const slugClash = prepareArticleApplyReadiness({
    preview: createPreview,
    planningDraft: unlinked,
    existingPosts: [emptyPost({ id: "post_other", slug: "uk-iptv-buffering-checklist" })],
    humanApproval: approved(),
  });
  assert.equal(slugClash.ok, false);
  if (slugClash.ok) return;
  assert.equal(slugClash.status, "BLOCKED");
  assert.ok(slugClash.blockingReasons.some((r) => r.code === "slug_conflict"));
});

test("BLOCK: published_blocked when linked Blog is published or non-draft", () => {
  const planning = draft({ linkedPostId: "post_a2" });
  const preview = previewFor(planning);

  const published = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    linkedPost: emptyPost({
      status: "published",
      publishedAt: "2026-10-06T02:00:00.000Z",
      content: "<p></p>",
    }),
    humanApproval: approved(),
  });
  assert.equal(published.ok, false);
  if (published.ok) return;
  assert.equal(published.status, "BLOCKED");
  assert.ok(published.blockingReasons.some((r) => r.code === "published_blocked"));
  assert.equal(published.blogSaved, false);
  assert.equal(published.persisted, false);

  const scheduledShape = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    linkedPost: emptyPost({
      status: "draft",
      publishedAt: "2026-10-08T00:00:00.000Z",
    }),
    humanApproval: approved(),
  });
  assert.equal(scheduledShape.ok, false);
  if (scheduledShape.ok) return;
  assert.equal(scheduledShape.status, "BLOCKED");
  assert.ok(scheduledShape.blockingReasons.some((r) => r.code === "published_blocked"));
});

test("BLOCK: duplicate_apply_risk when unlinked create would collide with matching private draft", () => {
  const planning = draft({ linkedPostId: null });
  const preview = previewFor(planning);
  const article = sampleArticle();
  const result = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    existingPosts: [
      emptyPost({
        id: "post_orphan_match",
        slug: "other-slug-not-colliding",
        content: article.html,
        excerpt: article.excerpt,
        status: "draft",
        publishedAt: null,
      }),
    ],
    humanApproval: approved(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockingReasons.some((r) => r.code === "duplicate_apply_risk"));
  assert.ok(result.proposedPrivateBlogDraft);
  assert.equal(result.blogSaved, false);
  assert.equal(result.persisted, false);
});

test("IDEMPOTENT: matching linked content does not propose a second draft create", () => {
  const planning = draft({ linkedPostId: "post_a2" });
  const preview = previewFor(planning);
  const article = sampleArticle();
  const result = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    linkedPost: emptyPost({ content: article.html, excerpt: article.excerpt }),
    trustedEvidencePack: trustedDraftingReady(),
    humanApproval: approved(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.proposedPrivateBlogDraft.mode, "idempotent_already_applied");
  assert.equal(result.blogSaved, false);
});

test("BLOCK: legacy ABSENT or omitted Evidence Pack never authorizes Apply readiness", () => {
  const planning = draft({ linkedPostId: "post_a2" });
  const post = emptyPost();
  const preview = previewFor(planning);

  const absent = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    linkedPost: post,
    existingPosts: [post],
    evidencePackStatus: "ABSENT",
    humanApproval: approved(),
  });
  assert.equal(absent.ok, false);
  if (!absent.ok) {
    assert.ok(absent.blockingReasons.some((r) => r.code === "evidence_pack_unavailable"));
  }

  const omitted = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    linkedPost: post,
    existingPosts: [post],
    humanApproval: approved(),
  });
  assert.equal(omitted.ok, false);
  if (!omitted.ok) {
    assert.ok(omitted.blockingReasons.some((r) => r.code === "evidence_pack_unavailable"));
  }
});

test("EVIDENCE: editorial-only stays unverified; missing evidence cannot become READY", () => {
  const planning = draft();
  const preview = previewFor(planning);
  const editorial = readSeoPlanningEditorialEvidence(planning.payload);
  assert.equal(editorial.entries[0]?.trust, SEO_PLANNING_EDITORIAL_TRUST);

  const falseReady = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    evidencePackStatus: "HOLD",
    humanApproval: {
      ...approved(),
      claimEvidenceVerified: true,
      claimEvidencePackComplete: true,
      claimPublicationReady: true,
    },
  });
  assert.equal(falseReady.ok, false);
  if (falseReady.ok) return;
  assert.ok(falseReady.blockingReasons.some((r) => r.code === "false_ready_claim"));
  assert.equal(falseReady.evidenceReview?.editorialEvidencePromotedToVerified, false);
  assert.equal(falseReady.evidenceReview?.evidencePackComplete, false);
  assert.equal(falseReady.publicationReady, false);
  assert.ok(falseReady.evidenceReview?.missingEvidenceNotes.includes("first-party"));
});

test("BLOCK: false READY prevention when pack is drafting-review-only", () => {
  const planning = draft();
  const preview = previewFor(planning);
  const result = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    evidencePackStatus: "READY_FOR_DRAFTING_REVIEW",
    humanApproval: {
      ...approved(),
      claimPublicationReady: true,
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.blockingReasons.some((r) => r.code === "false_ready_claim"));
});

test("BLOCK: unsafe or excessive HTML", () => {
  const planning = draft();
  const preview = previewFor(planning, {
    ...sampleArticle(),
    html: `<p>${"x".repeat(GENERATED_ARTICLE_HTML_MAX_CHARS + 50)}</p>`,
  });
  const oversized = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    humanApproval: approved(),
  });
  assert.equal(oversized.ok, false);
  if (oversized.ok) return;
  assert.ok(oversized.blockingReasons.some((r) => r.code === "unsafe_html"));

  const scripted = prepareArticleApplyReadiness({
    preview: previewFor(planning, {
      ...sampleArticle(),
      html: '<p>Hi</p><script>alert(1)</script>',
    }),
    planningDraft: planning,
    humanApproval: approved(),
  });
  assert.equal(scripted.ok, false);
  if (scripted.ok) return;
  assert.ok(scripted.blockingReasons.some((r) => r.code === "unsafe_html"));
});

test("BLOCK: REFRESH and editorial HOLD rejection", () => {
  const refreshDraft = draft({
    recommendation: "REFRESH_EXISTING",
    targetPostId: "post_existing",
    matchedPublicUrl: "/blog/existing/",
  });
  // Build a NEW_BLOG-shaped preview then point at refresh draft id mismatch path:
  const newBlog = draft();
  const preview = previewFor(newBlog);
  const refresh = prepareArticleApplyReadiness({
    preview: {
      ...preview,
      planningDraftId: refreshDraft.id,
      planningUpdatedAt: refreshDraft.updatedAt,
    },
    planningDraft: refreshDraft,
    humanApproval: approved(),
  });
  assert.equal(refresh.ok, false);
  if (refresh.ok) return;
  assert.ok(refresh.blockingReasons.some((r) => r.code === "refresh_target_blocked"));

  const hold = prepareArticleApplyReadiness({
    preview: previewFor(newBlog),
    planningDraft: newBlog,
    editorialHold: true,
    humanApproval: approved(),
  });
  assert.equal(hold.ok, false);
  if (hold.ok) return;
  assert.ok(hold.blockingReasons.some((r) => r.code === "editorial_hold"));
});

test("BLOCK: fixture-marked Planning fingerprint cannot enter Apply path", () => {
  const fixtureDraft = draft({
    fingerprint: "TEST_FIXTURE:seo_editorial_evidence_acceptance:v1",
  });
  const result = prepareArticleApplyReadiness({
    preview: previewFor(fixtureDraft),
    planningDraft: fixtureDraft,
    humanApproval: approved(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.blockingReasons.some((r) => r.code === "protected_fixture"));
  assert.equal(result.blogSaved, false);
  assert.equal(result.persisted, false);
});

test("BLOCK: SKIP / RESTORE / INTERNAL_LINK cannot enter NEW_BLOG Apply path", () => {
  const base = draft();
  const preview = previewFor(base);
  for (const [recommendation, code] of [
    ["RESTORE_HISTORICAL", "restore_blocked"],
    ["INTERNAL_LINK_ONLY", "internal_link_blocked"],
    ["SKIP", "skip_blocked"],
  ] as const) {
    const result = prepareArticleApplyReadiness({
      preview: { ...preview, planningDraftId: "seoplan_bad", planningUpdatedAt: base.updatedAt },
      planningDraft: draft({ id: "seoplan_bad", recommendation }),
      humanApproval: approved(),
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(
      result.blockingReasons.some((r) => r.code === code),
      `expected ${code} for ${recommendation}`,
    );
  }
});

test("BLOCK: missing human approval; client approved=true alone is insufficient", () => {
  const planning = draft();
  const preview = previewFor(planning);

  const missing = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
  });
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.status, "BLOCKED");
  assert.ok(missing.blockingReasons.some((r) => r.code === "missing_factual_review"));
  assert.ok(missing.blockingReasons.some((r) => r.code === "missing_human_approval"));
  assert.ok(missing.proposedPrivateBlogDraft);
  // Proposed payload on BLOCKED must never be treated as persistence authorization.
  assert.equal(missing.ok, false);
  assert.equal(missing.blogSaved, false);
  assert.equal(missing.persisted, false);

  const clientOnly = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    humanApproval: { clientApprovedFlag: true, factualReviewConfirmed: true },
  });
  assert.equal(clientOnly.ok, false);
  if (clientOnly.ok) return;
  assert.equal(clientOnly.status, "BLOCKED");
  assert.ok(clientOnly.blockingReasons.some((r) => r.code === "missing_human_approval"));
});

test("SAFETY: readiness never saves Blog / never calls providers / never overwrites existing content", () => {
  const planning = draft({ linkedPostId: "post_a2" });
  const existing = emptyPost({
    content: "<p>Protected editorial body</p>",
    excerpt: "Protected",
  });
  const repo = memoryRepo(planning, [existing]);
  const preview = previewFor(planning);

  const result = prepareArticleApplyReadiness({
    preview,
    planningDraft: repo.getDraft(planning.id),
    linkedPost: repo.getPost(existing.id),
    existingPosts: repo.listPosts(),
    humanApproval: approved(),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.blockingReasons.some((r) => r.code === "blog_content_conflict"));
  assert.equal(result.blogSaved, false);
  assert.equal(result.persisted, false);
  assert.equal(result.providerRequests, 0);
  assert.equal(repo.getPost(existing.id)?.content, "<p>Protected editorial body</p>");
  repo.assertUnchanged();
});

test("SOURCE GUARDS: no article-apply.ts, no Apply action, no Apply UI, readiness is non-mutating", () => {
  assert.equal(fileExists("lib/cms/seo-planning/article-apply.ts"), false);
  assert.equal(fileExists("lib/cms/seo-planning/article-apply-readiness.ts"), true);

  // Narrow seo-autonomy allowlist: H3B evidence-pack + reused first-party verifier only.
  assert.equal(fileExists("lib/cms/seo-autonomy"), true);
  assert.equal(fileExists("lib/cms/seo-autonomy/evidence-pack.ts"), true);
  assert.equal(fileExists("lib/cms/seo-autonomy/first-party-site-fact-verify.ts"), true);
  const autonomyFiles = readdirSync(path.join(root, "lib/cms/seo-autonomy"))
    .filter((name) => !name.startsWith("."))
    .sort();
  assert.deepEqual(autonomyFiles, ["evidence-pack.ts", "first-party-site-fact-verify.ts"]);
  const evidencePack = read("lib/cms/seo-autonomy/evidence-pack.ts");
  assert.match(evidencePack, /prepareSeoEvidencePack/);
  assert.match(evidencePack, /READY_FOR_DRAFTING_REVIEW/);
  assert.doesNotMatch(evidencePack, /requestOpenAi|requestGemini|createPool|mysql2|fetch\(/);
  assert.doesNotMatch(evidencePack, /"use server"|Server Action/);
  const firstPartyVerify = read("lib/cms/seo-autonomy/first-party-site-fact-verify.ts");
  assert.match(firstPartyVerify, /verifyPlanningFirstPartySiteFacts/);
  assert.doesNotMatch(firstPartyVerify, /requestOpenAi|requestGemini|createPool|mysql2|fetch\(/);
  assert.doesNotMatch(firstPartyVerify, /"use server"|Server Action/);
  assert.doesNotMatch(firstPartyVerify, /getDbPool|insertPost|updatePost|savePost/);

  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.doesNotMatch(actions, /applyGeneratedArticleToNewBlogDraftAction/);
  assert.doesNotMatch(actions, /applyGeneratedArticleToPrivateBlogDraft/);
  assert.doesNotMatch(actions, /prepareArticleApplyReadiness/);

  const ui = read("components/sidhu/SeoPlanningArticleGeneration.tsx");
  assert.doesNotMatch(ui, /applyGeneratedArticleToNewBlogDraftAction/);
  assert.doesNotMatch(ui, /Apply to Private Blog Draft/i);
  assert.doesNotMatch(ui, /prepareArticleApplyReadiness/);

  const readiness = read("lib/cms/seo-planning/article-apply-readiness.ts");
  assert.match(readiness, /prepareArticleApplyReadiness/);
  assert.match(readiness, /blogSaved: false/);
  assert.doesNotMatch(readiness, /identity_mismatch|identityMismatch/);
  assert.doesNotMatch(readiness, /savePost|insertPost|updatePost|mysql|createPool|fetch\(/);
  assert.doesNotMatch(readiness, /requestOpenAi|requestGemini|web_search/);
});
