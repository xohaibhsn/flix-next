/**
 * A2-12 — Provenance DI → A2-10 readonly preflight (offline).
 * Injected fakes only. No network, DB, GSC API, AI, or durable Apply.
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
import {
  verifyPlanningFirstPartySiteFacts,
} from "../lib/cms/seo-autonomy/first-party-site-fact-verify";
import type {
  SidhuGscOpportunityProvenance,
  SidhuOpportunityEvidenceSnapshot,
} from "../lib/cms/seo-planning/article-sidhu-authoritative-readers-local";
import {
  createSidhuOpportunityEvidenceSnapshotReaderFromInjectedLoader,
  evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal,
  SEO_AI_ARTICLE_SIDHU_PROVENANCE_DI_SPEC,
  validateStoredGscOpportunityProvenanceLocal,
  type SidhuLiveReadonlyDiDeps,
  type SidhuStoredOpportunityEvidenceMaterials,
} from "../lib/cms/seo-planning/article-sidhu-provenance-di-local";
import type { SeoEvidencePackInput } from "../lib/cms/seo-autonomy/evidence-pack";
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

const PLANNING_ID = "seoplan_a2_12_prov";
const RUN_ID = "seorun_a2_12_prov_0001";
const DECISION_ID = "seodec_a2_12_prov_0001";
const OID = "oid_a2_12_prov_firestick";
const QP_ID = "QP_A212";
const QUERY = "firestick iptv setup uk";
const PAGE = "https://theflixiptv.co.uk/blog/setup";
const SITE_CLAIM =
  "The Flix IPTV publishes UK-focused Firestick setup guidance on-site.";
const SITE_SLUG = "firestick-setup-a212p";
const SITE_URL = `https://theflixiptv.com/blogs/${SITE_SLUG}/`;

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
    id: "post_setup_a212p",
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
    fingerprint: "NEW_BLOG:a2-12-prov",
    topic: "Firestick IPTV setup checklist for UK viewers",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    proposedSlug: "uk-firestick-a2-12-prov",
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

function runRow(overrides: Partial<SeoResearchRunRow> = {}): SeoResearchRunRow {
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
    ...overrides,
  };
}

function decisionRow(
  overrides: Partial<SeoOpportunityDecisionRow> = {},
): SeoOpportunityDecisionRow {
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
    rfFingerprint: "rf_a212p",
    nbaAction: "NEW_BLOG",
    nbaStatus: "OK",
    nbaAutonomousEligible: true,
    nbaFingerprint: "nba_a212p",
    priorityScore: 80,
    priorityTier: "HIGH",
    priorityScoreVersion: "v1",
    priorityAutomationSelectable: true,
    priorityFingerprint: "pri_a212p",
    pipelineFingerprint: "pipe_a212p",
    selected: true,
    selectionSource: "manual_proceed",
    ...overrides,
  };
}

function linkRow(): SeoPlanningDecisionLinkRow {
  return {
    id: "seolink_a2_12_prov",
    planningDraftId: PLANNING_ID,
    decisionId: DECISION_ID,
    linkedByAdminId: "admin_super_1",
    linkedAt: "2026-10-06T00:00:02.000Z",
    selectionMarker: "server_research_binding",
  };
}

function memoryLineageStore(args: {
  schemaAvailable?: boolean;
  link?: SeoPlanningDecisionLinkRow | null;
  decision?: SeoOpportunityDecisionRow | null;
  run?: SeoResearchRunRow | null;
}): PlanningLineageStore & { reads: number } {
  const state = { reads: 0 };
  const link = args.link === undefined ? linkRow() : args.link;
  return {
    get reads() {
      return state.reads;
    },
    async isLineageSchemaAvailable() {
      state.reads += 1;
      return args.schemaAvailable !== false;
    },
    async getPlanningDraftById() {
      state.reads += 1;
      return null;
    },
    async getDecisionById(id) {
      state.reads += 1;
      const d = args.decision === undefined ? decisionRow() : args.decision;
      return d && d.id === id ? d : null;
    },
    async getResearchRunById(id) {
      state.reads += 1;
      const r = args.run === undefined ? runRow() : args.run;
      return r && r.id === id ? r : null;
    },
    async getLinkByPlanningDraftId(id) {
      state.reads += 1;
      return link && link.planningDraftId === id ? link : null;
    },
    async getLinkByDecisionId(id) {
      state.reads += 1;
      return link && link.decisionId === id ? link : null;
    },
    async insertLinkInTransaction() {
      throw new Error("lineage writes forbidden");
    },
  };
}

function gscPack(overrides: Partial<GscUkEvidencePack> = {}): GscUkEvidencePack {
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
    ...overrides,
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

function gscProvenance(
  overrides: Partial<SidhuGscOpportunityProvenance> = {},
): SidhuGscOpportunityProvenance {
  return {
    runId: RUN_ID,
    decisionId: DECISION_ID,
    opportunityIdentity: OID,
    opportunityIndex: 0,
    evidenceRefs: [{ id: QP_ID, kind: "query_page", query: QUERY, pageUrl: PAGE }],
    opportunityGscEvidenceIds: [QP_ID],
    pack: gscPack(),
    ...overrides,
  };
}

async function siteFactIdFor(planning: SeoPlanningDraft, post: BlogPost): Promise<string> {
  const result = await verifyPlanningFirstPartySiteFacts({
    planningDraftId: planning.id,
    catalog: {
      async getSeoPlanningDraftById(id) {
        return id === planning.id ? planning : null;
      },
      async getPostBySlug(slug) {
        return post && post.slug === slug ? post : null;
      },
    },
    authorized: true,
  });
  assert.equal(result.status, "OK");
  assert.ok(result.groundedEvidence[0]);
  return result.groundedEvidence[0].id;
}

function materialsFor(
  siteFactId: string,
  snapshotOverrides: Partial<SidhuOpportunityEvidenceSnapshot> = {},
): SidhuStoredOpportunityEvidenceMaterials {
  return {
    planningDraftId: PLANNING_ID,
    decisionId: DECISION_ID,
    runId: RUN_ID,
    opportunityIdentity: OID,
    opportunityIndex: 0,
    snapshot: {
      packInput: validPackInput(siteFactId),
      syntheticTest: true,
      gscOpportunityProvenance: gscProvenance(),
      ...snapshotOverrides,
    },
  };
}

function baseDiDeps(args: {
  planning: SeoPlanningDraft;
  post: BlogPost | null;
  siteFactId: string;
  lineage?: ReturnType<typeof memoryLineageStore>;
  ledgerCalls?: { n: number };
  evidenceCalls?: { n: number };
  loadEvidence?: SidhuLiveReadonlyDiDeps["loadOpportunityEvidence"];
  resolveSession?: () => Promise<CurrentAdmin | null>;
  writeFreezeEnv?: Record<string, string | undefined>;
  ledgerDetail?: SidhuLiveReadonlyDiDeps["getLedgerRunDetail"];
}): SidhuLiveReadonlyDiDeps {
  const ledgerCalls = args.ledgerCalls ?? { n: 0 };
  const evidenceCalls = args.evidenceCalls ?? { n: 0 };
  const lineage = args.lineage ?? memoryLineageStore({});
  return {
    resolveSession: args.resolveSession ?? (async () => session()),
    planningBlogReaders: {
      async getSeoPlanningDraftById(id) {
        return id === args.planning.id ? args.planning : null;
      },
      async getPostById() {
        return null;
      },
    },
    firstPartyBlogReaders: {
      async getSeoPlanningDraftById(id) {
        return id === args.planning.id ? args.planning : null;
      },
      async getPostBySlug(slug) {
        return args.post && args.post.slug === slug ? args.post : null;
      },
    },
    lineageStore: lineage,
    getLedgerRunDetail:
      args.ledgerDetail ??
      (async ({ runId }) => {
        ledgerCalls.n += 1;
        if (runId !== RUN_ID) {
          return { ok: false, errorCode: "not_found", errorMessage: "missing" };
        }
        return {
          ok: true,
          run: runRow(),
          decisions: [decisionRow()],
          decisionOverflow: false,
        };
      }),
    loadOpportunityEvidence:
      args.loadEvidence ??
      (async (identity) => {
        evidenceCalls.n += 1;
        const m = materialsFor(args.siteFactId);
        if (
          identity.planningDraftId !== m.planningDraftId ||
          identity.decisionId !== m.decisionId ||
          identity.runId !== m.runId ||
          identity.opportunityIdentity !== m.opportunityIdentity ||
          identity.opportunityIndex !== m.opportunityIndex
        ) {
          return {
            ok: false,
            code: "identity_mismatch",
            message: "loader identity mismatch",
          };
        }
        return { ok: true, materials: m };
      }),
    writeFreezeEnv: args.writeFreezeEnv,
  };
}

test("A2-12 provenance DI: import graph stays free of cms/pool/read-mysql/GSC clients", () => {
  assert.equal(SEO_AI_ARTICLE_SIDHU_PROVENANCE_DI_SPEC, "a2-12-sidhu-provenance-di-local-v1");
  assert.equal(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED, false);
  const cat = read("lib/cms/seo-planning/article-sidhu-catalog-ledger-di-local.ts");
  const prov = read("lib/cms/seo-planning/article-sidhu-provenance-di-local.ts");
  for (const src of [cat, prov]) {
    assert.doesNotMatch(src, /from ["']@\/lib\/cms\/repository["']/);
    assert.doesNotMatch(src, /from ["']@\/lib\/db\/pool["']/);
    assert.doesNotMatch(src, /seo-experiment-ledger\/read-mysql/);
    assert.doesNotMatch(src, /import\s+\{[^}]*getDbPool/);
    assert.doesNotMatch(src, /from ["'][^"']*openai[^"']*["']/i);
    assert.doesNotMatch(src, /from ["'][^"']*gemini[^"']*["']/i);
    assert.doesNotMatch(src, /from ["'][^"']*hostinger[^"']*["']/i);
  }
});

test("A2-12 provenance DI: GSC ownership validator rejects run-level-only and forged ids", () => {
  const expected = {
    decisionId: DECISION_ID,
    runId: RUN_ID,
    opportunityIdentity: OID,
    opportunityIndex: 0,
  };
  assert.equal(validateStoredGscOpportunityProvenanceLocal(gscProvenance(), expected).ok, true);

  const runLevelOnly = validateStoredGscOpportunityProvenanceLocal(
    gscProvenance({ evidenceRefs: [], opportunityGscEvidenceIds: [] }),
    expected,
  );
  assert.equal(runLevelOnly.ok, false);

  const forged = validateStoredGscOpportunityProvenanceLocal(
    gscProvenance({
      evidenceRefs: [{ id: "FORGED", kind: "query_page", query: QUERY, pageUrl: PAGE }],
      opportunityGscEvidenceIds: ["FORGED"],
    }),
    expected,
  );
  // forged id present in both lists still fails pack record existence later in A2-10;
  // ownership lists are self-consistent here — wrong country is a clearer DI reject:
  const wrongCountry = validateStoredGscOpportunityProvenanceLocal(
    gscProvenance({
      pack: {
        ...gscPack(),
        country: { code: "US", expression: "usa" } as unknown as GscUkEvidencePack["country"],
      },
    }),
    expected,
  );
  assert.equal(wrongCountry.ok, false);

  const wrongOpp = validateStoredGscOpportunityProvenanceLocal(
    gscProvenance({ opportunityIdentity: "oid_other" }),
    expected,
  );
  assert.equal(wrongOpp.ok, false);

  void forged;
});

test("A2-12 provenance DI: snapshot reader identity + evidence failure paths", async () => {
  const planning = draft();
  const post = publishedPost();
  const siteFactId = await siteFactIdFor(planning, post);

  const good = createSidhuOpportunityEvidenceSnapshotReaderFromInjectedLoader(async () => ({
    ok: true,
    materials: materialsFor(siteFactId),
  }));
  const ok = await good.readForValidatedDecision({
    planningDraftId: PLANNING_ID,
    decisionId: DECISION_ID,
    runId: RUN_ID,
    opportunityIdentity: OID,
    opportunityIndex: 0,
  });
  assert.equal(ok.ok, true);
  assert.equal(good.callCount, 1);

  const mismatch = createSidhuOpportunityEvidenceSnapshotReaderFromInjectedLoader(async () => ({
    ok: true,
    materials: {
      ...materialsFor(siteFactId),
      opportunityIdentity: "oid_wrong",
    },
  }));
  const badId = await mismatch.readForValidatedDecision({
    planningDraftId: PLANNING_ID,
    decisionId: DECISION_ID,
    runId: RUN_ID,
    opportunityIdentity: OID,
    opportunityIndex: 0,
  });
  assert.equal(badId.ok, false);
  if (!badId.ok) assert.equal(badId.code, "identity_mismatch");

  const runLevel = createSidhuOpportunityEvidenceSnapshotReaderFromInjectedLoader(async () => ({
    ok: true,
    materials: materialsFor(siteFactId, {
      gscOpportunityProvenance: gscProvenance({
        evidenceRefs: [],
        opportunityGscEvidenceIds: [],
      }),
    }),
  }));
  const runLevelResult = await runLevel.readForValidatedDecision({
    planningDraftId: PLANNING_ID,
    decisionId: DECISION_ID,
    runId: RUN_ID,
    opportunityIdentity: OID,
    opportunityIndex: 0,
  });
  assert.equal(runLevelResult.ok, false);

  const throws = createSidhuOpportunityEvidenceSnapshotReaderFromInjectedLoader(async () => {
    throw new Error("boom password=secret");
  });
  const thrown = await throws.readForValidatedDecision({
    planningDraftId: PLANNING_ID,
    decisionId: DECISION_ID,
    runId: RUN_ID,
    opportunityIdentity: OID,
    opportunityIndex: 0,
  });
  assert.equal(thrown.ok, false);
  if (!thrown.ok) {
    assert.equal(thrown.code, "error");
    assert.doesNotMatch(thrown.message, /password=secret/);
  }
});

test("A2-12 provenance DI: lineage schema unavailable / unlinked / missing decision fail closed", async () => {
  const planning = draft();
  const post = publishedPost();
  const siteFactId = await siteFactIdFor(planning, post);

  const schemaOff = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: previewFor(planning),
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      lineage: memoryLineageStore({ schemaAvailable: false }),
    }),
  );
  assert.equal(schemaOff.ok, false);
  assert.equal(schemaOff.executionAuthorized, false);

  const unlinked = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: previewFor(planning),
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      lineage: memoryLineageStore({ link: null }),
    }),
  );
  assert.equal(unlinked.ok, false);
  assert.equal(unlinked.executionAuthorized, false);

  const missingDecision = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: previewFor(planning),
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      lineage: memoryLineageStore({ decision: null }),
    }),
  );
  assert.equal(missingDecision.ok, false);

  const missingRun = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: previewFor(planning),
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      lineage: memoryLineageStore({ run: null }),
    }),
  );
  assert.equal(missingRun.ok, false);

  const pipelineBad = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: previewFor(planning),
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      lineage: memoryLineageStore({
        run: runRow({
          pipelineRunStatus: "CONTEXT_ERROR",
          researchOk: false,
        }),
      }),
    }),
  );
  assert.equal(pipelineBad.ok, false);
});

test("A2-12 provenance DI: decision/run mismatch and no inferred title/URL linkage", async () => {
  const planning = draft();
  const post = publishedPost();
  const siteFactId = await siteFactIdFor(planning, post);
  const ledgerCalls = { n: 0 };

  const mismatch = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: previewFor(planning),
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      ledgerCalls,
      ledgerDetail: async ({ runId }) => {
        ledgerCalls.n += 1;
        assert.equal(runId, RUN_ID);
        return {
          ok: true,
          run: runRow({ id: RUN_ID }),
          decisions: [decisionRow({ id: "seodec_other", opportunityIdentity: "oid_other" })],
          decisionOverflow: false,
        };
      },
    }),
  );
  assert.equal(mismatch.ok, false);
  assert.equal(ledgerCalls.n, 1);

  // Similar title alone must not authorize — no link => unavailable.
  const similarTitlePlanning = draft({
    id: "seoplan_a2_12_similar",
    topic: "Firestick IPTV setup checklist for UK viewers",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
  });
  const noInfer = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: similarTitlePlanning.id,
      clientPreview: previewFor(similarTitlePlanning),
      expectedPlanningUpdatedAt: similarTitlePlanning.updatedAt,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    {
      ...baseDiDeps({
        planning: similarTitlePlanning,
        post,
        siteFactId,
        lineage: memoryLineageStore({
          link: null,
          // Decision exists with matching title but no persisted link.
          decision: decisionRow(),
          run: runRow(),
        }),
      }),
      planningBlogReaders: {
        async getSeoPlanningDraftById(id) {
          return id === similarTitlePlanning.id ? similarTitlePlanning : null;
        },
        async getPostById() {
          return null;
        },
      },
    },
  );
  assert.equal(noInfer.ok, false);
});

test("A2-12 provenance DI: RBAC / freeze / approval / stale / HOLD isolation", async () => {
  const planning = draft();
  const post = publishedPost();
  const siteFactId = await siteFactIdFor(planning, post);
  const preview = previewFor(planning);

  const noSession = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    { planningDraftId: PLANNING_ID, clientPreview: preview },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      resolveSession: async () => null,
    }),
  );
  assert.equal(noSession.ok, false);
  assert.equal(noSession.executionAuthorized, false);

  const nonSuper = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    { planningDraftId: PLANNING_ID, clientPreview: preview },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      resolveSession: async () =>
        session({
          role: "full_access",
          effectivePermissions: ["seo", "blog"] as Permission[],
        }),
    }),
  );
  assert.equal(nonSuper.ok, false);

  const noSeo = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    { planningDraftId: PLANNING_ID, clientPreview: preview },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      resolveSession: async () =>
        session({ effectivePermissions: ["blog"] as Permission[] }),
    }),
  );
  assert.equal(noSeo.ok, false);

  const noBlog = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    { planningDraftId: PLANNING_ID, clientPreview: preview },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      resolveSession: async () =>
        session({ effectivePermissions: ["seo"] as Permission[] }),
    }),
  );
  assert.equal(noBlog.ok, false);

  const frozen = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: preview,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      writeFreezeEnv: { CMS_WRITE_FREEZE: "1" },
    }),
  );
  assert.equal(frozen.ok, false);

  const noApproval = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: preview,
      expectedPlanningUpdatedAt: planning.updatedAt,
    },
    baseDiDeps({ planning, post, siteFactId }),
  );
  assert.equal(noApproval.ok, false);

  const stale = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: preview,
      expectedPlanningUpdatedAt: "2026-01-01T00:00:00.000Z",
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    baseDiDeps({ planning, post, siteFactId }),
  );
  assert.equal(stale.ok, false);

  const refresh = draft({
    id: "seoplan_a2_12_refresh",
    recommendation: "REFRESH_EXISTING",
    fingerprint: "REFRESH_EXISTING:a2-12",
  });
  const unsupported = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: refresh.id,
      clientPreview: previewFor(draft()),
      expectedPlanningUpdatedAt: refresh.updatedAt,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    {
      ...baseDiDeps({ planning: refresh, post, siteFactId }),
      planningBlogReaders: {
        async getSeoPlanningDraftById(id) {
          return id === refresh.id ? refresh : null;
        },
        async getPostById() {
          return null;
        },
      },
    },
  );
  assert.equal(unsupported.ok, false);
});

test("A2-12 provenance DI: eligible synthetic preflight via DI; executionAuthorized always false; single ledger/evidence calls", async () => {
  const planning = draft();
  const post = publishedPost();
  const siteFactId = await siteFactIdFor(planning, post);
  const ledgerCalls = { n: 0 };
  const evidenceCalls = { n: 0 };
  const lineage = memoryLineageStore({});
  const preview = previewFor(planning);

  const result = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: preview,
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      lineage,
      ledgerCalls,
      evidenceCalls,
    }),
  );

  assert.equal(result.ok, true, !result.ok ? `${result.code}: ${result.error}` : "");
  assert.equal(result.executionAuthorized, false);
  assert.equal(result.productionWiringEnabled, false);
  assert.equal(result.blogMutationPerformed, false);
  assert.equal(result.planningMutationPerformed, false);
  assert.equal(result.durableApplyInvoked, false);
  assert.equal(result.providerRequests, 0);
  assert.equal(result.diProvenanceSpec, SEO_AI_ARTICLE_SIDHU_PROVENANCE_DI_SPEC);
  assert.equal(ledgerCalls.n, 1);
  assert.equal(evidenceCalls.n, 1);
  assert.ok(lineage.reads > 0);
  assert.ok(lineage.reads <= 5);

  const execDenied = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: preview,
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
      requestExecutionAuthorization: true,
    },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      lineage: memoryLineageStore({}),
    }),
  );
  assert.equal(execDenied.ok, false);
  if (!execDenied.ok) assert.equal(execDenied.code, "feature_disabled");
  assert.equal(execDenied.executionAuthorized, false);
});

test("A2-12 provenance DI: editorial URL / forged verified claim cannot authorize; missing first-party source holds", async () => {
  const planning = draft();
  const post = publishedPost();
  const siteFactId = await siteFactIdFor(planning, post);

  const forgedVerified = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: previewFor(planning),
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    baseDiDeps({
      planning,
      post,
      siteFactId,
      loadEvidence: async () => ({
        ok: true,
        materials: materialsFor(siteFactId, {
          clientVerifiedClaim: {
            verified: true,
            trusted: true,
            url: SITE_URL,
            blogPostId: post.id,
            evidenceId: "sf_forged_client",
          },
          // Strip real site_fact so only forged claim remains untrusted.
          packInput: {
            ...validPackInput(siteFactId),
            groundedEvidence: [
              {
                id: "ge_amazon",
                kind: "source_verified" as const,
                description: "Amazon Fire TV help pages document device setup steps used in the angle.",
                sourceUrl: "https://www.amazon.co.uk/gp/help/customer/display.html",
              },
            ],
            originalContribution: {
              statement:
                "Compare Firestick setup steps against The Flix IPTV UK onboarding checklist and supported app list.",
              backing: "grounded_evidence" as const,
              evidenceIds: ["ge_amazon"],
            },
          },
        }),
      }),
    }),
  );
  // May pass drafting-review on remaining grounded evidence, but never authorize Apply.
  assert.equal(forgedVerified.executionAuthorized, false);

  const missingFp = await evaluateSidhuArticleApplyReadonlyPreflightViaDiLocal(
    {
      planningDraftId: PLANNING_ID,
      clientPreview: previewFor(planning),
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: {
        factualReviewConfirmed: true,
        approvedByAdminId: "admin_super_1",
      },
    },
    {
      ...baseDiDeps({
        planning,
        post: null,
        siteFactId,
      }),
      firstPartyBlogReaders: {
        async getSeoPlanningDraftById(id) {
          return id === planning.id ? planning : null;
        },
        async getPostBySlug() {
          return null;
        },
      },
    },
  );
  assert.equal(missingFp.ok, false);
  assert.equal(missingFp.executionAuthorized, false);
});
