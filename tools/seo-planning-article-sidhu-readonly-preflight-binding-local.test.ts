/**
 * A2-9/A2-10 — Readonly preflight binding with reused first-party verifier.
 * No CMS/DB writes, no GSC/AI, executionAuthorized always false.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SeoResearchOpportunity } from "../lib/cms/ai-seo/research-schemas";
import type { CurrentAdmin } from "../lib/auth/session";
import type { Permission } from "../lib/auth/permissions";
import type { GscUkEvidencePack } from "../lib/cms/gsc/evidence-types";
import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "../lib/cms/seo-experiment-ledger/types";
import type { PlanningLineageStore } from "../lib/cms/seo-planning-lineage/repository";
import type { SeoPlanningDecisionLinkRow } from "../lib/cms/seo-planning-lineage/types";
import {
  createSeoDecisionPipelineContextFromData,
  evaluateSeoOpportunityPipeline,
} from "../lib/cms/seo-decision-pipeline";
import { SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED } from "../lib/cms/seo-planning/article-apply-production-gate";
import {
  evaluateNewBlogArticleEligibility,
  SEO_AI_ARTICLE_GENERATION_SPEC,
  type PrivateArticlePreview,
} from "../lib/cms/seo-planning/article-generation";
import { assessArticleEvidencePackForApply } from "../lib/cms/seo-planning/article-evidence-pack-adapter";
import {
  verifyPlanningFirstPartySiteFacts,
  type FirstPartyVerifyCatalog,
} from "../lib/cms/seo-autonomy/first-party-site-fact-verify";
import type {
  SidhuGscOpportunityProvenance,
  SidhuLedgerRunDetailReader,
  SidhuOpportunityEvidenceSnapshot,
  SidhuOpportunityEvidenceSnapshotReader,
} from "../lib/cms/seo-planning/article-sidhu-authoritative-readers-local";
import {
  evaluateSidhuArticleApplyReadonlyPreflightLocal,
  SEO_AI_ARTICLE_SIDHU_READONLY_PREFLIGHT_BINDING_SPEC,
} from "../lib/cms/seo-planning/article-sidhu-readonly-preflight-binding-local";
import type { SidhuAuthoritativePlanningCatalog } from "../lib/cms/seo-planning/article-sidhu-authoritative-sources-local";
import type { SeoEvidencePackInput } from "../lib/cms/seo-autonomy/evidence-pack";
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

const PLANNING_ID = "seoplan_a2_10_bind";
const RUN_ID = "seorun_a2_10_bind_0001";
const DECISION_ID = "seodec_a2_10_bind_0001";
const OID = "oid_a2_10_bind_firestick";
const QP_ID = "QP1";
const QUERY = "firestick iptv setup uk";
const PAGE = "https://theflixiptv.co.uk/blog/setup";
const SITE_CLAIM =
  "The Flix IPTV publishes UK-focused Firestick setup guidance on-site.";
const SITE_SLUG = "firestick-setup";
const SITE_URL = "https://theflixiptv.com/blogs/firestick-setup/";

function session(overrides: Partial<CurrentAdmin> = {}): CurrentAdmin {
  return {
    id: "admin_super_1",
    username: "super",
    displayName: "Super Admin",
    role: "super_admin",
    permissions: [],
    active: true,
    sessionVersion: 1,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    lastLoginAt: null,
    createdBy: null,
    isPrimary: true,
    effectivePermissions: ["seo", "blog"] as Permission[],
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

function publishedPost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post_setup_guide",
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

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: PLANNING_ID,
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:a2-10-bind",
    topic: "Firestick IPTV setup checklist for UK viewers",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    proposedSlug: "uk-firestick-a2-10-bind",
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
      sources: [{ title: "Ofcom", domain: "ofcom.org.uk", url: "https://www.ofcom.org.uk/" }],
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

function sampleArticle() {
  return {
    title: "Firestick IPTV Setup Checklist for UK Viewers",
    excerpt: "A practical UK Firestick setup checklist with modest claims.",
    html: "<h2>Prepare the Firestick</h2><p>Confirm the device network, app source, and account region before changing playback settings during peak evening hours.</p>",
  };
}

function previewFor(planning: SeoPlanningDraft): PrivateArticlePreview {
  const eligible = evaluateNewBlogArticleEligibility(planning, { status: "skipped" });
  assert.equal(eligible.ok, true);
  if (!eligible.ok) throw new Error("fixture must be eligible");
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
    id: DECISION_ID,
    runId: RUN_ID,
    opportunityIndex: 0,
    opportunityIdentity: OID,
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
    rfFingerprint: "rf_a210b",
    nbaAction: "NEW_BLOG",
    nbaStatus: "OK",
    nbaAutonomousEligible: true,
    nbaFingerprint: "nba_a210b",
    priorityScore: 80,
    priorityTier: "HIGH",
    priorityScoreVersion: "v1",
    priorityAutomationSelectable: true,
    priorityFingerprint: "pri_a210b",
    pipelineFingerprint: "pipe_a210b",
    selected: true,
    selectionSource: "manual_proceed",
  };
}

function linkRow(): SeoPlanningDecisionLinkRow {
  return {
    id: "seolink_a2_10_bind",
    planningDraftId: PLANNING_ID,
    decisionId: DECISION_ID,
    linkedByAdminId: "admin_super_1",
    linkedAt: "2026-10-06T00:00:02.000Z",
    selectionMarker: "server_research_binding",
  };
}

function memoryCatalog(drafts: SeoPlanningDraft[]): SidhuAuthoritativePlanningCatalog & {
  writes: number;
} {
  const state = { writes: 0 };
  return {
    get writes() {
      return state.writes;
    },
    async getSeoPlanningDraftById(id) {
      return drafts.find((d) => d.id === id) || null;
    },
    async getPostById() {
      return null;
    },
  };
}

function memoryLineageStore(args?: {
  schemaAvailable?: boolean;
}): PlanningLineageStore {
  const link = linkRow();
  return {
    async isLineageSchemaAvailable() {
      return args?.schemaAvailable !== false;
    },
    async getPlanningDraftById() {
      return null;
    },
    async getDecisionById(id) {
      const d = decisionRow();
      return d.id === id ? d : null;
    },
    async getResearchRunById(id) {
      const r = runRow();
      return r.id === id ? r : null;
    },
    async getLinkByPlanningDraftId(id) {
      return link.planningDraftId === id ? link : null;
    },
    async getLinkByDecisionId(id) {
      return link.decisionId === id ? link : null;
    },
    async insertLinkInTransaction() {
      throw new Error("lineage writes forbidden");
    },
  };
}

function ledgerDetail(): SidhuLedgerRunDetailReader {
  return {
    async getSeoResearchRunDetail({ runId }) {
      if (runId !== RUN_ID) {
        return { ok: false, errorCode: "not_found", errorMessage: "missing" };
      }
      return {
        ok: true,
        run: runRow(),
        decisions: [decisionRow()],
        decisionOverflow: false,
      };
    },
  };
}

function firstPartyCatalog(
  planning: SeoPlanningDraft,
  post: BlogPost | null,
): FirstPartyVerifyCatalog {
  return {
    async getSeoPlanningDraftById(id) {
      return id === planning.id ? planning : null;
    },
    async getPostBySlug(slug) {
      return post && post.slug === slug ? post : null;
    },
  };
}

async function verifiedSiteFactId(
  planning: SeoPlanningDraft,
  post: BlogPost,
): Promise<string> {
  const result = await verifyPlanningFirstPartySiteFacts({
    planningDraftId: planning.id,
    catalog: firstPartyCatalog(planning, post),
    authorized: true,
  });
  assert.equal(result.status, "OK");
  assert.ok(result.groundedEvidence[0]);
  return result.groundedEvidence[0].id;
}

function gscPack(): GscUkEvidencePack {
  return {
    status: "AVAILABLE",
    window: {
      recentStart: "2026-09-01",
      recentEnd: "2026-09-28",
      previousStart: "2026-08-01",
      previousEnd: "2026-08-28",
      reportingLagDays: 3,
    },
    country: { code: "GB", expression: "gbr" },
    recentQueries: [],
    recentPages: [],
    recentQueryPages: [
      { keys: [QUERY, PAGE], clicks: 4, impressions: 40, ctr: 0.1, position: 12 },
    ],
    previousPages: [],
  };
}

function validPackInput(siteFactId: string): SeoEvidencePackInput {
  const ctx = createSeoDecisionPipelineContextFromData({
    posts: [],
    planningDrafts: [],
    runId: RUN_ID,
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
    gscEvidenceRefs: [QP_ID],
    gscEvidence: [
      {
        id: QP_ID,
        kind: "query_page",
        query: QUERY,
        pageUrl: PAGE,
        normalizedPath: "/blog/setup",
        classification: undefined,
        clicks: 4,
        impressions: 40,
        ctr: 0.1,
        position: 12,
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
    opportunityIdentity: OID,
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
        id: siteFactId,
        kind: "site_fact" as const,
        description: `First-party published CMS content confirms: ${SITE_CLAIM}`,
        sourceUrl: SITE_URL,
      },
    ],
    gscEvidence: opp.gscEvidence,
    originalContribution: {
      statement:
        "Compare Firestick setup steps against The Flix IPTV UK onboarding checklist and supported app list.",
      backing: "grounded_evidence" as const,
      evidenceIds: [siteFactId, "ge_amazon"],
    },
  };
}

function gscProvenance(): SidhuGscOpportunityProvenance {
  return {
    runId: RUN_ID,
    decisionId: DECISION_ID,
    opportunityIdentity: OID,
    opportunityIndex: 0,
    evidenceRefs: [{ id: QP_ID, kind: "query_page", query: QUERY, pageUrl: PAGE }],
    opportunityGscEvidenceIds: [QP_ID],
    pack: gscPack(),
  };
}

function snapshot(
  siteFactId: string,
  overrides: Partial<SidhuOpportunityEvidenceSnapshot> = {},
): SidhuOpportunityEvidenceSnapshotReader {
  const snap: SidhuOpportunityEvidenceSnapshot = {
    packInput: validPackInput(siteFactId),
    syntheticTest: true,
    gscOpportunityProvenance: gscProvenance(),
    ...overrides,
  };
  return {
    async readForValidatedDecision() {
      return { ok: true, snapshot: snap };
    },
  };
}

function approvalFor(adminId: string) {
  return {
    factualReviewConfirmed: true as const,
    approvedByAdminId: adminId,
  };
}

function bindDeps(args: {
  session: CurrentAdmin | null;
  catalog: SidhuAuthoritativePlanningCatalog & { writes?: number };
  planning: SeoPlanningDraft;
  post: BlogPost | null;
  opportunityEvidence?: SidhuOpportunityEvidenceSnapshotReader;
  lineageStore?: PlanningLineageStore;
  writeFreezeEnv?: Record<string, string | undefined>;
}) {
  return {
    resolveSession: async () => args.session,
    catalog: args.catalog,
    lineageStore: args.lineageStore ?? memoryLineageStore(),
    ledgerDetail: ledgerDetail(),
    opportunityEvidence: args.opportunityEvidence!,
    firstPartyCatalog: firstPartyCatalog(args.planning, args.post),
    writeFreezeEnv: args.writeFreezeEnv,
  };
}

test("binding source hygiene + A2-10 spec + production gate OFF", () => {
  const src = read("lib/cms/seo-planning/article-sidhu-readonly-preflight-binding-local.ts");
  assert.equal(
    SEO_AI_ARTICLE_SIDHU_READONLY_PREFLIGHT_BINDING_SPEC,
    "a2-10-sidhu-readonly-preflight-binding-local-v1",
  );
  assert.match(src, /firstPartyCatalog/);
  assert.match(src, /evaluateSidhuArticleApplyPreflightLocal/);
  assert.equal(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED, false);
});

test("AUTH + PREFLIGHT: verifier-backed READY never authorizes Apply", async () => {
  const admin = session();
  const planning = draft();
  const post = publishedPost();
  const siteFactId = await verifiedSiteFactId(planning, post);
  const catalog = memoryCatalog([planning]);
  const preview = previewFor(planning);
  const evidence = snapshot(siteFactId);

  const none = await evaluateSidhuArticleApplyReadonlyPreflightLocal(
    { planningDraftId: planning.id, clientPreview: preview },
    bindDeps({ session: null, catalog, planning, post, opportunityEvidence: evidence }),
  );
  assert.equal(none.ok, false);
  assert.equal(none.executionAuthorized, false);

  const noSeo = await evaluateSidhuArticleApplyReadonlyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      serverHumanApproval: approvalFor("admin_custom_1"),
    },
    bindDeps({
      session: session({
        id: "admin_custom_1",
        role: "custom",
        permissions: ["blog"],
        effectivePermissions: ["blog"] as Permission[],
      }),
      catalog,
      planning,
      post,
      opportunityEvidence: evidence,
    }),
  );
  assert.equal(noSeo.ok, false);
  if (!noSeo.ok) assert.equal(noSeo.code, "access_denied");

  const noApproval = await evaluateSidhuArticleApplyReadonlyPreflightLocal(
    { planningDraftId: planning.id, clientPreview: preview },
    bindDeps({ session: admin, catalog, planning, post, opportunityEvidence: evidence }),
  );
  assert.equal(noApproval.ok, false);
  if (!noApproval.ok) assert.equal(noApproval.code, "approval_required");

  const stale = await evaluateSidhuArticleApplyReadonlyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      expectedPlanningUpdatedAt: "2026-10-09T00:00:00.000Z",
      serverHumanApproval: approvalFor(admin.id),
    },
    bindDeps({ session: admin, catalog, planning, post, opportunityEvidence: evidence }),
  );
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "planning_stale");

  const holdPack = validPackInput(siteFactId);
  holdPack.groundedEvidence = [];
  holdPack.originalContribution = undefined;
  holdPack.gscEvidence = [];
  assert.notEqual(
    assessArticleEvidencePackForApply(holdPack).applyEvidenceGate,
    "PASS_DRAFTING_REVIEW_ONLY",
  );

  const ready = await evaluateSidhuArticleApplyReadonlyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: approvalFor(admin.id),
    },
    bindDeps({ session: admin, catalog, planning, post, opportunityEvidence: evidence }),
  );
  assert.equal(ready.ok, true, !ready.ok ? `${ready.code}: ${ready.error}` : "");
  assert.equal(ready.executionAuthorized, false);
  assert.equal(ready.productionWiringEnabled, false);
  assert.equal(ready.blogMutationPerformed, false);
  assert.equal(ready.planningMutationPerformed, false);
  assert.equal(ready.durableApplyInvoked, false);
  assert.equal(ready.providerRequests, 0);
  if (ready.ok) {
    assert.equal(ready.evidenceProvenance, "synthetic_test");
    assert.equal(
      ready.trustedEvidencePack.applyEvidenceGate,
      "PASS_DRAFTING_REVIEW_ONLY",
    );
    assert.ok(ready.evidenceDiagnostic?.categories.includes("FIRST_PARTY_VERIFIED"));
    assert.equal(ready.evidenceDiagnostic?.firstPartyTrust, "verifier_accepted");
  }
  assert.equal(catalog.writes, 0);

  const forged = await evaluateSidhuArticleApplyReadonlyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      serverHumanApproval: approvalFor(admin.id),
    },
    bindDeps({
      session: admin,
      catalog,
      planning,
      post,
      opportunityEvidence: snapshot(siteFactId, {
        clientVerifiedClaim: { verified: true },
      }),
    }),
  );
  assert.equal(forged.ok, false);
  assert.equal(forged.executionAuthorized, false);

  const execDenied = await evaluateSidhuArticleApplyReadonlyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: approvalFor(admin.id),
      requestExecutionAuthorization: true,
    },
    bindDeps({ session: admin, catalog, planning, post, opportunityEvidence: evidence }),
  );
  assert.equal(execDenied.ok, false);
  if (!execDenied.ok) assert.equal(execDenied.code, "feature_disabled");
  assert.equal(execDenied.executionAuthorized, false);

  const frozen = await evaluateSidhuArticleApplyReadonlyPreflightLocal(
    { planningDraftId: planning.id, clientPreview: preview },
    bindDeps({
      session: admin,
      catalog,
      planning,
      post,
      opportunityEvidence: evidence,
      writeFreezeEnv: { CMS_WRITE_FREEZE: "1" },
    }),
  );
  assert.equal(frozen.ok, false);
  assert.equal(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED, false);
});
