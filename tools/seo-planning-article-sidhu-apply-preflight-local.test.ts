/**
 * A2-7 — Sidhu Apply preflight offline security + integration tests.
 * Injected session/catalog/evidence only. No Blog/Planning/durable writes.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { SeoResearchOpportunity } from "../lib/cms/ai-seo/research-schemas";
import type { CurrentAdmin } from "../lib/auth/session";
import type { Permission } from "../lib/auth/permissions";
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
  createSyntheticSidhuEvidenceReader,
  createUnavailableSidhuEvidenceReader,
  type SidhuAuthoritativePlanningCatalog,
  type SidhuTrustedEvidenceSourceReader,
} from "../lib/cms/seo-planning/article-sidhu-authoritative-sources-local";
import {
  evaluateSidhuArticleApplyPreflightLocal,
  SEO_AI_ARTICLE_SIDHU_PREFLIGHT_SPEC,
  type SidhuApplyPreflightDeps,
} from "../lib/cms/seo-planning/article-sidhu-apply-preflight-local";
import type { BlogPost, SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function fileExists(rel: string) {
  return existsSync(path.join(root, rel));
}

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

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_a2_7_preflight",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:a2-7-preflight",
    topic: "UK IPTV buffering checklist",
    workingTitle: "Fix UK IPTV buffering without guesswork",
    proposedSlug: "uk-iptv-buffering-a2-7-preflight",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "TROUBLESHOOTING",
    linkedPostId: null,
    createdBy: "admin_super_1",
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
        entries: [],
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

function memoryCatalog(
  drafts: SeoPlanningDraft[],
  posts: BlogPost[] = [],
): SidhuAuthoritativePlanningCatalog & { writes: number } {
  const state = { writes: 0 };
  return {
    get writes() {
      return state.writes;
    },
    async getSeoPlanningDraftById(id) {
      return drafts.find((d) => d.id === id) || null;
    },
    async getPostById(id) {
      return posts.find((p) => p.id === id) || null;
    },
  };
}

function syntheticPackInput(recommendation: SeoResearchOpportunity["recommendation"] = "NEW_BLOG") {
  const ctx = createSeoDecisionPipelineContextFromData({
    posts: [],
    planningDrafts: [],
    runId: "a2-7-preflight",
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
    recommendation,
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

function deps(args: {
  session: CurrentAdmin | null;
  catalog: SidhuAuthoritativePlanningCatalog;
  evidenceReader?: SidhuTrustedEvidenceSourceReader;
  writeFreezeEnv?: Record<string, string | undefined>;
}): SidhuApplyPreflightDeps {
  return {
    resolveSession: async () => args.session,
    catalog: args.catalog,
    evidenceReader: args.evidenceReader || createSyntheticSidhuEvidenceReader(syntheticPackInput()),
    writeFreezeEnv: args.writeFreezeEnv,
  };
}

function approvalFor(adminId: string) {
  return {
    factualReviewConfirmed: true as const,
    approvedByAdminId: adminId,
  };
}

test("AUTH: no / inactive / expired / non-super-admin / missing SEO or Blog", async () => {
  const planning = draft();
  const catalog = memoryCatalog([planning]);
  const preview = previewFor(planning);

  const none = await evaluateSidhuArticleApplyPreflightLocal(
    { planningDraftId: planning.id, clientPreview: preview },
    deps({ session: null, catalog }),
  );
  assert.equal(none.ok, false);
  if (!none.ok) assert.equal(none.code, "unauthorized");

  const inactive = await evaluateSidhuArticleApplyPreflightLocal(
    { planningDraftId: planning.id, clientPreview: preview },
    deps({ session: session({ active: false }), catalog }),
  );
  assert.equal(inactive.ok, false);
  if (!inactive.ok) assert.equal(inactive.code, "unauthorized");

  const expired = await evaluateSidhuArticleApplyPreflightLocal(
    { planningDraftId: planning.id, clientPreview: preview },
    deps({ session: session({ expiresAt: Date.now() - 1000 }), catalog }),
  );
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.code, "unauthorized");

  const fullAccess = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      serverHumanApproval: approvalFor("admin_full_1"),
    },
    deps({
      session: session({
        id: "admin_full_1",
        role: "full_access",
        permissions: ["seo", "blog"],
        effectivePermissions: ["seo", "blog"],
      }),
      catalog,
    }),
  );
  assert.equal(fullAccess.ok, false);
  if (!fullAccess.ok) assert.equal(fullAccess.code, "access_denied");

  // Super-admin always has seo+blog via adminHasPermission — forge custom role with one missing.
  const noSeo = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      serverHumanApproval: approvalFor("admin_custom_1"),
    },
    deps({
      session: session({
        id: "admin_custom_1",
        role: "custom",
        permissions: ["blog"],
        effectivePermissions: ["blog"],
      }),
      catalog,
    }),
  );
  assert.equal(noSeo.ok, false);
  if (!noSeo.ok) assert.equal(noSeo.code, "access_denied");

  const noBlog = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      serverHumanApproval: approvalFor("admin_custom_2"),
    },
    deps({
      session: session({
        id: "admin_custom_2",
        role: "custom",
        permissions: ["seo"],
        effectivePermissions: ["seo"],
      }),
      catalog,
    }),
  );
  assert.equal(noBlog.ok, false);
  if (!noBlog.ok) assert.equal(noBlog.code, "access_denied");
});

test("AUTH: forged client actor / permissions cannot override server session", async () => {
  const planning = draft();
  const catalog = memoryCatalog([planning]);
  const preview = previewFor(planning);
  const admin = session();

  const forgedRole = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      clientClaimedActor: { role: "super_admin", adminId: "impostor" },
      serverHumanApproval: approvalFor(admin.id),
    },
    deps({ session: admin, catalog }),
  );
  assert.equal(forgedRole.ok, false);
  if (!forgedRole.ok) assert.equal(forgedRole.code, "unauthorized");

  const forgedPerms = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      clientClaimedActor: { permissions: ["seo", "blog"], isAdmin: true },
      serverHumanApproval: approvalFor(admin.id),
    },
    deps({ session: admin, catalog }),
  );
  assert.equal(forgedPerms.ok, false);
  if (!forgedPerms.ok) assert.equal(forgedPerms.code, "unauthorized");
});

test("PLANNING: missing / archived / fixture / REFRESH / stale snapshot", async () => {
  const admin = session();
  const archived = draft({
    id: "seoplan_arch",
    archivedAt: "2026-10-07T00:00:00.000Z",
  });
  const fixture = draft({
    id: "seoplan_fix",
    fingerprint: "TEST_FIXTURE:seo_editorial_evidence_acceptance:v1",
  });
  const refresh = draft({
    id: "seoplan_refresh",
    recommendation: "REFRESH_EXISTING",
    fingerprint: "REFRESH_EXISTING:a2-7",
  });
  const eligible = draft();
  const catalog = memoryCatalog([archived, fixture, refresh, eligible]);

  const missing = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: "seoplan_missing",
      clientPreview: previewFor(eligible),
      serverHumanApproval: approvalFor(admin.id),
    },
    deps({ session: admin, catalog }),
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "planning_not_found");

  const arch = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: archived.id,
      serverHumanApproval: approvalFor(admin.id),
    },
    deps({ session: admin, catalog }),
  );
  assert.equal(arch.ok, false);
  if (!arch.ok) assert.equal(arch.code, "planning_archived");

  const fix = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: fixture.id,
      serverHumanApproval: approvalFor(admin.id),
    },
    deps({ session: admin, catalog }),
  );
  assert.equal(fix.ok, false);
  if (!fix.ok) assert.equal(fix.code, "protected_fixture");

  const refreshBlocked = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: refresh.id,
      clientPreview: {
        ...previewFor(eligible),
        planningDraftId: refresh.id,
        planningUpdatedAt: refresh.updatedAt,
        recommendation: "NEW_BLOG",
      },
      serverHumanApproval: approvalFor(admin.id),
    },
    deps({ session: admin, catalog }),
  );
  assert.equal(refreshBlocked.ok, false);
  if (!refreshBlocked.ok) {
    assert.ok(
      refreshBlocked.code === "refresh_target_blocked" ||
        refreshBlocked.code === "unsupported_recommendation" ||
        refreshBlocked.code === "ineligible" ||
        refreshBlocked.code === "approval_required" ||
        refreshBlocked.code === "unsafe_html" ||
        refreshBlocked.code === "preview_draft_mismatch" ||
        refreshBlocked.code === "invalid_preview",
      refreshBlocked.code,
    );
  }

  const stale = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: eligible.id,
      clientPreview: previewFor(eligible),
      expectedPlanningUpdatedAt: "2026-10-09T00:00:00.000Z",
      serverHumanApproval: approvalFor(admin.id),
    },
    deps({ session: admin, catalog }),
  );
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "planning_stale");
});

test("EVIDENCE: unavailable / HOLD / READY without approval / genuine READY with approval", async () => {
  const admin = session();
  const planning = draft();
  const catalog = memoryCatalog([planning]);
  const preview = previewFor(planning);

  const unavailable = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      serverHumanApproval: approvalFor(admin.id),
    },
    deps({
      session: admin,
      catalog,
      evidenceReader: createUnavailableSidhuEvidenceReader(),
    }),
  );
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.code, "evidence_unavailable");

  const hold = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      serverHumanApproval: approvalFor(admin.id),
    },
    deps({
      session: admin,
      catalog,
      evidenceReader: createSyntheticSidhuEvidenceReader(syntheticPackInput("REFRESH_EXISTING")),
    }),
  );
  assert.equal(hold.ok, false);
  if (!hold.ok) assert.equal(hold.code, "evidence_pack_hold");

  const noApproval = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
    },
    deps({ session: admin, catalog }),
  );
  assert.equal(noApproval.ok, false);
  if (!noApproval.ok) assert.equal(noApproval.code, "approval_required");

  const ready = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      expectedPlanningUpdatedAt: planning.updatedAt,
      serverHumanApproval: approvalFor(admin.id),
    },
    deps({ session: admin, catalog }),
  );
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  assert.equal(ready.spec, SEO_AI_ARTICLE_SIDHU_PREFLIGHT_SPEC);
  assert.equal(ready.executionAuthorized, false);
  assert.equal(ready.productionWiringEnabled, false);
  assert.equal(ready.blogMutationPerformed, false);
  assert.equal(ready.planningMutationPerformed, false);
  assert.equal(ready.durableApplyInvoked, false);
  assert.equal(ready.evidenceProvenance, "synthetic_test");
  assert.equal(ready.trustedEvidencePack.authorizeApply, false);
  assert.equal(ready.readiness.ok, true);
});

test("EXECUTION: write-freeze / feature_disabled / no Apply wiring in sources", async () => {
  const admin = session();
  const planning = draft();
  const catalog = memoryCatalog([planning]);
  const preview = previewFor(planning);

  const frozen = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      serverHumanApproval: approvalFor(admin.id),
    },
    deps({
      session: admin,
      catalog,
      writeFreezeEnv: { CMS_WRITE_FREEZE: "1" },
    }),
  );
  assert.equal(frozen.ok, false);
  if (!frozen.ok) assert.equal(frozen.code, "cms_write_freeze");

  const execReq = await evaluateSidhuArticleApplyPreflightLocal(
    {
      planningDraftId: planning.id,
      clientPreview: preview,
      serverHumanApproval: approvalFor(admin.id),
      requestExecutionAuthorization: true,
    },
    deps({ session: admin, catalog }),
  );
  assert.equal(execReq.ok, false);
  if (!execReq.ok) assert.equal(execReq.code, "feature_disabled");

  assert.equal(SEO_AI_ARTICLE_APPLY_PRODUCTION_WIRING_ENABLED, false);

  assert.equal(fileExists("lib/cms/seo-planning/article-sidhu-apply-preflight-local.ts"), true);
  assert.equal(fileExists("lib/cms/seo-planning/article-sidhu-authoritative-sources-local.ts"), true);

  const preflight = read("lib/cms/seo-planning/article-sidhu-apply-preflight-local.ts");
  assert.doesNotMatch(preflight, /applyPrivateArticleViaCmsAdapter/);
  assert.doesNotMatch(preflight, /applyPrivateNewBlogArticleLocal/);
  assert.doesNotMatch(preflight, /createInactiveMysqlCmsApplyDeps/);
  assert.match(preflight, /executionAuthorized: false/);
  assert.match(preflight, /prepareArticleApplyReadiness/);
  assert.match(preflight, /adminHasPermission/);

  const actions = read("lib/cms/seo-planning-actions.ts");
  assert.doesNotMatch(actions, /evaluateSidhuArticleApplyPreflightLocal/);
  assert.doesNotMatch(actions, /article-sidhu-apply-preflight-local/);

  const ui = read("components/sidhu/SeoPlanningArticleGeneration.tsx");
  assert.doesNotMatch(ui, /evaluateSidhuArticleApplyPreflightLocal/);
});
