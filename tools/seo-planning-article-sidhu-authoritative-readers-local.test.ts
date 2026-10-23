/**
 * A2-9/A2-10 — Authoritative readers provenance + reused first-party verifier tests.
 * Injected lineage/Ledger/evidence/catalog only. No MySQL pool, GSC API, AI, or CMS writes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SeoResearchOpportunity } from "../lib/cms/ai-seo/research-schemas";
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
import {
  contentFingerprintForPost,
  verifyPlanningFirstPartySiteFacts,
  type FirstPartyVerifyCatalog,
} from "../lib/cms/seo-autonomy/first-party-site-fact-verify";
import {
  assessFirstPartySiteFactTrustLocal,
  assessGscOpportunityLinkageLocal,
  classifyGscUkPackLinkageLocal,
  createSidhuAuthoritativeEvidenceReaderLocal,
  readSidhuPlanningEditorialAsUntrustedLocal,
  resolveAuthoritativeEvidencePackInputForPlanningLocal,
  SIDHU_AUTHORITATIVE_READ_BUDGET,
  SEO_AI_ARTICLE_SIDHU_AUTHORITATIVE_READERS_SPEC,
  type SidhuGscOpportunityProvenance,
  type SidhuLedgerRunDetailReader,
  type SidhuOpportunityEvidenceSnapshot,
  type SidhuOpportunityEvidenceSnapshotReader,
} from "../lib/cms/seo-planning/article-sidhu-authoritative-readers-local";
import {
  loadAuthoritativeSeoPlanningForApply,
  type SidhuAuthoritativePlanningCatalog,
} from "../lib/cms/seo-planning/article-sidhu-authoritative-sources-local";
import { SEO_AI_ARTICLE_APPLY_PROTECTED_FIXTURE_FINGERPRINT_PREFIX } from "../lib/cms/seo-planning/article-apply-readiness";
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";
import type { SeoEvidencePackInput } from "../lib/cms/seo-autonomy/evidence-pack";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

const PLANNING_ID = "seoplan_a2_10_readers";
const RUN_ID = "seorun_a2_10_readers_0001";
const DECISION_ID = "seodec_a2_10_readers_0001";
const OID = "oid_a2_10_readers_firestick";
const QP_ID = "QP1";
const QUERY = "firestick iptv setup uk";
const PAGE = "https://theflixiptv.co.uk/blog/setup";
const SITE_CLAIM =
  "The Flix IPTV publishes UK-focused Firestick setup guidance on-site.";
const SITE_SLUG = "firestick-setup";
const SITE_URL = "https://theflixiptv.com/blogs/firestick-setup/";

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
    fingerprint: "NEW_BLOG:a2-10-readers",
    topic: "Firestick IPTV setup checklist for UK viewers",
    workingTitle: "Firestick IPTV Setup Checklist for UK Viewers",
    proposedSlug: "uk-firestick-a2-10",
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
        readerBenefit: "Faster isolation of home Wi-Fi issues.",
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
): Promise<{ evidenceId: string; fingerprint: string }> {
  const result = await verifyPlanningFirstPartySiteFacts({
    planningDraftId: planning.id,
    catalog: firstPartyCatalog(planning, post),
    authorized: true,
  });
  assert.equal(result.status, "OK");
  assert.ok(result.groundedEvidence[0], "verifier must accept site fact");
  return {
    evidenceId: result.groundedEvidence[0].id,
    fingerprint: result.provenance[0].contentFingerprint,
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

function decisionRow(overrides: Partial<SeoOpportunityDecisionRow> = {}): SeoOpportunityDecisionRow {
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
    rfFingerprint: "rf_a210",
    nbaAction: "NEW_BLOG",
    nbaStatus: "OK",
    nbaAutonomousEligible: true,
    nbaFingerprint: "nba_a210",
    priorityScore: 80,
    priorityTier: "HIGH",
    priorityScoreVersion: "v1",
    priorityAutomationSelectable: true,
    priorityFingerprint: "pri_a210",
    pipelineFingerprint: "pipe_a210",
    selected: true,
    selectionSource: "manual_proceed",
    ...overrides,
  };
}

function linkRow(): SeoPlanningDecisionLinkRow {
  return {
    id: "seolink_a2_10_1",
    planningDraftId: PLANNING_ID,
    decisionId: DECISION_ID,
    linkedByAdminId: "admin_super_1",
    linkedAt: "2026-10-06T00:00:02.000Z",
    selectionMarker: "server_research_binding",
  };
}

function memoryCatalog(drafts: SeoPlanningDraft[]): SidhuAuthoritativePlanningCatalog {
  return {
    async getSeoPlanningDraftById(id) {
      return drafts.find((d) => d.id === id) || null;
    },
    async getPostById() {
      return null;
    },
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
      throw new Error("writes forbidden");
    },
  };
}

function ledgerDetailReader(args: {
  run?: SeoResearchRunRow;
  decisions?: SeoOpportunityDecisionRow[];
  throwError?: boolean;
}): SidhuLedgerRunDetailReader & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async getSeoResearchRunDetail({ runId }) {
      state.calls += 1;
      if (args.throwError) throw new Error("ledger timeout");
      const run = args.run ?? runRow();
      if (run.id !== runId) {
        return { ok: false, errorCode: "not_found", errorMessage: "missing" };
      }
      return {
        ok: true,
        run,
        decisions: args.decisions ?? [decisionRow()],
        decisionOverflow: false,
      };
    },
  };
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

function snapshotReader(
  snapshot: SidhuOpportunityEvidenceSnapshot,
): SidhuOpportunityEvidenceSnapshotReader & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async readForValidatedDecision() {
      state.calls += 1;
      return { ok: true, snapshot };
    },
  };
}

test("SPEC + hygiene: A2-10 reuses verifier module; no pool/GSC/AI writes", () => {
  const src = read("lib/cms/seo-planning/article-sidhu-authoritative-readers-local.ts");
  assert.equal(
    SEO_AI_ARTICLE_SIDHU_AUTHORITATIVE_READERS_SPEC,
    "a2-10-sidhu-authoritative-readers-local-v1",
  );
  assert.match(src, /verifyPlanningFirstPartySiteFacts/);
  assert.match(src, /first-party-site-fact-verify/);
  assert.doesNotMatch(src, /getDbPool|from \"@\/lib\/db\/pool\"/);
  assert.doesNotMatch(src, /from \"@\/lib\/cms\/seo-experiment-ledger\/read-mysql\"/);
  assert.ok(SIDHU_AUTHORITATIVE_READ_BUDGET.totalMaxLogicalReads <= 10);
  assert.equal(fileExistsRelative("lib/cms/seo-autonomy/first-party-site-fact-verify.ts"), true);
});

function fileExistsRelative(rel: string) {
  try {
    readFileSync(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

test("PLANNING + editorial never verified by itself", async () => {
  const valid = draft();
  const ok = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: PLANNING_ID,
    catalog: memoryCatalog([valid]),
  });
  assert.equal(ok.ok, true);
  const fixture = await loadAuthoritativeSeoPlanningForApply({
    planningDraftId: PLANNING_ID,
    catalog: memoryCatalog([
      draft({
        fingerprint: `${SEO_AI_ARTICLE_APPLY_PROTECTED_FIXTURE_FINGERPRINT_PREFIX}test`,
      }),
    ]),
  });
  assert.equal(fixture.ok, false);
  const editorial = readSidhuPlanningEditorialAsUntrustedLocal(valid);
  assert.equal(editorial.neverVerified, true);
});

test("FIRST-PARTY 1-18: real verifier + forged/stale/wrong claim HOLD", async () => {
  const planning = draft();
  const post = publishedPost();
  const catalog = firstPartyCatalog(planning, post);
  const { evidenceId, fingerprint } = await verifiedSiteFactId(planning, post);
  const pack = validPackInput(evidenceId);

  // 1-2 real verifier invoked + valid synthetic published source
  const ok = await assessFirstPartySiteFactTrustLocal({
    planningDraftId: PLANNING_ID,
    packInput: pack,
    opportunityIdentity: OID,
    syntheticTest: true,
    catalog,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.verifierInvoked, true);
    assert.equal(ok.firstPartyTrust, "verifier_accepted");
    assert.equal(ok.emitFirstPartyVerifiedCategory, true);
  }

  // 3 bare verified:true
  const bare = await assessFirstPartySiteFactTrustLocal({
    planningDraftId: PLANNING_ID,
    packInput: pack,
    opportunityIdentity: OID,
    syntheticTest: true,
    catalog,
    firstPartyVerification: "verified",
  });
  assert.equal(bare.ok, false);

  // 4 client attestation rejected
  const att = await assessFirstPartySiteFactTrustLocal({
    planningDraftId: PLANNING_ID,
    packInput: pack,
    opportunityIdentity: OID,
    syntheticTest: true,
    catalog,
    attestations: [
      {
        evidenceId,
        claimNormalized: "x",
        sourceType: "published_blog",
        sourceIdentity: { blogPostId: "p" },
        contentFingerprint: fingerprint,
        outcome: "ACCEPTED",
        verifiedAt: "2026-10-06T00:00:00.000Z",
        opportunityIdentity: OID,
        issuer: "synthetic_test_harness",
      },
    ],
  });
  assert.equal(att.ok, false);

  // 5-6 Blog ID / editorial URL alone
  assert.equal(
    (
      await assessFirstPartySiteFactTrustLocal({
        planningDraftId: PLANNING_ID,
        packInput: pack,
        opportunityIdentity: OID,
        syntheticTest: true,
        catalog,
        clientVerifiedClaim: { blogPostId: "post_setup_guide" },
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await assessFirstPartySiteFactTrustLocal({
        planningDraftId: PLANNING_ID,
        packInput: pack,
        opportunityIdentity: OID,
        syntheticTest: true,
        catalog,
        clientVerifiedClaim: { url: SITE_URL },
      })
    ).ok,
    false,
  );

  // 7 source missing
  const missingSrc = await assessFirstPartySiteFactTrustLocal({
    planningDraftId: PLANNING_ID,
    packInput: pack,
    opportunityIdentity: OID,
    syntheticTest: true,
    catalog: firstPartyCatalog(planning, null),
  });
  assert.equal(missingSrc.ok, false);

  // 8 unpublished
  const unpublished = await assessFirstPartySiteFactTrustLocal({
    planningDraftId: PLANNING_ID,
    packInput: pack,
    opportunityIdentity: OID,
    syntheticTest: true,
    catalog: firstPartyCatalog(planning, publishedPost({ status: "draft" })),
  });
  assert.equal(unpublished.ok, false);

  // 9-10 source changed / fingerprint mismatch
  const changed = publishedPost({
    content: `<p>${SITE_CLAIM}</p><p>Changed body revision.</p>`,
    updatedAt: "2026-10-08T00:00:00.000Z",
  });
  const fpMismatch = await assessFirstPartySiteFactTrustLocal({
    planningDraftId: PLANNING_ID,
    packInput: pack,
    opportunityIdentity: OID,
    syntheticTest: true,
    catalog: firstPartyCatalog(planning, changed),
    expectedFingerprints: { [evidenceId]: fingerprint },
  });
  // Changed post produces different verifier evidence id OR fingerprint mismatch
  assert.equal(fpMismatch.ok, false);

  // Explicit expected fingerprint mismatch against same post
  const expectedMismatch = await assessFirstPartySiteFactTrustLocal({
    planningDraftId: PLANNING_ID,
    packInput: pack,
    opportunityIdentity: OID,
    syntheticTest: true,
    catalog,
    expectedFingerprints: { [evidenceId]: "stale_expected_fp" },
  });
  assert.equal(expectedMismatch.ok, false);

  // 11 wrong claim id in pack
  const wrongClaim = await assessFirstPartySiteFactTrustLocal({
    planningDraftId: PLANNING_ID,
    packInput: validPackInput("sf_not_from_verifier"),
    opportunityIdentity: OID,
    syntheticTest: true,
    catalog,
  });
  assert.equal(wrongClaim.ok, false);

  // 14 no catalog
  const noCat = await assessFirstPartySiteFactTrustLocal({
    planningDraftId: PLANNING_ID,
    packInput: pack,
    opportunityIdentity: OID,
    syntheticTest: true,
    catalog: null,
  });
  assert.equal(noCat.ok, false);
  if (!noCat.ok) assert.equal(noCat.firstPartyTrust, "verifier_unavailable");

  // 16 similar keyword unsupported — different claim text not in post
  const otherPlanning = draft({
    payload: {
      ...(draft().payload as Record<string, unknown>),
      editorialEvidenceV1: {
        version: "v1",
        originalContribution: "UK evening congestion checklist contribution.",
        readerBenefit: "Faster isolation of home Wi-Fi issues.",
        missingEvidenceNotes: "",
        entries: [
          {
            id: "entry_sf_bad",
            evidenceType: "PROPOSED_SITE_FACT",
            claim: "The Flix IPTV guarantees zero buffering on every UK Firestick forever.",
            url: SITE_URL,
            notes: "",
          },
        ],
      },
    },
  });
  const keywordOnly = await verifyPlanningFirstPartySiteFacts({
    planningDraftId: otherPlanning.id,
    catalog: firstPartyCatalog(otherPlanning, post),
    authorized: true,
  });
  assert.equal(keywordOnly.groundedEvidence.length, 0);

  // 18 no verified source → HOLD when pack has site_fact
  const emptyEditorial = draft({
    payload: {
      ...(draft().payload as Record<string, unknown>),
      editorialEvidenceV1: {
        version: "v1",
        originalContribution: "UK evening congestion checklist contribution.",
        readerBenefit: "Benefit text for readers here ok.",
        missingEvidenceNotes: "",
        entries: [],
      },
    },
  });
  const none = await assessFirstPartySiteFactTrustLocal({
    planningDraftId: emptyEditorial.id,
    packInput: pack,
    opportunityIdentity: OID,
    syntheticTest: true,
    catalog: firstPartyCatalog(emptyEditorial, post),
  });
  assert.equal(none.ok, false);

  void contentFingerprintForPost;
});

test("GSC + lineage + end-to-end resolve with verifier", async () => {
  const planning = draft();
  const post = publishedPost();
  const catalog = firstPartyCatalog(planning, post);
  const { evidenceId, fingerprint } = await verifiedSiteFactId(planning, post);

  assert.notEqual(
    classifyGscUkPackLinkageLocal({
      pack: gscPack(),
      requiredQuery: QUERY,
      requiredPageUrl: PAGE,
    }).category,
    "GSC_OPPORTUNITY_LINKED",
  );

  const linked = assessGscOpportunityLinkageLocal({
    provenance: gscProvenance(),
    expectedRunId: RUN_ID,
    expectedDecisionId: DECISION_ID,
    expectedOpportunityIdentity: OID,
    expectedOpportunityIndex: 0,
    packInputGscEvidence: validPackInput(evidenceId).gscEvidence,
  });
  assert.equal(linked.ok, true);

  const noSchema = await resolveAuthoritativeEvidencePackInputForPlanningLocal({
    planningDraftId: PLANNING_ID,
    planning,
    deps: {
      lineageStore: memoryLineageStore({ schemaAvailable: false }),
      ledgerDetail: ledgerDetailReader({}),
      opportunityEvidence: snapshotReader({
        packInput: validPackInput(evidenceId),
        syntheticTest: true,
        gscOpportunityProvenance: gscProvenance(),
      }),
      firstPartyCatalog: catalog,
    },
  });
  assert.equal(noSchema.ok, false);

  const good = await resolveAuthoritativeEvidencePackInputForPlanningLocal({
    planningDraftId: PLANNING_ID,
    planning,
    deps: {
      lineageStore: memoryLineageStore({}),
      ledgerDetail: ledgerDetailReader({}),
      opportunityEvidence: snapshotReader({
        packInput: validPackInput(evidenceId),
        syntheticTest: true,
        gscOpportunityProvenance: gscProvenance(),
        expectedFirstPartyFingerprints: { [evidenceId]: fingerprint },
      }),
      firstPartyCatalog: catalog,
    },
  });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.provenance, "synthetic_test");
    assert.ok(good.diagnostic.categories.includes("FIRST_PARTY_VERIFIED"));
    assert.ok(good.diagnostic.categories.includes("GSC_OPPORTUNITY_LINKED"));
    assert.ok(good.diagnostic.categories.includes("SYNTHETIC_TEST"));
    assert.equal(good.diagnostic.firstPartyTrust, "verifier_accepted");
    assert.equal(good.diagnostic.readBudgetUsed.firstPartyVerifierInvocations, 1);
  }

  const reader = createSidhuAuthoritativeEvidenceReaderLocal({
    lineageStore: memoryLineageStore({}),
    ledgerDetail: ledgerDetailReader({}),
    opportunityEvidence: snapshotReader({
      packInput: validPackInput(evidenceId),
      syntheticTest: true,
      gscOpportunityProvenance: gscProvenance(),
    }),
    firstPartyCatalog: catalog,
  });
  const readOk = await reader.readEvidencePackInputForPlanning({
    planningDraftId: PLANNING_ID,
    planning,
  });
  assert.equal(readOk.ok, true);
});
