/**
 * A2-5B — H3B Evidence Pack → A2 Apply readiness integration (offline).
 * Uses real `prepareSeoEvidencePack` via the sealed adapter. Zero network/DB/AI.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type {
  SeoResearchGscEvidence,
  SeoResearchOpportunity,
  SeoResearchSource,
} from "../lib/cms/ai-seo/research-schemas";
import {
  prepareSeoEvidencePack,
  type SeoEvidencePackGroundedEvidence,
  type SeoEvidencePackInput,
  type SeoEvidencePackOriginalContribution,
} from "../lib/cms/seo-autonomy/evidence-pack";
import {
  createSeoDecisionPipelineContextFromData,
  evaluateSeoOpportunityPipeline,
} from "../lib/cms/seo-decision-pipeline";
import type { SeoDecisionPipelineResult } from "../lib/cms/seo-decision-pipeline/types";
import { SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED } from "../lib/cms/seo-planning/article-apply-production-gate";
import {
  prepareArticleApplyReadiness,
  SEO_AI_ARTICLE_APPLY_READINESS_SPEC,
} from "../lib/cms/seo-planning/article-apply-readiness";
import {
  assessArticleEvidencePackForApply,
  isTrustedArticleEvidencePackAssessment,
  sealPreparedSeoEvidencePackResult,
  SEO_AI_ARTICLE_EVIDENCE_PACK_ADAPTER_SPEC,
} from "../lib/cms/seo-planning/article-evidence-pack-adapter";
import {
  evaluateNewBlogArticleEligibility,
  parsePrivateArticlePreview,
  SEO_AI_ARTICLE_GENERATION_SPEC,
  type PrivateArticlePreview,
} from "../lib/cms/seo-planning/article-generation";
import { SEO_PLANNING_EDITORIAL_TRUST } from "../lib/cms/seo-planning/editorial-evidence";
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
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
      "UK Firestick setup queries are rising while competitor guides stay generic.",
    webEvidence:
      overrides.webEvidence ??
      "Competitor posts list apps without UK device steps or Flix-specific setup notes.",
    existingCoverage: overrides.existingCoverage ?? "NONE",
    matchedTitle: overrides.matchedTitle ?? null,
    matchedPublicUrl: overrides.matchedPublicUrl ?? null,
    recommendation: overrides.recommendation,
    restorePath: overrides.restorePath ?? "",
    suggestedAngle: overrides.suggestedAngle || "Practical UK Firestick setup angle.",
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
    query: overrides.query ?? "firestick iptv setup uk",
    pageUrl: overrides.pageUrl,
    normalizedPath: overrides.normalizedPath ?? null,
    classification: overrides.classification,
    clicks: overrides.clicks ?? 12,
    impressions: overrides.impressions ?? 200,
    ctr: overrides.ctr ?? 0.06,
    position: overrides.position ?? 18,
    clicksDirection: overrides.clicksDirection ?? "UP",
    impressionsDirection: overrides.impressionsDirection ?? "UP",
    ctrDirection: overrides.ctrDirection ?? "FLAT",
    positionDirection: overrides.positionDirection ?? "UP",
  };
}

function sources(): SeoResearchSource[] {
  return [
    {
      title: "Amazon Fire TV setup help",
      url: "https://www.amazon.co.uk/gp/help/customer/display.html",
      domain: "amazon.co.uk",
    },
    {
      title: "Ofcom on-demand guidance",
      url: "https://www.ofcom.org.uk/tv-radio-and-on-demand",
      domain: "ofcom.org.uk",
    },
  ];
}

function groundedForSources(): SeoEvidencePackGroundedEvidence[] {
  return [
    {
      id: "ge_amazon",
      kind: "source_verified",
      description: "Amazon Fire TV help pages document device setup steps used in the angle.",
      sourceUrl: "https://www.amazon.co.uk/gp/help/customer/display.html",
    },
    {
      id: "ge_flix_fact",
      kind: "site_fact",
      description:
        "The Flix IPTV publishes UK-focused Firestick setup guidance and app compatibility notes on-site.",
    },
  ];
}

function originalOk(
  overrides: Partial<SeoEvidencePackOriginalContribution> = {},
): SeoEvidencePackOriginalContribution {
  return {
    statement:
      "Compare Firestick setup steps against The Flix IPTV UK onboarding checklist and supported app list.",
    backing: "grounded_evidence",
    evidenceIds: ["ge_flix_fact", "ge_amazon"],
    ...overrides,
  };
}

function evaluateNewBlog(extra?: {
  opp?: Partial<SeoResearchOpportunity>;
}): SeoDecisionPipelineResult {
  const ctx = createSeoDecisionPipelineContextFromData({
    posts: [] as BlogPost[],
    planningDrafts: [],
    runId: "a2-5b-evidence-pack-test",
  });
  return evaluateSeoOpportunityPipeline(
    ctx,
    opportunity({
      topic: "Firestick IPTV setup checklist for UK viewers",
      workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
      recommendation: "NEW_BLOG",
      gscEvidenceRefs: ["Q1"],
      gscEvidence: [gscRow({ id: "Q1", kind: "query" })],
      ...extra?.opp,
    }),
  );
}

function packInput(
  pipeline: SeoDecisionPipelineResult,
  overrides: Partial<SeoEvidencePackInput> = {},
): SeoEvidencePackInput {
  return {
    opportunityIndex: 0,
    pipeline,
    sources: sources(),
    groundedEvidence: groundedForSources(),
    gscEvidence: [gscRow({ id: "Q1", kind: "query" }), gscRow({ id: "Q99", kind: "query" })],
    originalContribution: originalOk(),
    ...overrides,
  };
}

function planningDraft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  const now = "2026-10-06T12:00:00.000Z";
  return {
    id: "seoplan_a2_5b_evidence",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:a2-5b-evidence",
    topic: "Firestick IPTV setup checklist for UK viewers",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    proposedSlug: "firestick-iptv-setup-checklist-uk",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "INFORMATIONAL",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: now,
    updatedAt: now,
    payload: {
      opportunity: {
        topic: "Firestick IPTV setup checklist for UK viewers",
        whyNow: "Readers report evening buffering during peak events.",
        webEvidence: "A support page describes a local network check.",
        existingCoverage: "NONE",
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
            trust: SEO_PLANNING_EDITORIAL_TRUST,
          },
        ],
      },
    },
    ...overrides,
  };
}

function sampleArticle() {
  return {
    title: "Firestick IPTV Setup Checklist for UK Viewers",
    excerpt: "A practical UK checklist for Firestick IPTV setup without guesswork.",
    html: "<h2>Start with the local network</h2><p>Check whether other devices on the same Wi-Fi also struggle during peak evening hours before changing service settings.</p>",
  };
}

function previewFor(planning: SeoPlanningDraft, article = sampleArticle()): PrivateArticlePreview {
  const eligible = evaluateNewBlogArticleEligibility(planning, { status: "skipped" });
  assert.equal(eligible.ok, true);
  if (!eligible.ok) throw new Error("fixture must be eligible");
  const editorial = planning.payload.editorialEvidenceV1;
  const hasEditorial = Boolean(editorial);
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

function approved() {
  return {
    factualReviewConfirmed: true,
    approvedByAdminId: "admin_trusted_1",
    clientApprovedFlag: false,
  };
}

test("H3B: genuine eligible pack → READY_FOR_DRAFTING_REVIEW via real evaluator", () => {
  const pipeline = evaluateNewBlog();
  assert.equal(pipeline.evaluationStatus, "OK");
  const raw = prepareSeoEvidencePack(packInput(pipeline));
  assert.equal(raw.status, "READY_FOR_DRAFTING_REVIEW");
  assert.equal(raw.publicationReady, false);

  const trusted = assessArticleEvidencePackForApply(packInput(pipeline));
  assert.equal(isTrustedArticleEvidencePackAssessment(trusted), true);
  assert.equal(trusted.spec, SEO_AI_ARTICLE_EVIDENCE_PACK_ADAPTER_SPEC);
  assert.equal(trusted.draftingReviewStatus, "READY_FOR_DRAFTING_REVIEW");
  assert.equal(trusted.applyEvidenceGate, "PASS_DRAFTING_REVIEW_ONLY");
  assert.equal(trusted.authorizeApply, false);
  assert.equal(trusted.authorizePublish, false);
  assert.equal(trusted.publicationReady, false);
  assert.equal(trusted.evidencePackComplete, false);
});

test("A2: sealed drafting READY maps without authorizing Apply/Publish", () => {
  const planning = planningDraft({ linkedPostId: null });
  const trusted = assessArticleEvidencePackForApply(packInput(evaluateNewBlog()));
  const result = prepareArticleApplyReadiness({
    preview: previewFor(planning),
    planningDraft: planning,
    existingPosts: [],
    trustedEvidencePack: trusted,
    humanApproval: approved(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec, SEO_AI_ARTICLE_APPLY_READINESS_SPEC);
  assert.equal(result.status, "READY_FOR_HUMAN_APPROVED_PRIVATE_DRAFT_APPLY");
  assert.equal(result.publicationReady, false);
  assert.equal(result.evidenceReview.evidencePackComplete, false);
  assert.equal(result.evidenceReview.publicationReady, false);
  assert.equal(result.evidenceReview.editorialEvidencePromotedToVerified, false);
  assert.equal(trusted.authorizeApply, false);
});

test("A2: H3B HOLD blocks Apply readiness", () => {
  const pipeline = evaluateNewBlog({ opp: { recommendation: "REFRESH_EXISTING" } });
  const trusted = assessArticleEvidencePackForApply(packInput(pipeline));
  assert.equal(trusted.draftingReviewStatus, "HOLD");
  assert.equal(trusted.applyEvidenceGate, "BLOCK");

  const planning = planningDraft();
  const result = prepareArticleApplyReadiness({
    preview: previewFor(planning),
    planningDraft: planning,
    trustedEvidencePack: trusted,
    humanApproval: approved(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.blockingReasons.some((r) => r.code === "evidence_pack_hold"));
  assert.equal(result.publicationReady, false);
});

test("A2: missing sources / malformed / conflicting pack inputs block", () => {
  const pipeline = evaluateNewBlog();
  const missing = assessArticleEvidencePackForApply(
    packInput(pipeline, { sources: [], groundedEvidence: [], originalContribution: undefined }),
  );
  assert.equal(missing.applyEvidenceGate, "BLOCK");

  const malformed = assessArticleEvidencePackForApply({} as SeoEvidencePackInput);
  assert.equal(malformed.applyEvidenceGate, "BLOCK");
  assert.ok(malformed.holdReasons.includes("INVALID_INPUT"));

  const conflict = assessArticleEvidencePackForApply(
    packInput(pipeline, {
      originalContribution: originalOk({
        statement: "Unsupported claim with no matching grounded evidence ids.",
        evidenceIds: ["missing_id"],
      }),
    }),
  );
  assert.equal(conflict.applyEvidenceGate, "BLOCK");

  for (const trusted of [missing, malformed, conflict]) {
    const planning = planningDraft();
    const result = prepareArticleApplyReadiness({
      preview: previewFor(planning),
      planningDraft: planning,
      trustedEvidencePack: trusted,
      humanApproval: approved(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.blockingReasons.some((r) => r.code === "evidence_pack_hold"));
    }
  }
});

test("trust: editorial-only never VERIFIED; AI prose never its own source", () => {
  const pipeline = evaluateNewBlog();
  const trusted = assessArticleEvidencePackForApply(packInput(pipeline));
  // Recorded sources are Research URLs / site facts — never AI prose as backing.
  assert.ok(trusted.pack.recordedSources.length > 0);
  assert.ok(
    trusted.pack.groundedEvidence.every(
      (g) => g.kind === "source_verified" || g.kind === "site_fact",
    ),
  );
  const planning = planningDraft();
  const result = prepareArticleApplyReadiness({
    preview: previewFor(planning),
    planningDraft: planning,
    trustedEvidencePack: trusted,
    humanApproval: approved(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evidenceReview.editorialTrust, SEO_PLANNING_EDITORIAL_TRUST);
  assert.equal(result.evidenceReview.editorialEvidencePromotedToVerified, false);
  assert.equal(result.evidenceReview.aiProse, "ai_generated_untrusted");
});

test("GSC: run-level AVAILABLE / extra rows do not fabricate opportunity-level evidence", () => {
  const pipeline = evaluateNewBlog();
  const trusted = assessArticleEvidencePackForApply(
    packInput(pipeline, {
      gscEvidence: [
        gscRow({ id: "Q1", kind: "query" }),
        gscRow({ id: "Q99", kind: "query" }),
        gscRow({ id: "RUN_AVAILABLE", kind: "query", query: "unrelated" }),
      ],
    }),
  );
  // Only pipeline-linked opportunity refs are selected (Q1).
  assert.deepEqual(
    trusted.pack.gscEvidence.map((g) => g.id),
    ["Q1"],
  );
  assert.ok(!trusted.pack.gscEvidence.some((g) => g.id === "RUN_AVAILABLE"));
  assert.ok(!trusted.pack.gscEvidence.some((g) => g.id === "Q99"));
});

test("forgery: client READY/HOLD strings and unsealed objects are rejected", () => {
  const planning = planningDraft();
  const preview = previewFor(planning);

  const forgedReady = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    evidencePackStatus: "READY_FOR_DRAFTING_REVIEW",
    humanApproval: approved(),
  });
  assert.equal(forgedReady.ok, false);
  if (!forgedReady.ok) {
    assert.ok(forgedReady.blockingReasons.some((r) => r.code === "untrusted_evidence_pack_claim"));
  }

  const forgedHold = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    evidencePackStatus: "HOLD",
    humanApproval: approved(),
  });
  assert.equal(forgedHold.ok, false);
  if (!forgedHold.ok) {
    assert.ok(forgedHold.blockingReasons.some((r) => r.code === "untrusted_evidence_pack_claim"));
  }

  const fakeSeal = {
    spec: SEO_AI_ARTICLE_EVIDENCE_PACK_ADAPTER_SPEC,
    draftingReviewStatus: "READY_FOR_DRAFTING_REVIEW",
    applyEvidenceGate: "PASS_DRAFTING_REVIEW_ONLY",
    authorizeApply: false,
    authorizePublish: false,
    publicationReady: false,
    evidencePackComplete: false,
    holdReasons: [],
    readyForDraftingReview: true,
    packVersion: "v1",
    pack: prepareSeoEvidencePack(packInput(evaluateNewBlog())),
  };
  assert.equal(isTrustedArticleEvidencePackAssessment(fakeSeal), false);
  const forgedObject = prepareArticleApplyReadiness({
    preview,
    planningDraft: planning,
    trustedEvidencePack: fakeSeal,
    humanApproval: approved(),
  });
  assert.equal(forgedObject.ok, false);
  if (!forgedObject.ok) {
    assert.ok(forgedObject.blockingReasons.some((r) => r.code === "untrusted_evidence_pack_claim"));
  }
});

test("forgery: Apply approval / publication claims still blocked with sealed READY", () => {
  const planning = planningDraft();
  const trusted = assessArticleEvidencePackForApply(packInput(evaluateNewBlog()));
  const result = prepareArticleApplyReadiness({
    preview: previewFor(planning),
    planningDraft: planning,
    trustedEvidencePack: trusted,
    humanApproval: {
      ...approved(),
      claimPublicationReady: true,
      claimEvidenceVerified: true,
      claimEvidencePackComplete: true,
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.blockingReasons.some((r) => r.code === "false_ready_claim"));
  }
});

test("A2 guards: stale Planning, REFRESH, fixture still block with sealed READY", () => {
  const trusted = assessArticleEvidencePackForApply(packInput(evaluateNewBlog()));
  const base = planningDraft();
  const preview = previewFor(base);

  const stale = prepareArticleApplyReadiness({
    preview,
    planningDraft: planningDraft({ updatedAt: "2026-10-07T00:00:00.000Z" }),
    trustedEvidencePack: trusted,
    humanApproval: approved(),
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.ok(stale.blockingReasons.some((r) => r.code === "stale_planning"));

  const refresh = planningDraft({ recommendation: "REFRESH_EXISTING" });
  const refreshBlocked = prepareArticleApplyReadiness({
    preview: {
      ...preview,
      planningDraftId: refresh.id,
      planningUpdatedAt: refresh.updatedAt,
    },
    planningDraft: refresh,
    trustedEvidencePack: trusted,
    humanApproval: approved(),
  });
  assert.equal(refreshBlocked.ok, false);
  if (!refreshBlocked.ok) {
    assert.ok(refreshBlocked.blockingReasons.some((r) => r.code === "refresh_target_blocked"));
  }

  const fixture = planningDraft({
    fingerprint: "TEST_FIXTURE:seo_editorial_evidence_acceptance:v1",
  });
  const fixtureBlocked = prepareArticleApplyReadiness({
    preview: previewFor(fixture),
    planningDraft: fixture,
    trustedEvidencePack: trusted,
    humanApproval: approved(),
  });
  assert.equal(fixtureBlocked.ok, false);
  if (!fixtureBlocked.ok) {
    assert.ok(fixtureBlocked.blockingReasons.some((r) => r.code === "protected_fixture"));
  }

  const hold = prepareArticleApplyReadiness({
    preview,
    planningDraft: base,
    trustedEvidencePack: trusted,
    editorialHold: true,
    humanApproval: approved(),
  });
  assert.equal(hold.ok, false);
  if (!hold.ok) assert.ok(hold.blockingReasons.some((r) => r.code === "editorial_hold"));
});

test("sealPreparedSeoEvidencePackResult accepts real H3B output only", () => {
  const pack = prepareSeoEvidencePack(packInput(evaluateNewBlog()));
  const sealed = sealPreparedSeoEvidencePackResult(pack);
  assert.ok(sealed);
  assert.equal(isTrustedArticleEvidencePackAssessment(sealed), true);

  assert.equal(
    sealPreparedSeoEvidencePackResult({
      ...pack,
      publicationReady: true,
    } as unknown as typeof pack),
    null,
  );
});

test("ABSENT/omitted pack cannot reach Apply-authorizing readiness", () => {
  const planning = planningDraft();
  const preview = previewFor(planning);

  for (const evidencePackStatus of ["ABSENT", undefined] as const) {
    const result = prepareArticleApplyReadiness({
      preview,
      planningDraft: planning,
      humanApproval: approved(),
      ...(evidencePackStatus ? { evidencePackStatus } : {}),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.blockingReasons.some((r) => r.code === "evidence_pack_unavailable"));
    }
  }
});

test("H3B READY alone does not skip independent A2 Apply gates", () => {
  const trusted = assessArticleEvidencePackForApply(packInput(evaluateNewBlog()));
  assert.equal(trusted.applyEvidenceGate, "PASS_DRAFTING_REVIEW_ONLY");
  assert.equal(trusted.authorizeApply, false);

  const stale = prepareArticleApplyReadiness({
    preview: previewFor(planningDraft()),
    planningDraft: planningDraft({ updatedAt: "2026-10-07T00:00:00.000Z" }),
    trustedEvidencePack: trusted,
    humanApproval: approved(),
  });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.ok(stale.blockingReasons.some((r) => r.code === "stale_planning"));

  const noHuman = prepareArticleApplyReadiness({
    preview: previewFor(planningDraft()),
    planningDraft: planningDraft(),
    trustedEvidencePack: trusted,
    humanApproval: { clientApprovedFlag: true },
  });
  assert.equal(noHuman.ok, false);
  if (!noHuman.ok) {
    assert.ok(noHuman.blockingReasons.some((r) => r.code === "missing_human_approval"));
  }
});

test("SOURCE/GATE: production OFF; no publisher wiring; fingerprint module untouched", () => {
  assert.equal(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED, false);
  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.doesNotMatch(actions, /assessArticleEvidencePackForApply/);
  assert.doesNotMatch(actions, /applyPrivateNewBlogArticleLocal/);

  const fp = read("lib/cms/seo-planning/article-content-fingerprint.ts");
  assert.match(fp, /a2-content-fingerprint-v1/);
  assert.match(fp, /digestNormalizedArticleContentV1/);

  const parsed = parsePrivateArticlePreview(previewFor(planningDraft()));
  assert.equal(parsed.ok, true);
});
