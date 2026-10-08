/**
 * Experiment Ledger V1 (L1) — schema, mapping, and MySQL persistence primitives.
 * Provider-free. No Research Bridge wiring. No production DB.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { PoolConnection } from "mysql2/promise";
import type { SeoResearchOpportunity, SeoResearchResult } from "../lib/cms/ai-seo/research-schemas";
import type { SeoResearchDecisionPipelineEvaluation } from "../lib/cms/seo-decision-pipeline/research-bridge-types";
import {
  SEO_DECISION_PIPELINE_VERSION,
  evaluateSeoOpportunityPipelineBatch,
  createSeoDecisionPipelineContextFromData,
} from "../lib/cms/seo-decision-pipeline";
import {
  SEO_LEDGER_MAX_OPPORTUNITIES,
  mapResearchSnapshotToLedgerPlan,
} from "../lib/cms/seo-experiment-ledger";
import { insertResearchRunWithDecisions } from "../lib/cms/seo-experiment-ledger/persist-mysql";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import { decideSchemaEnsureAction } from "../lib/cms/schema-version";
import type { BlogPost } from "../lib/cms/types";

const root = path.join(__dirname, "..");

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
    whyNow: overrides.whyNow ?? "Why now evidence for UK Firestick viewers this quarter.",
    webEvidence: overrides.webEvidence ?? "Web evidence from Ofcom and Amazon help pages.",
    existingCoverage: overrides.existingCoverage ?? "NONE",
    matchedTitle: overrides.matchedTitle ?? null,
    matchedPublicUrl: overrides.matchedPublicUrl ?? null,
    recommendation: overrides.recommendation,
    restorePath: overrides.restorePath ?? "",
    suggestedAngle: overrides.suggestedAngle || "Practical UK angle.",
    nextStep: overrides.nextStep || "Review in Planning.",
    confidence: overrides.confidence || "HIGH",
    gscEvidenceRefs: overrides.gscEvidenceRefs || [],
    gscEvidence: overrides.gscEvidence || [],
    historicalSignal: overrides.historicalSignal ?? false,
  };
}

function researchOk(
  opportunities: SeoResearchOpportunity[],
  gscStatus: "AVAILABLE" | "NOT_CONFIGURED" = "AVAILABLE",
): SeoResearchResult {
  return {
    opportunities,
    sources: [{ title: "Example", url: "https://example.com/", domain: "example.com" }],
    gsc: {
      status: gscStatus,
      statusLabel: "GSC",
      helperText: "ok",
    },
  };
}

function blog(id: string, slug: string, title: string): BlogPost {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    title,
    slug,
    excerpt: "",
    content: "",
    categoryId: null,
    featuredImage: null,
    status: "published",
    featured: false,
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
    seoTitle: title,
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
}

// --- Schema ---

test("schema version bumped to 5 for Experiment Ledger tables", () => {
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 5);
  assert.match(read("lib/db/schema.ts"), /CURRENT_CMS_SCHEMA_VERSION\s*=\s*5/);
  assert.match(read("lib/db/schema.ts"), /seo_research_runs/);
  assert.match(read("lib/db/schema.ts"), /seo_opportunity_decisions/);
});

test("SQL mirror declares both Ledger tables with FK RESTRICT and unique run index", () => {
  const sql = read("db/cms-schema.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS seo_research_runs/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS seo_opportunity_decisions/);
  assert.match(sql, /UNIQUE KEY seo_opportunity_decisions_run_index \(run_id, opportunity_index\)/);
  assert.match(sql, /FOREIGN KEY \(run_id\) REFERENCES seo_research_runs\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /KEY seo_research_runs_created \(created_at\)/);
  assert.match(sql, /KEY seo_research_runs_source_created \(source, created_at\)/);
  assert.doesNotMatch(sql, /UNIQUE KEY[^\n]*opportunity_identity/);
});

test("schema.ts and cms-schema.sql Ledger DDL stay aligned", () => {
  const ts = read("lib/db/schema.ts");
  const sql = read("db/cms-schema.sql");
  for (const token of [
    "seo_research_runs",
    "seo_opportunity_decisions",
    "pipeline_run_status",
    "opportunity_identity",
    "nba_autonomous_eligible",
    "priority_automation_selectable",
    "selection_source",
    "ON DELETE RESTRICT",
  ]) {
    assert.match(ts, new RegExp(token));
    assert.match(sql, new RegExp(token));
  }
});

test("existing v4 marker triggers full ensure for v5 (upgrade path)", () => {
  const d = decideSchemaEnsureAction({ status: "found", version: 4 }, 5);
  assert.equal(d.action, "full-ensure");
  if (d.action === "full-ensure") {
    assert.equal(d.writeVersionAfterSuccess, true);
    assert.equal(d.reason, "older");
  }
});

test("ensureCmsSchema still runs CREATE TABLE IF NOT EXISTS statements list", () => {
  const migrate = read("lib/cms/mysql-migrate.ts");
  assert.match(migrate, /for \(const statement of CMS_SCHEMA_STATEMENTS\)/);
  assert.match(migrate, /ensureMissingColumns/);
});

test("pure barrel does not export server-only persist-mysql", () => {
  const index = read("lib/cms/seo-experiment-ledger/index.ts");
  assert.doesNotMatch(index, /from ["']\.\/persist-mysql["']/);
  assert.doesNotMatch(index, /from ["']@\/lib\/cms\/seo-experiment-ledger\/persist-mysql["']/);
  assert.match(index, /mapResearchSnapshotToLedgerPlan/);
  const persist = read("lib/cms/seo-experiment-ledger/persist-mysql.ts");
  assert.match(persist, /import "server-only"/);
});

// --- Mapping ---

test("successful Research + OK pipeline maps run and decisions in order", () => {
  const opp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
  });
  const batch = evaluateSeoOpportunityPipelineBatch(
    createSeoDecisionPipelineContextFromData({ posts: [] }),
    [opp],
  );
  const mapped = mapResearchSnapshotToLedgerPlan({
    source: "manual",
    actorAdminId: "adm_test",
    research: {
      ok: true,
      research: researchOk([opp]),
      decisionPipeline: {
        pipelineVersion: SEO_DECISION_PIPELINE_VERSION,
        runStatus: "OK",
        evaluations: batch.results.map((row, opportunityIndex) => ({
          opportunityIndex,
          opportunityIdentity: row.opportunityIdentity,
          evaluationStatus: row.evaluationStatus,
          pipelineFingerprint: row.pipelineFingerprint,
          opportunity: row.opportunity,
          refreshFirst: row.refreshFirst,
          nextBestAction: row.nextBestAction,
          priority: row.priority,
          resolvedTarget: row.resolvedTarget,
        })),
      },
    },
    runId: "seorun_fixed",
    createdAt: "2026-10-08T10:00:00.000Z",
    completedAt: "2026-10-08T10:00:05.000Z",
  });
  assert.equal(mapped.ok, true);
  if (!mapped.ok) return;
  assert.equal(mapped.plan.run.id, "seorun_fixed");
  assert.equal(mapped.plan.run.researchOk, true);
  assert.equal(mapped.plan.run.pipelineRunStatus, "OK");
  assert.equal(mapped.plan.run.pipelineVersion, "v1");
  assert.equal(mapped.plan.run.opportunityCount, 1);
  assert.equal(mapped.plan.run.gscStatus, "AVAILABLE");
  assert.equal(mapped.plan.run.durabilityStatus, "COMPLETE");
  assert.equal(mapped.plan.decisions.length, 1);
  const d = mapped.plan.decisions[0];
  assert.equal(d.opportunityIndex, 0);
  assert.equal(d.researchRecommendation, "NEW_BLOG");
  assert.equal(d.evaluationStatus, "OK");
  assert.equal(d.rfVerdict, "PASS_NEW_CONTENT");
  assert.equal(d.nbaAction, "NEW_BLOG");
  assert.equal(d.nbaAutonomousEligible, true);
  assert.equal(d.priorityAutomationSelectable, true);
  assert.ok(d.priorityScore != null && d.priorityScore >= 0 && d.priorityScore <= 100);
  assert.equal(d.selected, false);
  assert.equal(d.selectionSource, "none");
  assert.ok(d.opportunityIdentity);
  assert.ok(d.rfFingerprint);
  assert.ok(d.nbaFingerprint);
  assert.ok(d.priorityFingerprint);
  assert.ok(d.pipelineFingerprint);
});

test("zero opportunities OK pipeline yields run with empty decisions", () => {
  const mapped = mapResearchSnapshotToLedgerPlan({
    research: {
      ok: true,
      research: researchOk([]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: [],
      },
    },
  });
  assert.equal(mapped.ok, true);
  if (!mapped.ok) return;
  assert.equal(mapped.plan.run.opportunityCount, 0);
  assert.equal(mapped.plan.decisions.length, 0);
});

test("five opportunities accepted; six rejected", () => {
  const opps = Array.from({ length: 5 }, (_, i) =>
    opportunity({
      topic: `Topic ${i} unique firestick angle`,
      workingTitle: `Working Title ${i} Unique Firestick`,
      recommendation: "SKIP",
      confidence: "LOW",
      whyNow: "n/a",
      webEvidence: "n/a",
    }),
  );
  const batch = evaluateSeoOpportunityPipelineBatch(
    createSeoDecisionPipelineContextFromData({ posts: [] }),
    opps,
  );
  const ok = mapResearchSnapshotToLedgerPlan({
    research: {
      ok: true,
      research: researchOk(opps),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: batch.results.map((row, opportunityIndex) => ({
          opportunityIndex,
          opportunityIdentity: row.opportunityIdentity,
          evaluationStatus: row.evaluationStatus,
          pipelineFingerprint: row.pipelineFingerprint,
          opportunity: row.opportunity,
          refreshFirst: row.refreshFirst,
          nextBestAction: row.nextBestAction,
          priority: row.priority,
          resolvedTarget: row.resolvedTarget,
        })),
      },
    },
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.plan.decisions.length, 5);

  const six = Array.from({ length: 6 }, (_, i) =>
    opportunity({
      topic: `Overflow ${i}`,
      workingTitle: `Overflow Title ${i}`,
      recommendation: "SKIP",
      confidence: "LOW",
      whyNow: "n/a",
      webEvidence: "n/a",
    }),
  );
  const tooMany = mapResearchSnapshotToLedgerPlan({
    research: { ok: true, research: researchOk(six), decisionPipeline: null },
  });
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) assert.equal(tooMany.errorCode, "too_many_opportunities");
  assert.equal(SEO_LEDGER_MAX_OPPORTUNITIES, 5);
});

test("REFRESH_EXISTING maps target and non-autonomous Priority", () => {
  const opp = opportunity({
    topic: "Diagnosing buffering on Fire TV",
    workingTitle: "Fire TV buffering Wi-Fi checklist",
    recommendation: "REFRESH_EXISTING",
    existingCoverage: "PARTIAL",
    matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
  });
  const batch = evaluateSeoOpportunityPipelineBatch(
    createSeoDecisionPipelineContextFromData({
      posts: [
        blog("post-firestick", "how-to-watch-iptv-on-firestick", "How to Watch IPTV on Firestick"),
      ],
    }),
    [opp],
  );
  const mapped = mapResearchSnapshotToLedgerPlan({
    research: {
      ok: true,
      research: researchOk([opp]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: batch.results.map((row, opportunityIndex) => ({
          opportunityIndex,
          opportunityIdentity: row.opportunityIdentity,
          evaluationStatus: row.evaluationStatus,
          pipelineFingerprint: row.pipelineFingerprint,
          opportunity: row.opportunity,
          refreshFirst: row.refreshFirst,
          nextBestAction: row.nextBestAction,
          priority: row.priority,
          resolvedTarget: row.resolvedTarget,
        })),
      },
    },
  });
  assert.equal(mapped.ok, true);
  if (!mapped.ok) return;
  const d = mapped.plan.decisions[0];
  assert.equal(d.rfVerdict, "REFRESH_EXISTING");
  assert.equal(d.nbaAction, "REFRESH_EXISTING");
  assert.equal(d.nbaAutonomousEligible, false);
  assert.equal(d.priorityAutomationSelectable, false);
  assert.equal(d.targetPostId, "post-firestick");
});

test("Research failure maps SKIPPED pipeline and zero decisions", () => {
  const mapped = mapResearchSnapshotToLedgerPlan({
    research: { ok: false, error: "Rate limited", code: "rate_limited" },
  });
  assert.equal(mapped.ok, true);
  if (!mapped.ok) return;
  assert.equal(mapped.plan.run.researchOk, false);
  assert.equal(mapped.plan.run.researchErrorCode, "rate_limited");
  assert.equal(mapped.plan.run.pipelineRunStatus, "SKIPPED");
  assert.equal(mapped.plan.decisions.length, 0);
});

test("CONTEXT_ERROR preserves Research count and does not fabricate evaluations", () => {
  const opp = opportunity({
    topic: "Context error topic",
    workingTitle: "Context error title",
    recommendation: "NEW_BLOG",
  });
  const mapped = mapResearchSnapshotToLedgerPlan({
    research: {
      ok: true,
      research: researchOk([opp]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "CONTEXT_ERROR",
        evaluations: [],
        errorCode: "pipeline_context_error",
        errorMessage: "Decision pipeline context failed.",
      },
    },
  });
  assert.equal(mapped.ok, true);
  if (!mapped.ok) return;
  assert.equal(mapped.plan.run.researchOk, true);
  assert.equal(mapped.plan.run.pipelineRunStatus, "CONTEXT_ERROR");
  assert.equal(mapped.plan.run.pipelineErrorCode, "pipeline_context_error");
  assert.equal(mapped.plan.run.opportunityCount, 1);
  assert.equal(mapped.plan.decisions.length, 0);
});

test("VALIDATION_ERROR row persists without inventing Priority", () => {
  const evaluation: SeoResearchDecisionPipelineEvaluation = {
    opportunityIndex: 0,
    opportunityIdentity: "a".repeat(64),
    evaluationStatus: "VALIDATION_ERROR",
    pipelineFingerprint: "",
    opportunity: {
      topic: "Bad",
      workingTitle: "",
      recommendation: "NEW_BLOG",
    },
    refreshFirst: null,
    nextBestAction: null,
    priority: null,
    resolvedTarget: null,
    errorCode: "empty_working_title",
  };
  const mapped = mapResearchSnapshotToLedgerPlan({
    research: {
      ok: true,
      research: researchOk([
        opportunity({
          topic: "Bad",
          workingTitle: "Placeholder Title For Research Row",
          recommendation: "NEW_BLOG",
        }),
      ]),
      decisionPipeline: {
        pipelineVersion: "v1",
        runStatus: "OK",
        evaluations: [evaluation],
      },
    },
  });
  assert.equal(mapped.ok, true);
  if (!mapped.ok) return;
  const d = mapped.plan.decisions[0];
  assert.equal(d.evaluationStatus, "VALIDATION_ERROR");
  assert.equal(d.rfVerdict, null);
  assert.equal(d.nbaAction, null);
  assert.equal(d.priorityScore, null);
});

test("invalid Priority score rejected", () => {
  const evaluation: SeoResearchDecisionPipelineEvaluation = {
    opportunityIndex: 0,
    opportunityIdentity: "b".repeat(64),
    evaluationStatus: "OK",
    pipelineFingerprint: "c".repeat(64),
    opportunity: {
      topic: "Score",
      workingTitle: "Score Title",
      recommendation: "SKIP",
    },
    refreshFirst: {
      verdict: "UNKNOWN",
      confidence: "LOW",
      reason: "x",
      evidence: {
        existingCoverage: "NONE",
        exactUrlMatch: false,
        exactSlugMatch: false,
        exactPostMatch: false,
        canonicalMatch: false,
        duplicate: false,
        cannibalizationRisk: false,
        gscOwnership: false,
        draftReservation: false,
        planningReservation: false,
        historicalPath: null,
        materialEvidence: false,
        corpusComplete: true,
        candidateCount: 0,
      },
      fingerprint: "d".repeat(64),
    },
    nextBestAction: {
      decisionFingerprint: "e".repeat(64),
      action: "DO_NOTHING",
      status: "HOLD",
      holdReason: "INSUFFICIENT_EVIDENCE",
      confidence: "LOW",
      autonomousEligible: false,
      target: { kind: "none" },
      topic: "Score",
      reason: "hold",
      evidence: {
        refreshFirstVerdict: "UNKNOWN",
        existingCoverage: "NONE",
        matchedPostId: null,
        matchedUrl: null,
        historicalPath: null,
        duplicate: false,
        cannibalizationRisk: false,
        gscPresent: false,
        webEvidencePresent: false,
        corpusEvidencePresent: false,
      },
      blockers: [],
      warnings: [],
      alternatives: [],
      actionFingerprint: "f".repeat(64),
      historicalDisposition: null,
    },
    priority: {
      score: 101,
      tier: "HIGH",
      scoreVersion: "v1",
      components: [],
      reason: "bad",
      warnings: [],
      effort: "LOW",
      evidenceCompleteness: "MINIMAL",
      missingInputs: [],
      automationSelectable: false,
      priorityFingerprint: "g".repeat(64),
      action: "DO_NOTHING",
      decisionFingerprint: "e".repeat(64),
      refreshFingerprint: "d".repeat(64),
    },
    resolvedTarget: null,
  };
  const mapped = mapResearchSnapshotToLedgerPlan({
    research: {
      ok: true,
      research: researchOk([
        opportunity({
          topic: "Score",
          workingTitle: "Score Title",
          recommendation: "SKIP",
          confidence: "LOW",
          whyNow: "n/a",
          webEvidence: "n/a",
        }),
      ]),
      decisionPipeline: { pipelineVersion: "v1", runStatus: "OK", evaluations: [evaluation] },
    },
  });
  assert.equal(mapped.ok, false);
  if (!mapped.ok) assert.equal(mapped.errorCode, "invalid_priority_score");
});

test("mismatched automationSelectable rejected", () => {
  const evaluation: SeoResearchDecisionPipelineEvaluation = {
    opportunityIndex: 0,
    opportunityIdentity: "h".repeat(64),
    evaluationStatus: "OK",
    pipelineFingerprint: "i".repeat(64),
    opportunity: {
      topic: "Mismatch",
      workingTitle: "Mismatch Title",
      recommendation: "NEW_BLOG",
    },
    refreshFirst: {
      verdict: "PASS_NEW_CONTENT",
      confidence: "HIGH",
      reason: "pass",
      evidence: {
        existingCoverage: "NONE",
        exactUrlMatch: false,
        exactSlugMatch: false,
        exactPostMatch: false,
        canonicalMatch: false,
        duplicate: false,
        cannibalizationRisk: false,
        gscOwnership: false,
        draftReservation: false,
        planningReservation: false,
        historicalPath: null,
        materialEvidence: true,
        corpusComplete: true,
        candidateCount: 0,
      },
      fingerprint: "j".repeat(64),
    },
    nextBestAction: {
      decisionFingerprint: "k".repeat(64),
      action: "NEW_BLOG",
      status: "ACTIONABLE",
      holdReason: null,
      confidence: "HIGH",
      autonomousEligible: true,
      target: { kind: "new_topic", topic: "Mismatch" },
      topic: "Mismatch",
      reason: "new",
      evidence: {
        refreshFirstVerdict: "PASS_NEW_CONTENT",
        existingCoverage: "NONE",
        matchedPostId: null,
        matchedUrl: null,
        historicalPath: null,
        duplicate: false,
        cannibalizationRisk: false,
        gscPresent: false,
        webEvidencePresent: true,
        corpusEvidencePresent: true,
      },
      blockers: [],
      warnings: [],
      alternatives: [],
      actionFingerprint: "l".repeat(64),
      historicalDisposition: null,
    },
    priority: {
      score: 80,
      tier: "HIGH",
      scoreVersion: "v1",
      components: [],
      reason: "high",
      warnings: [],
      effort: "MEDIUM",
      evidenceCompleteness: "PARTIAL",
      missingInputs: [],
      automationSelectable: false, // inconsistent with NEW_BLOG + eligible
      priorityFingerprint: "m".repeat(64),
      action: "NEW_BLOG",
      decisionFingerprint: "k".repeat(64),
      refreshFingerprint: "j".repeat(64),
    },
    resolvedTarget: null,
  };
  const mapped = mapResearchSnapshotToLedgerPlan({
    research: {
      ok: true,
      research: researchOk([
        opportunity({
          topic: "Mismatch",
          workingTitle: "Mismatch Title",
          recommendation: "NEW_BLOG",
        }),
      ]),
      decisionPipeline: { pipelineVersion: "v1", runStatus: "OK", evaluations: [evaluation] },
    },
  });
  assert.equal(mapped.ok, false);
  if (!mapped.ok) assert.equal(mapped.errorCode, "automation_selectable_mismatch");
});

test("bounded topic truncation and sanitized research error codes", () => {
  const longTopic = "T".repeat(400);
  const evaluation: SeoResearchDecisionPipelineEvaluation = {
    opportunityIndex: 0,
    opportunityIdentity: "n".repeat(64),
    evaluationStatus: "INTERNAL_ERROR",
    pipelineFingerprint: "o".repeat(64),
    opportunity: {
      topic: longTopic,
      workingTitle: "W".repeat(300),
      recommendation: "SKIP",
    },
    refreshFirst: null,
    nextBestAction: null,
    priority: null,
    resolvedTarget: null,
  };
  const mapped = mapResearchSnapshotToLedgerPlan({
    research: {
      ok: true,
      research: researchOk([
        opportunity({
          topic: longTopic,
          workingTitle: "W".repeat(300),
          recommendation: "SKIP",
          confidence: "LOW",
          whyNow: "n/a",
          webEvidence: "n/a",
        }),
      ]),
      decisionPipeline: { pipelineVersion: "v1", runStatus: "OK", evaluations: [evaluation] },
    },
  });
  assert.equal(mapped.ok, true);
  if (!mapped.ok) return;
  assert.equal(mapped.plan.decisions[0].topic.length, 160);
  assert.equal(mapped.plan.decisions[0].workingTitle.length, 180);

  const fail = mapResearchSnapshotToLedgerPlan({
    research: {
      ok: false,
      error: "x",
      code: "rate_limited; password=secret api_key=sk-test",
    },
  });
  assert.equal(fail.ok, true);
  if (!fail.ok) return;
  assert.equal(fail.plan.run.researchErrorCode, "rate_limited__password_secret_api_key_sk-test");
  assert.doesNotMatch(fail.plan.run.researchErrorCode || "", /=/);
});

test("same opportunity identity across two runs produces distinct decision ids", () => {
  const opp = opportunity({
    topic: "Stable topic firestick apps",
    workingTitle: "Stable working title firestick apps",
    recommendation: "NEW_BLOG",
  });
  const batch = evaluateSeoOpportunityPipelineBatch(
    createSeoDecisionPipelineContextFromData({ posts: [] }),
    [opp],
  );
  const evaluations = batch.results.map((row, opportunityIndex) => ({
    opportunityIndex,
    opportunityIdentity: row.opportunityIdentity,
    evaluationStatus: row.evaluationStatus,
    pipelineFingerprint: row.pipelineFingerprint,
    opportunity: row.opportunity,
    refreshFirst: row.refreshFirst,
    nextBestAction: row.nextBestAction,
    priority: row.priority,
    resolvedTarget: row.resolvedTarget,
  }));
  let n = 0;
  const planA = mapResearchSnapshotToLedgerPlan(
    {
      runId: "seorun_a",
      research: {
        ok: true,
        research: researchOk([opp]),
        decisionPipeline: { pipelineVersion: "v1", runStatus: "OK", evaluations },
      },
    },
    {
      createDecisionId: () => `seodec_a_${n++}`,
    },
  );
  n = 0;
  const planB = mapResearchSnapshotToLedgerPlan(
    {
      runId: "seorun_b",
      research: {
        ok: true,
        research: researchOk([opp]),
        decisionPipeline: { pipelineVersion: "v1", runStatus: "OK", evaluations },
      },
    },
    {
      createDecisionId: () => `seodec_b_${n++}`,
    },
  );
  assert.equal(planA.ok && planB.ok, true);
  if (!planA.ok || !planB.ok) return;
  assert.equal(planA.plan.decisions[0].opportunityIdentity, planB.plan.decisions[0].opportunityIdentity);
  assert.notEqual(planA.plan.decisions[0].id, planB.plan.decisions[0].id);
  assert.notEqual(planA.plan.run.id, planB.plan.run.id);
});

// --- Persistence (mocked transaction; no production MySQL) ---

test("unavailable DB returns UNAVAILABLE without writing", async () => {
  let txCalls = 0;
  const result = await insertResearchRunWithDecisions(
    { research: { ok: false, error: "x", code: "empty" } },
    {
      isDatabaseConfigured: () => false,
      withTransaction: async (work) => {
        txCalls += 1;
        return work({} as PoolConnection);
      },
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(result.errorCode, "mysql_unavailable");
  assert.equal(txCalls, 0);
});

test("atomic insert: decision failure rolls back (no orphan run)", async () => {
  const executed: string[] = [];
  const result = await insertResearchRunWithDecisions(
    {
      runId: "seorun_tx",
      research: {
        ok: true,
        research: researchOk([
          opportunity({
            topic: "Tx topic firestick",
            workingTitle: "Tx working title firestick",
            recommendation: "NEW_BLOG",
          }),
        ]),
        decisionPipeline: {
          pipelineVersion: "v1",
          runStatus: "OK",
          evaluations: [
            {
              opportunityIndex: 0,
              opportunityIdentity: "p".repeat(64),
              evaluationStatus: "OK",
              pipelineFingerprint: "q".repeat(64),
              opportunity: {
                topic: "Tx topic firestick",
                workingTitle: "Tx working title firestick",
                recommendation: "NEW_BLOG",
              },
              refreshFirst: {
                verdict: "PASS_NEW_CONTENT",
                confidence: "HIGH",
                reason: "pass",
                evidence: {
                  existingCoverage: "NONE",
                  exactUrlMatch: false,
                  exactSlugMatch: false,
                  exactPostMatch: false,
                  canonicalMatch: false,
                  duplicate: false,
                  cannibalizationRisk: false,
                  gscOwnership: false,
                  draftReservation: false,
                  planningReservation: false,
                  historicalPath: null,
                  materialEvidence: true,
                  corpusComplete: true,
                  candidateCount: 0,
                },
                fingerprint: "r".repeat(64),
              },
              nextBestAction: {
                decisionFingerprint: "s".repeat(64),
                action: "NEW_BLOG",
                status: "ACTIONABLE",
                holdReason: null,
                confidence: "HIGH",
                autonomousEligible: true,
                target: { kind: "new_topic", topic: "Tx topic firestick" },
                topic: "Tx topic firestick",
                reason: "new",
                evidence: {
                  refreshFirstVerdict: "PASS_NEW_CONTENT",
                  existingCoverage: "NONE",
                  matchedPostId: null,
                  matchedUrl: null,
                  historicalPath: null,
                  duplicate: false,
                  cannibalizationRisk: false,
                  gscPresent: false,
                  webEvidencePresent: true,
                  corpusEvidencePresent: true,
                },
                blockers: [],
                warnings: [],
                alternatives: [],
                actionFingerprint: "t".repeat(64),
                historicalDisposition: null,
              },
              priority: {
                score: 70,
                tier: "HIGH",
                scoreVersion: "v1",
                components: [],
                reason: "ok",
                warnings: [],
                effort: "MEDIUM",
                evidenceCompleteness: "PARTIAL",
                missingInputs: [],
                automationSelectable: true,
                priorityFingerprint: "u".repeat(64),
                action: "NEW_BLOG",
                decisionFingerprint: "s".repeat(64),
                refreshFingerprint: "r".repeat(64),
              },
              resolvedTarget: null,
            },
          ],
        },
      },
    },
    {
      isDatabaseConfigured: () => true,
      withTransaction: async <T>(work: (conn: PoolConnection) => Promise<T>): Promise<T> => {
        const conn = {
          execute: async (sql: string) => {
            executed.push(sql);
            if (/seo_opportunity_decisions/i.test(sql)) {
              throw new Error("simulated decision insert failure");
            }
            return [{ affectedRows: 1 }, undefined];
          },
        } as unknown as PoolConnection;
        try {
          return await work(conn);
        } catch (error) {
          // Mimic withTransaction rollback semantics for the test harness.
          executed.push("ROLLBACK");
          throw error;
        }
      },
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, "WRITE_ERROR");
  assert.equal(result.errorCode, "ledger_write_error");
  assert.doesNotMatch(result.errorMessage, /simulated|password|stack/i);
  assert.ok(executed.some((s) => /seo_research_runs/i.test(s)));
  assert.ok(executed.includes("ROLLBACK"));
});

test("successful mocked TX inserts run then decisions once", async () => {
  const sqls: string[] = [];
  const result = await insertResearchRunWithDecisions(
    {
      research: { ok: false, error: "empty", code: "empty" },
      runId: "seorun_ok",
    },
    {
      isDatabaseConfigured: () => true,
      withTransaction: async (work) => {
        const conn = {
          execute: async (sql: string) => {
            sqls.push(sql);
            return [{ affectedRows: 1 }, undefined];
          },
        } as unknown as PoolConnection;
        return work(conn);
      },
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, "PERSISTED");
  assert.equal(result.runId, "seorun_ok");
  assert.equal(result.decisionCount, 0);
  assert.equal(sqls.filter((s) => /INSERT INTO seo_research_runs/i.test(s)).length, 1);
  assert.equal(sqls.filter((s) => /seo_opportunity_decisions/i.test(s)).length, 0);
});

test("persist module has no provider / Planning / Blog write imports", () => {
  const persist = read("lib/cms/seo-experiment-ledger/persist-mysql.ts");
  const map = read("lib/cms/seo-experiment-ledger/map.ts");
  assert.doesNotMatch(persist, /openai|gemini|buildUkGscEvidencePack|listPosts|listSeoPlanning|savePost|saveSeoPlanning/i);
  assert.doesNotMatch(map, /openai|gemini|buildUkGscEvidencePack|listPosts/i);
  assert.doesNotMatch(read("lib/cms/ai-seo-actions.ts"), /seo-experiment-ledger|insertResearchRunWithDecisions/);
  assert.doesNotMatch(read("lib/cms/seo-decision-pipeline/research-bridge.ts"), /seo-experiment-ledger/);
});
