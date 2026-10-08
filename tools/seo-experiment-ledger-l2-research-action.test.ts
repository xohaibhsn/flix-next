/**
 * Experiment Ledger L2 — Research action ↔ Ledger durability composition.
 * Provider-free. Mocked Research Bridge + mocked/real-L1 persist path.
 * Does not call OpenAI, Gemini, GSC, or production MySQL.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { PoolConnection } from "mysql2/promise";
import type {
  ResearchUkOpportunitiesFailure,
  ResearchUkOpportunitiesSuccess,
} from "../lib/cms/ai-seo/research";
import type { SeoResearchOpportunity, SeoResearchResult } from "../lib/cms/ai-seo/research-schemas";
import {
  SEO_DECISION_PIPELINE_VERSION,
  createSeoDecisionPipelineContextFromData,
  evaluateSeoOpportunityPipelineBatch,
} from "../lib/cms/seo-decision-pipeline";
import type {
  ResearchUkOpportunitiesWithPipelineResult,
  SeoResearchDecisionPipelineAttachment,
} from "../lib/cms/seo-decision-pipeline/research-bridge-types";
import {
  attachLedgerDurabilityToResearchResult,
  bridgeResultToLedgerSnapshot,
  durabilityMetaFromPersistResult,
  runResearchBridgeThenPersistLedger,
} from "../lib/cms/seo-experiment-ledger/attach-research-durability";
import { insertResearchRunWithDecisions } from "../lib/cms/seo-experiment-ledger/persist-mysql";
import type {
  InsertResearchRunWithDecisionsResult,
  SeoLedgerMapInput,
} from "../lib/cms/seo-experiment-ledger/types";
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

function researchPayload(opportunities: SeoResearchOpportunity[]): SeoResearchResult {
  return {
    opportunities,
    sources: [{ title: "Example", url: "https://example.com/", domain: "example.com" }],
    gsc: {
      status: "AVAILABLE",
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

function okPipelineAttachment(
  opportunities: SeoResearchOpportunity[],
  posts: BlogPost[] = [],
): SeoResearchDecisionPipelineAttachment {
  const batch = evaluateSeoOpportunityPipelineBatch(
    createSeoDecisionPipelineContextFromData({ posts }),
    opportunities,
  );
  return {
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
      ...(row.errorCode ? { errorCode: row.errorCode } : {}),
      ...(row.errorMessage ? { errorMessage: row.errorMessage } : {}),
    })),
  };
}

function successBridge(
  opportunities: SeoResearchOpportunity[],
  decisionPipeline?: SeoResearchDecisionPipelineAttachment,
): ResearchUkOpportunitiesSuccess & { decisionPipeline: SeoResearchDecisionPipelineAttachment } {
  return {
    ok: true,
    research: researchPayload(opportunities),
    decisionPipeline: decisionPipeline ?? okPipelineAttachment(opportunities),
  };
}

function failureBridge(
  overrides: Partial<ResearchUkOpportunitiesFailure> & Pick<ResearchUkOpportunitiesFailure, "error">,
): ResearchUkOpportunitiesFailure {
  return {
    ok: false,
    error: overrides.error,
    ...(overrides.code ? { code: overrides.code } : {}),
    ...(overrides.diagnostic ? { diagnostic: overrides.diagnostic } : {}),
  };
}

function countingPersist(
  impl: (input: SeoLedgerMapInput) => Promise<InsertResearchRunWithDecisionsResult>,
) {
  const calls: SeoLedgerMapInput[] = [];
  return {
    calls,
    persist: async (input: SeoLedgerMapInput) => {
      calls.push(input);
      return impl(input);
    },
  };
}

function mockedTxPersist(runId = "seorun_l2_fixed") {
  const sqls: string[] = [];
  return {
    sqls,
    persist: (input: SeoLedgerMapInput) =>
      insertResearchRunWithDecisions(
        { ...input, runId: input.runId ?? runId },
        {
          isDatabaseConfigured: () => true,
          createRunId: () => runId,
          createDecisionId: () => `seodec_${sqls.length}`,
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
      ),
  };
}

function assertJsonSerializable(value: unknown) {
  const roundTrip = JSON.parse(JSON.stringify(value));
  assert.deepEqual(roundTrip, JSON.parse(JSON.stringify(roundTrip)));
  assert.equal(typeof value === "object" && value !== null, true);
}

// --- Action wiring (source regression; behavioral path covered by DI helpers) ---

test("L2 action wires Bridge once then Ledger persist; early returns skip Ledger", () => {
  const actions = read("lib/cms/ai-seo-actions.ts");
  assert.match(actions, /requireAdminActor\("seo"\)/);
  assert.match(actions, /isOpenAiSeoConfigured/);
  assert.match(actions, /researchUkContentOpportunitiesWithDecisionPipelineFromCms/);
  assert.match(actions, /runResearchBridgeThenPersistLedger/);
  assert.match(actions, /insertResearchRunWithDecisions/);
  assert.match(actions, /source:\s*"manual"/);
  assert.match(actions, /ledgerPersisted|ResearchLedgerDurabilityMeta/);
  // Unauthorized / not_configured return before Bridge+Ledger orchestration body.
  const fnStart = actions.indexOf("export async function researchUkContentOpportunitiesAction");
  const orchestrateCall = actions.indexOf("runResearchBridgeThenPersistLedger({", fnStart);
  assert.ok(fnStart >= 0 && orchestrateCall > fnStart);
  const earlyReturnBlock = actions.slice(fnStart, orchestrateCall);
  assert.match(earlyReturnBlock, /unauthorized/);
  assert.match(earlyReturnBlock, /not_configured/);
  assert.doesNotMatch(earlyReturnBlock, /insertResearchRunWithDecisions\(/);
});

test("attach helper stays pure; persist stays server-only; UI does not import Ledger", () => {
  const attach = read("lib/cms/seo-experiment-ledger/attach-research-durability.ts");
  const persist = read("lib/cms/seo-experiment-ledger/persist-mysql.ts");
  const panel = read("components/sidhu/SeoOpportunitiesPanel.tsx");
  assert.doesNotMatch(attach, /from ["'][^"']*(openai|gemini|mysql2|server-only)["']/i);
  assert.doesNotMatch(attach, /buildUkGscEvidencePack|import "server-only"/);
  assert.match(persist, /import "server-only"/);
  assert.doesNotMatch(panel, /seo-experiment-ledger|ledgerPersisted|insertResearchRunWithDecisions/);
});

// --- Success + PERSISTED ---

test("Research success: one research, one persist, PERSISTED metadata, order unchanged", async () => {
  const opp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
  });
  const bridge = successBridge([opp]);
  let researchCalls = 0;
  const tx = mockedTxPersist("seorun_success");
  const counter = countingPersist(tx.persist);

  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    nowIso: (() => {
      let n = 0;
      return () => (n++ === 0 ? "2026-10-09T01:00:00.000Z" : "2026-10-09T01:00:04.000Z");
    })(),
    runResearch: async () => {
      researchCalls += 1;
      return bridge;
    },
    persist: counter.persist,
  });

  assert.equal(researchCalls, 1);
  assert.equal(counter.calls.length, 1);
  assert.equal(counter.calls[0].source, "manual");
  assert.equal(counter.calls[0].actorAdminId, "adm_l2");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.research.opportunities, bridge.research.opportunities);
  assert.equal(result.decisionPipeline.runStatus, "OK");
  assert.equal(result.ledgerPersisted, true);
  assert.equal(result.ledgerStatus, "PERSISTED");
  assert.equal(result.ledgerRunId, "seorun_success");
  assert.equal(result.ledgerDecisionCount, 1);
  assert.equal(result.ledgerErrorCode, undefined);
  assert.equal(tx.sqls.filter((s) => /INSERT INTO seo_research_runs/i.test(s)).length, 1);
  assert.equal(tx.sqls.filter((s) => /seo_opportunity_decisions/i.test(s)).length, 1);
  assertJsonSerializable(result);
});

test("multiple opportunities: single persist; fingerprints preserved; no duplicate run", async () => {
  const opps = [
    opportunity({
      topic: "Firestick IPTV buffering fix UK",
      workingTitle: "Fix Firestick IPTV Buffering in the UK",
      recommendation: "NEW_BLOG",
    }),
    opportunity({
      topic: "Best IPTV apps for Firestick 2026",
      workingTitle: "Best IPTV Apps for Firestick 2026",
      recommendation: "NEW_BLOG",
    }),
  ];
  const bridge = successBridge(opps);
  const fingerprints = bridge.decisionPipeline.evaluations.map((e) => e.pipelineFingerprint);
  const tx = mockedTxPersist("seorun_multi");
  const counter = countingPersist(tx.persist);

  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => bridge,
    persist: counter.persist,
  });

  assert.equal(counter.calls.length, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.research.opportunities.length, 2);
  assert.deepEqual(
    result.decisionPipeline.evaluations.map((e) => e.pipelineFingerprint),
    fingerprints,
  );
  assert.equal(result.ledgerPersisted, true);
  assert.equal(result.ledgerDecisionCount, 2);
  assert.equal(result.ledgerRunId, "seorun_multi");
});

// --- Research failures ---

test("rate-limited Research failure persists zero decisions and preserves diagnostic", async () => {
  const bridge = failureBridge({
    error: "Too many research requests. Try again shortly.",
    code: "rate_limited",
    diagnostic: "RESPONSE_INCOMPLETE",
  });
  const tx = mockedTxPersist("seorun_fail");
  const counter = countingPersist(tx.persist);

  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => bridge,
    persist: counter.persist,
  });

  assert.equal(counter.calls.length, 1);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "rate_limited");
  assert.equal(result.error, bridge.error);
  assert.deepEqual(result.diagnostic, bridge.diagnostic);
  assert.equal(result.ledgerPersisted, true);
  assert.equal(result.ledgerDecisionCount, 0);
  assert.equal(result.ledgerRunId, "seorun_fail");
  const snapshot = bridgeResultToLedgerSnapshot(bridge);
  assert.equal(snapshot.ok, false);
  if (!snapshot.ok) {
    assert.equal(snapshot.code, "rate_limited");
  }
});

test("timeout / unavailable Research failures pass through with one persist attempt", async () => {
  for (const code of ["timeout", "unavailable"] as const) {
    const bridge = failureBridge({ error: `Research ${code}`, code });
    let researchCalls = 0;
    const counter = countingPersist(async () => ({
      ok: true,
      status: "PERSISTED",
      runId: `seorun_${code}`,
      decisionCount: 0,
    }));
    const result = await runResearchBridgeThenPersistLedger({
      actorAdminId: "adm_l2",
      runResearch: async () => {
        researchCalls += 1;
        return bridge;
      },
      persist: counter.persist,
    });
    assert.equal(researchCalls, 1);
    assert.equal(counter.calls.length, 1);
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(result.code, code);
    assert.equal(result.ledgerPersisted, true);
    assert.equal(result.ledgerDecisionCount, 0);
  }
});

// --- Pipeline CONTEXT_ERROR ---

test("CONTEXT_ERROR preserves Research success and persists zero decision rows", async () => {
  const opp = opportunity({
    topic: "UK IPTV setup guide",
    workingTitle: "UK IPTV Setup Guide",
    recommendation: "NEW_BLOG",
  });
  const bridge: ResearchUkOpportunitiesWithPipelineResult = {
    ok: true,
    research: researchPayload([opp]),
    decisionPipeline: {
      pipelineVersion: SEO_DECISION_PIPELINE_VERSION,
      runStatus: "CONTEXT_ERROR",
      evaluations: [],
      errorCode: "pipeline_context_error",
      errorMessage: "Decision pipeline context failed.",
    },
  };
  const tx = mockedTxPersist("seorun_ctx");
  const counter = countingPersist(tx.persist);

  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => bridge,
    persist: counter.persist,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisionPipeline.runStatus, "CONTEXT_ERROR");
  assert.equal(result.decisionPipeline.evaluations.length, 0);
  assert.equal(result.research.opportunities.length, 1);
  assert.equal(result.ledgerPersisted, true);
  assert.equal(result.ledgerDecisionCount, 0);
  assert.equal(tx.sqls.filter((s) => /seo_opportunity_decisions/i.test(s)).length, 0);
});

test("CONTEXT_ERROR + Ledger failure still returns Research success", async () => {
  const bridge: ResearchUkOpportunitiesWithPipelineResult = {
    ok: true,
    research: researchPayload([
      opportunity({
        topic: "UK IPTV setup guide",
        workingTitle: "UK IPTV Setup Guide",
        recommendation: "NEW_BLOG",
      }),
    ]),
    decisionPipeline: {
      pipelineVersion: SEO_DECISION_PIPELINE_VERSION,
      runStatus: "CONTEXT_ERROR",
      evaluations: [],
      errorCode: "pipeline_context_error",
      errorMessage: "Decision pipeline context failed.",
    },
  };
  let researchCalls = 0;
  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => {
      researchCalls += 1;
      return bridge;
    },
    persist: async () => ({
      ok: false,
      status: "UNAVAILABLE",
      errorCode: "mysql_unavailable",
      errorMessage: "Experiment Ledger requires MySQL and is skipped in JSON mode.",
    }),
  });
  assert.equal(researchCalls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisionPipeline.runStatus, "CONTEXT_ERROR");
  assert.equal(result.ledgerPersisted, false);
  assert.equal(result.ledgerStatus, "UNAVAILABLE");
  assert.equal(result.ledgerRunId, undefined);
  assert.equal(result.ledgerDecisionCount, undefined);
});

// --- Persistence failures ---

test("MySQL unavailable: Research preserved; sanitized UNAVAILABLE; no fake run id", async () => {
  const bridge = successBridge([
    opportunity({
      topic: "Best IPTV apps for Firestick in 2026",
      workingTitle: "Best IPTV Apps for Firestick in 2026",
      recommendation: "NEW_BLOG",
    }),
  ]);
  let researchCalls = 0;
  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => {
      researchCalls += 1;
      return bridge;
    },
    persist: async (input) =>
      insertResearchRunWithDecisions(input, { isDatabaseConfigured: () => false }),
  });
  assert.equal(researchCalls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.research, bridge.research);
  assert.equal(result.ledgerPersisted, false);
  assert.equal(result.ledgerStatus, "UNAVAILABLE");
  assert.equal(result.ledgerErrorCode, "mysql_unavailable");
  assert.equal(result.ledgerRunId, undefined);
  assert.equal(result.ledgerDecisionCount, undefined);
  assertJsonSerializable(result);
});

test("VALIDATION_ERROR: Research preserved; no fake run id; no provider retry", async () => {
  const bridge = successBridge([
    opportunity({
      topic: "Best IPTV apps for Firestick in 2026",
      workingTitle: "Best IPTV Apps for Firestick in 2026",
      recommendation: "NEW_BLOG",
    }),
  ]);
  let researchCalls = 0;
  let persistCalls = 0;
  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => {
      researchCalls += 1;
      return bridge;
    },
    persist: async () => {
      persistCalls += 1;
      return {
        ok: false,
        status: "VALIDATION_ERROR",
        errorCode: "invalid_automation_selectable",
        errorMessage: "Priority automationSelectable mismatch.",
      };
    },
  });
  assert.equal(researchCalls, 1);
  assert.equal(persistCalls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.ledgerPersisted, false);
  assert.equal(result.ledgerStatus, "VALIDATION_ERROR");
  assert.equal(result.ledgerErrorCode, "invalid_automation_selectable");
  assert.equal(result.ledgerRunId, undefined);
});

test("WRITE_ERROR: Research preserved; sanitized code; no second evaluation", async () => {
  const bridge = successBridge([
    opportunity({
      topic: "Best IPTV apps for Firestick in 2026",
      workingTitle: "Best IPTV Apps for Firestick in 2026",
      recommendation: "NEW_BLOG",
    }),
  ]);
  let researchCalls = 0;
  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => {
      researchCalls += 1;
      return bridge;
    },
    persist: async (input) =>
      insertResearchRunWithDecisions(input, {
        isDatabaseConfigured: () => true,
        withTransaction: async () => {
          throw new Error("ER_LOCK_WAIT_TIMEOUT password=secret host=10.0.0.1");
        },
      }),
  });
  assert.equal(researchCalls, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.ledgerPersisted, false);
  assert.equal(result.ledgerStatus, "WRITE_ERROR");
  assert.equal(result.ledgerErrorCode, "ledger_write_error");
  assert.equal(result.ledgerRunId, undefined);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /password|10\.0\.0\.1|ER_LOCK/i);
});

test("unexpected persist throw: contained; Research preserved; generic WRITE_ERROR", async () => {
  const bridge = successBridge([
    opportunity({
      topic: "Best IPTV apps for Firestick in 2026",
      workingTitle: "Best IPTV Apps for Firestick in 2026",
      recommendation: "NEW_BLOG",
    }),
  ]);
  const result = await attachLedgerDurabilityToResearchResult({
    researchResult: bridge,
    actorAdminId: "adm_l2",
    createdAt: "2026-10-09T01:00:00.000Z",
    completedAt: "2026-10-09T01:00:01.000Z",
    persist: async () => {
      throw new Error("boom stack at /var/secret/db.ts");
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.research.opportunities, bridge.research.opportunities);
  assert.equal(result.ledgerPersisted, false);
  assert.equal(result.ledgerStatus, "WRITE_ERROR");
  assert.equal(result.ledgerErrorCode, "ledger_unexpected_error");
  assert.doesNotMatch(JSON.stringify(result), /boom|secret|stack/i);
});

test("Bridge/Research throw propagates and never calls Ledger (not misclassified)", async () => {
  let persistCalls = 0;
  await assert.rejects(
    () =>
      runResearchBridgeThenPersistLedger({
        actorAdminId: "adm_l2",
        runResearch: async () => {
          throw new Error("bridge_execution_failed");
        },
        persist: async () => {
          persistCalls += 1;
          return {
            ok: true,
            status: "PERSISTED",
            runId: "should_not_exist",
            decisionCount: 0,
          };
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /bridge_execution_failed/);
      assert.doesNotMatch(err.message, /ledger|WRITE_ERROR|PERSISTED/i);
      return true;
    },
  );
  assert.equal(persistCalls, 0);
});

// --- Evaluation safety ---

test("VALIDATION_ERROR evaluation row persists with siblings via real L1 mapper path", async () => {
  const opps = [
    opportunity({
      topic: "Best IPTV apps for Firestick in 2026",
      workingTitle: "Best IPTV Apps for Firestick in 2026",
      recommendation: "NEW_BLOG",
    }),
    opportunity({
      topic: "Firestick IPTV buffering fix UK",
      workingTitle: "Fix Firestick IPTV Buffering UK",
      recommendation: "NEW_BLOG",
    }),
  ];
  const attachment = okPipelineAttachment(opps);
  // Force second evaluation into VALIDATION_ERROR shape while keeping identity.
  attachment.evaluations[1] = {
    ...attachment.evaluations[1],
    evaluationStatus: "VALIDATION_ERROR",
    refreshFirst: null,
    nextBestAction: null,
    priority: null,
    resolvedTarget: null,
    errorCode: "invalid_opportunity",
    errorMessage: "Validation failed for opportunity.",
  };
  const bridge = successBridge(opps, attachment);
  const tx = mockedTxPersist("seorun_val_row");
  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => bridge,
    persist: tx.persist,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.ledgerPersisted, true);
  assert.equal(result.ledgerDecisionCount, 2);
  assert.equal(result.decisionPipeline.evaluations[1].evaluationStatus, "VALIDATION_ERROR");
});

test("INTERNAL_ERROR evaluation row persists without altering Research", async () => {
  const opp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
  });
  const attachment = okPipelineAttachment([opp]);
  attachment.evaluations[0] = {
    ...attachment.evaluations[0],
    evaluationStatus: "INTERNAL_ERROR",
    refreshFirst: null,
    nextBestAction: null,
    priority: null,
    resolvedTarget: null,
    errorCode: "pipeline_internal_error",
    errorMessage: "Internal evaluation error.",
  };
  const bridge = successBridge([opp], attachment);
  const tx = mockedTxPersist("seorun_internal");
  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => bridge,
    persist: tx.persist,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.research.opportunities[0].topic, opp.topic);
  assert.equal(result.ledgerPersisted, true);
  assert.equal(result.ledgerDecisionCount, 1);
});

test("REFRESH_EXISTING evaluation preserves Research and persists decision", async () => {
  const post = blog("post-firestick", "how-to-watch-iptv-on-firestick", "How to Watch IPTV on Firestick");
  const opp = opportunity({
    topic: "How to watch IPTV on Firestick",
    workingTitle: "How to Watch IPTV on Firestick: Complete Setup Guide",
    recommendation: "REFRESH_EXISTING",
    existingCoverage: "STRONG",
    matchedTitle: post.title,
    matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
    restorePath: "/blogs/how-to-watch-iptv-on-firestick/",
  });
  const bridge = successBridge([opp], okPipelineAttachment([opp], [post]));
  const tx = mockedTxPersist("seorun_refresh");
  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => bridge,
    persist: tx.persist,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.research.opportunities[0].recommendation, "REFRESH_EXISTING");
  assert.equal(result.ledgerPersisted, true);
  assert.ok((result.ledgerDecisionCount ?? 0) >= 1);
  const nba = result.decisionPipeline.evaluations[0]?.nextBestAction?.action;
  assert.ok(nba === "REFRESH_EXISTING" || nba === "NEW_BLOG" || typeof nba === "string");
});

test("NEW_BLOG autonomous eligibility preserved through PERSISTED path", async () => {
  const opp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
  });
  const bridge = successBridge([opp]);
  const eval0 = bridge.decisionPipeline.evaluations[0];
  assert.equal(eval0.nextBestAction?.action, "NEW_BLOG");
  assert.equal(eval0.nextBestAction?.autonomousEligible, true);
  assert.equal(eval0.priority?.automationSelectable, true);

  const tx = mockedTxPersist("seorun_nba");
  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => bridge,
    persist: tx.persist,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.decisionPipeline.evaluations[0].nextBestAction?.autonomousEligible, true);
  assert.equal(result.decisionPipeline.evaluations[0].priority?.automationSelectable, true);
  assert.equal(result.ledgerPersisted, true);
});

test("automation-selectability mismatch fails persistence without altering Research", async () => {
  const opp = opportunity({
    topic: "Best IPTV apps for Firestick in 2026",
    workingTitle: "Best IPTV Apps for Firestick in 2026",
    recommendation: "NEW_BLOG",
  });
  const attachment = okPipelineAttachment([opp]);
  const priority = attachment.evaluations[0].priority;
  assert.ok(priority);
  attachment.evaluations[0] = {
    ...attachment.evaluations[0],
    priority: { ...priority, automationSelectable: !priority.automationSelectable },
  };
  const bridge = successBridge([opp], attachment);
  const result = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => bridge,
    persist: (input) =>
      insertResearchRunWithDecisions(input, {
        isDatabaseConfigured: () => true,
        withTransaction: async () => {
          throw new Error("should not reach TX");
        },
      }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.research.opportunities[0].recommendation, "NEW_BLOG");
  assert.equal(result.ledgerPersisted, false);
  assert.equal(result.ledgerStatus, "VALIDATION_ERROR");
  assert.equal(result.ledgerErrorCode, "automation_selectable_mismatch");
  assert.equal(result.ledgerRunId, undefined);
});

// --- Contract helpers ---

test("durabilityMetaFromPersistResult never exposes errorMessage or fake ids", () => {
  const persisted = durabilityMetaFromPersistResult({
    ok: true,
    status: "PERSISTED",
    runId: "seorun_x",
    decisionCount: 3,
  });
  assert.deepEqual(persisted, {
    ledgerPersisted: true,
    ledgerStatus: "PERSISTED",
    ledgerRunId: "seorun_x",
    ledgerDecisionCount: 3,
  });

  const failed = durabilityMetaFromPersistResult({
    ok: false,
    status: "WRITE_ERROR",
    errorCode: "ledger_write_error",
    errorMessage: "Experiment Ledger persistence failed.",
  });
  assert.equal(failed.ledgerPersisted, false);
  assert.equal(failed.ledgerStatus, "WRITE_ERROR");
  assert.equal(failed.ledgerErrorCode, "ledger_write_error");
  assert.equal(failed.ledgerRunId, undefined);
  assert.equal(failed.ledgerDecisionCount, undefined);
  assert.equal("errorMessage" in failed, false);
});

test("configured / decisionPipeline semantics remain additive on composed result", async () => {
  const bridge = successBridge([
    opportunity({
      topic: "Best IPTV apps for Firestick in 2026",
      workingTitle: "Best IPTV Apps for Firestick in 2026",
      recommendation: "NEW_BLOG",
    }),
  ]);
  const composed = await runResearchBridgeThenPersistLedger({
    actorAdminId: "adm_l2",
    runResearch: async () => bridge,
    persist: async () => ({
      ok: true,
      status: "PERSISTED",
      runId: "seorun_cfg",
      decisionCount: 1,
    }),
  });
  const actionShaped = { ...composed, configured: true };
  assert.equal(actionShaped.configured, true);
  assert.equal(actionShaped.ok, true);
  if (!actionShaped.ok) return;
  assert.ok(actionShaped.decisionPipeline);
  assert.equal(actionShaped.ledgerPersisted, true);
  assertJsonSerializable(actionShaped);
});

test("no CMS content mutations from L2 attach helper (source invariant)", () => {
  const attach = read("lib/cms/seo-experiment-ledger/attach-research-durability.ts");
  const actions = read("lib/cms/ai-seo-actions.ts");
  assert.doesNotMatch(attach, /savePost|saveSeoPlanning|createSeoPlanning|publish|unpublish|listPosts\(/);
  assert.doesNotMatch(
    actions.slice(actions.indexOf("researchUkContentOpportunitiesAction")),
    /savePost|saveSeoPlanning|createSeoPlanningDraft|publishPost/,
  );
});
