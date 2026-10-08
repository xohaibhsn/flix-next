/**
 * Experiment Ledger L3 — authenticated read-only viewer.
 * Provider-free. No production DB. No Research / GSC / Pipeline execution.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import type { RowDataPacket } from "mysql2/promise";
import { SeoLedgerRunDetail } from "../components/sidhu/SeoLedgerRunDetail";
import { SeoLedgerRunList } from "../components/sidhu/SeoLedgerRunList";
import {
  clampLedgerListPageSize,
  decodeLedgerListCursor,
  encodeLedgerListCursor,
  formatLedgerMysqlUtcLabel,
  isValidLedgerRunId,
  SEO_LEDGER_LIST_DEFAULT_PAGE_SIZE,
  SEO_LEDGER_LIST_MAX_PAGE_SIZE,
  toLedgerMysqlDateTime,
} from "../lib/cms/seo-experiment-ledger/read-cursor";
import {
  getSeoResearchRunDetail,
  listSeoResearchRuns,
} from "../lib/cms/seo-experiment-ledger/read-mysql";
import type {
  SeoOpportunityDecisionRow,
  SeoResearchRunRow,
} from "../lib/cms/seo-experiment-ledger/types";
import { SIDHU_SEO_NAV } from "../lib/cms/sidhu-seo-nav";
import { permissionForSidhuPath } from "../lib/auth/permissions";

const root = path.join(__dirname, "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

const SUCCESS_RUN_ID = "seorun_7b643688-5845-4c05-ac6d-25689b51377f";
const FAILED_RUN_ID = "seorun_32214d7c-7247-4728-93dd-669d3a92d143";

function runPacket(overrides: Partial<Record<string, unknown>> = {}): RowDataPacket {
  return {
    id: SUCCESS_RUN_ID,
    created_at: "2026-10-08 22:58:19",
    completed_at: "2026-10-08 22:58:36",
    source: "manual",
    actor_admin_id: "adm_test",
    research_ok: 1,
    research_error_code: null,
    pipeline_run_status: "OK",
    pipeline_version: "v1",
    pipeline_error_code: null,
    opportunity_count: 2,
    gsc_status: "AVAILABLE",
    durability_status: "COMPLETE",
    ...overrides,
  } as RowDataPacket;
}

function decisionPacket(
  overrides: Partial<Record<string, unknown>> = {},
): RowDataPacket {
  return {
    id: "seodec_cec501e4-d530-4d9e-b2b9-7acf3212c5e9",
    run_id: SUCCESS_RUN_ID,
    opportunity_index: 0,
    opportunity_identity: "9b945fa9cac73892643c36655582b84af94d2ccc6229cec350aabbccddeeff0011",
    created_at: "2026-10-08 22:58:19",
    topic: "Diagnosing buffering and Wi-Fi problems on Fire TV",
    working_title: "Firestick IPTV Buffering: Check the App, Wi-Fi and Device",
    research_recommendation: "REFRESH_EXISTING",
    research_confidence: "HIGH",
    existing_coverage: "STRONG",
    matched_public_url: "/blogs/how-to-watch-iptv-on-firestick/",
    restore_path: "",
    target_post_id: "post-firestick",
    evaluation_status: "OK",
    rf_verdict: "REFRESH_EXISTING",
    rf_fingerprint: "4eabb558f4d53dbe0af996cc",
    nba_action: "REFRESH_EXISTING",
    nba_status: "ACTIONABLE",
    nba_autonomous_eligible: 0,
    nba_fingerprint: "2f4ddbba1904a8070b954400",
    priority_score: 54,
    priority_tier: "MEDIUM",
    priority_score_version: "v1",
    priority_automation_selectable: 0,
    priority_fingerprint: "7b68fb787ce4cdc121c8f96d",
    pipeline_fingerprint: "4074918ba390193e31309405",
    selected: 0,
    selection_source: "none",
    ...overrides,
  } as RowDataPacket;
}

test("L3 cursor helpers clamp page size and validate run IDs", () => {
  assert.equal(clampLedgerListPageSize(undefined), SEO_LEDGER_LIST_DEFAULT_PAGE_SIZE);
  assert.equal(clampLedgerListPageSize(0), SEO_LEDGER_LIST_DEFAULT_PAGE_SIZE);
  assert.equal(clampLedgerListPageSize(20), 20);
  assert.equal(clampLedgerListPageSize(50), SEO_LEDGER_LIST_MAX_PAGE_SIZE);
  assert.equal(clampLedgerListPageSize(999), SEO_LEDGER_LIST_MAX_PAGE_SIZE);
  assert.equal(isValidLedgerRunId(SUCCESS_RUN_ID), true);
  assert.equal(isValidLedgerRunId("seorun_not-a-valid!!"), false);
  assert.equal(isValidLedgerRunId("seodec_abc"), false);
  assert.equal(isValidLedgerRunId(`seorun_${"a".repeat(100)}`), false);
  assert.equal(isValidLedgerRunId("'; DROP TABLE seo_research_runs; --"), false);
});

test("L3 cursor encode/decode is stable and rejects malformed input", () => {
  const encoded = encodeLedgerListCursor({
    createdAt: "2026-10-08 22:58:19",
    id: SUCCESS_RUN_ID,
  });
  assert.deepEqual(decodeLedgerListCursor(encoded), {
    createdAt: "2026-10-08 22:58:19",
    id: SUCCESS_RUN_ID,
  });
  assert.equal(decodeLedgerListCursor(null), null);
  assert.equal(decodeLedgerListCursor(""), null);
  assert.equal(decodeLedgerListCursor("!!!"), null);
  assert.equal(decodeLedgerListCursor("not-base64"), null);
  assert.equal(
    decodeLedgerListCursor(Buffer.from('{"c":"bad","i":"x"}').toString("base64url")),
    null,
  );
  // Oversized cursor payload rejected before any DB work.
  assert.equal(decodeLedgerListCursor("A".repeat(241)), null);
  // Tampered / SQL-looking cursor body rejected by structure validation.
  assert.equal(
    decodeLedgerListCursor(
      Buffer.from(
        JSON.stringify({
          c: "2026-10-08 22:58:19'; OR 1=1 --",
          i: SUCCESS_RUN_ID,
        }),
      ).toString("base64url"),
    ),
    null,
  );
  assert.equal(
    decodeLedgerListCursor(
      Buffer.from(JSON.stringify({ c: "2026-10-08 22:58:19", i: "DROP TABLE x" })).toString(
        "base64url",
      ),
    ),
    null,
  );
  assert.match(formatLedgerMysqlUtcLabel("2026-10-08 22:58:19"), /UTC$/);
  // Date objects from mysql2 normalize to the same MySQL UTC wall-clock string.
  assert.equal(
    toLedgerMysqlDateTime(new Date("2026-10-08T22:58:19.000Z")),
    "2026-10-08 22:58:19",
  );
  assert.equal(toLedgerMysqlDateTime("2026-10-08 22:58:19"), "2026-10-08 22:58:19");
});

test("listSeoResearchRuns: unavailable vs empty vs query error", async () => {
  const unavailable = await listSeoResearchRuns({
    deps: { isDatabaseConfigured: () => false },
  });
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.errorCode, "unavailable");

  const empty = await listSeoResearchRuns({
    deps: {
      isDatabaseConfigured: () => true,
      execute: async () => [],
    },
  });
  assert.equal(empty.ok, true);
  if (empty.ok) {
    assert.equal(empty.runs.length, 0);
    assert.equal(empty.nextCursor, null);
  }

  const failed = await listSeoResearchRuns({
    deps: {
      isDatabaseConfigured: () => true,
      execute: async () => {
        throw new Error("ECONNREFUSED secret");
      },
    },
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.errorCode, "query_error");
    assert.doesNotMatch(failed.errorMessage, /ECONNREFUSED|secret/i);
  }
});

test("listSeoResearchRuns: newest-first keyset pagination and invalid cursor", async () => {
  const calls: Array<{ sql: string; params: ReadonlyArray<unknown> }> = [];
  const sameTsA = runPacket({
    id: "seorun_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    created_at: "2026-10-08 22:00:00",
  });
  const sameTsB = runPacket({
    id: "seorun_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    created_at: "2026-10-08 22:00:00",
  });
  const older = runPacket({
    id: FAILED_RUN_ID,
    created_at: "2026-10-08 21:00:00",
    research_ok: 0,
    research_error_code: "invalid_response",
    pipeline_run_status: "SKIPPED",
    opportunity_count: 0,
    gsc_status: null,
  });

  const page1 = await listSeoResearchRuns({
    pageSize: 2,
    deps: {
      isDatabaseConfigured: () => true,
      execute: async (sql, params) => {
        calls.push({ sql, params });
        assert.match(sql, /ORDER BY created_at DESC, id DESC/);
        assert.match(sql, /LIMIT \?/);
        assert.doesNotMatch(sql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bALTER\b/i);
        return [sameTsB, sameTsA, older];
      },
    },
  });
  assert.equal(page1.ok, true);
  if (page1.ok) {
    assert.equal(page1.runs.length, 2);
    assert.equal(page1.runs[0]?.id, "seorun_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    assert.equal(page1.runs[1]?.id, "seorun_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    assert.ok(page1.nextCursor);
    const cursor = decodeLedgerListCursor(page1.nextCursor);
    assert.ok(cursor);

    const page2 = await listSeoResearchRuns({
      pageSize: 2,
      cursor: page1.nextCursor,
      deps: {
        isDatabaseConfigured: () => true,
        execute: async (sql, params) => {
          calls.push({ sql, params });
          assert.match(sql, /created_at < \?/);
          assert.equal(params[0], cursor!.createdAt);
          assert.equal(params[2], cursor!.id);
          return [older];
        },
      },
    });
    assert.equal(page2.ok, true);
    if (page2.ok) {
      assert.equal(page2.runs.length, 1);
      assert.equal(page2.nextCursor, null);
    }
  }

  const badCursor = await listSeoResearchRuns({
    cursor: "totally-invalid",
    deps: {
      isDatabaseConfigured: () => true,
      execute: async () => {
        throw new Error("should not query");
      },
    },
  });
  assert.equal(badCursor.ok, false);
  if (!badCursor.ok) assert.equal(badCursor.errorCode, "invalid_cursor");
  assert.equal(calls.length, 2);

  // Exhausted page: valid cursor, zero rows — still ok:true (UI maps to exhausted, not empty).
  const exhausted = await listSeoResearchRuns({
    cursor: page1.ok ? page1.nextCursor : null,
    pageSize: 2,
    deps: {
      isDatabaseConfigured: () => true,
      execute: async () => [],
    },
  });
  assert.equal(exhausted.ok, true);
  if (exhausted.ok) {
    assert.equal(exhausted.runs.length, 0);
    assert.equal(exhausted.nextCursor, null);
  }
});

test("listSeoResearchRuns: multi-page static dataset has no duplicates or skips", async () => {
  const dataset = [
    runPacket({ id: "seorun_eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee", created_at: "2026-10-08 23:00:00" }),
    runPacket({ id: "seorun_dddddddd-dddd-dddd-dddd-dddddddddddd", created_at: "2026-10-08 22:00:00" }),
    runPacket({ id: "seorun_cccccccc-cccc-cccc-cccc-cccccccccccc", created_at: "2026-10-08 22:00:00" }),
    runPacket({ id: "seorun_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", created_at: "2026-10-08 21:00:00" }),
    runPacket({ id: "seorun_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", created_at: "2026-10-08 20:00:00" }),
  ];

  function pageFrom(cursorRaw: string | null | undefined, pageSize: number) {
    const cursor = cursorRaw ? decodeLedgerListCursor(cursorRaw) : null;
    if (cursorRaw && !cursor) throw new Error("bad cursor");
    const filtered = cursor
      ? dataset.filter((row) => {
          const ts = String(row.created_at);
          return (
            ts < cursor.createdAt ||
            (ts === cursor.createdAt && String(row.id) < cursor.id)
          );
        })
      : dataset;
    return filtered.slice(0, pageSize + 1);
  }

  const seen: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const result = await listSeoResearchRuns({
      pageSize: 2,
      cursor,
      deps: {
        isDatabaseConfigured: () => true,
        execute: async (_sql, params) => {
          const c =
            params.length >= 3
              ? encodeLedgerListCursor({
                  createdAt: String(params[0]),
                  id: String(params[2]),
                })
              : null;
          return pageFrom(c, 2);
        },
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) break;
    for (const run of result.runs) seen.push(run.id);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }

  assert.deepEqual(seen, [
    "seorun_eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
    "seorun_dddddddd-dddd-dddd-dddd-dddddddddddd",
    "seorun_cccccccc-cccc-cccc-cccc-cccccccccccc",
    "seorun_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "seorun_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  ]);
  assert.equal(new Set(seen).size, seen.length);
});

test("getSeoResearchRunDetail: success with two decisions and failed with zero", async () => {
  const success = await getSeoResearchRunDetail({
    runId: SUCCESS_RUN_ID,
    deps: {
      isDatabaseConfigured: () => true,
      execute: async (sql, params) => {
        assert.doesNotMatch(sql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
        if (sql.includes("seo_research_runs")) {
          assert.deepEqual([...params], [SUCCESS_RUN_ID]);
          return [runPacket()];
        }
        assert.match(sql, /ORDER BY opportunity_index ASC/);
        return [
          decisionPacket({ opportunity_index: 0, target_post_id: "post-firestick" }),
          decisionPacket({
            id: "seodec_f2463920-d552-470f-b1fd-e84edd982e8b",
            opportunity_index: 1,
            topic: "Understanding streaming speed tests and Wi-Fi limits for HD and 4K",
            working_title: "HD and 4K Streaming: Test Your Connection Before Changing Quality",
            matched_public_url: "/blogs/hd-vs-4k-streaming/",
            target_post_id: "post-hd-4k",
            rf_fingerprint: "6ad35899d2d65a652ad57189",
            nba_fingerprint: "f5937e0112249fb5779cfe69",
            priority_fingerprint: "8bcbfb1fdf14b9ee7527fe64",
            pipeline_fingerprint: "cf2c122cefeab2250c1e5a08",
          }),
        ];
      },
    },
  });
  assert.equal(success.ok, true);
  if (success.ok) {
    assert.equal(success.run.researchOk, true);
    assert.equal(success.run.pipelineRunStatus, "OK");
    assert.equal(success.decisions.length, 2);
    assert.equal(success.decisions[0]?.opportunityIndex, 0);
    assert.equal(success.decisions[0]?.targetPostId, "post-firestick");
    assert.equal(success.decisions[0]?.priorityScore, 54);
    assert.equal(success.decisions[0]?.priorityTier, "MEDIUM");
    assert.equal(success.decisions[0]?.nbaAutonomousEligible, false);
    assert.equal(success.decisions[0]?.selected, false);
    assert.equal(success.decisions[0]?.selectionSource, "none");
    assert.equal(success.decisions[1]?.targetPostId, "post-hd-4k");
    assert.equal(success.decisionOverflow, false);
  }

  const failed = await getSeoResearchRunDetail({
    runId: FAILED_RUN_ID,
    deps: {
      isDatabaseConfigured: () => true,
      execute: async (sql) => {
        if (sql.includes("seo_research_runs")) {
          return [
            runPacket({
              id: FAILED_RUN_ID,
              research_ok: 0,
              research_error_code: "invalid_response",
              pipeline_run_status: "SKIPPED",
              pipeline_version: null,
              opportunity_count: 0,
              gsc_status: null,
            }),
          ];
        }
        return [];
      },
    },
  });
  assert.equal(failed.ok, true);
  if (failed.ok) {
    assert.equal(failed.run.researchOk, false);
    assert.equal(failed.run.pipelineRunStatus, "SKIPPED");
    assert.equal(failed.decisions.length, 0);
  }
});

test("getSeoResearchRunDetail: invalid id, not found, nullable fields, overflow", async () => {
  const invalid = await getSeoResearchRunDetail({
    runId: "bad",
    deps: {
      isDatabaseConfigured: () => true,
      execute: async () => {
        throw new Error("no query");
      },
    },
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.errorCode, "invalid_id");

  const missing = await getSeoResearchRunDetail({
    runId: SUCCESS_RUN_ID,
    deps: {
      isDatabaseConfigured: () => true,
      execute: async () => [],
    },
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.errorCode, "not_found");

  const nullable = await getSeoResearchRunDetail({
    runId: SUCCESS_RUN_ID,
    deps: {
      isDatabaseConfigured: () => true,
      execute: async (sql) => {
        if (sql.includes("seo_research_runs")) {
          return [
            runPacket({
              pipeline_run_status: "CONTEXT_ERROR",
              pipeline_error_code: "context_error",
              source: "autonomous",
            }),
          ];
        }
        return [
          decisionPacket({
            nba_autonomous_eligible: null,
            priority_score: null,
            priority_tier: null,
            priority_automation_selectable: null,
            rf_verdict: null,
            nba_action: null,
          }),
        ];
      },
    },
  });
  assert.equal(nullable.ok, true);
  if (nullable.ok) {
    assert.equal(nullable.run.source, "autonomous");
    assert.equal(nullable.run.pipelineRunStatus, "CONTEXT_ERROR");
    assert.equal(nullable.decisions[0]?.nbaAutonomousEligible, null);
    assert.equal(nullable.decisions[0]?.priorityScore, null);
    assert.equal(nullable.decisions[0]?.priorityAutomationSelectable, null);
  }

  // Non-finite priority_score must map to null (never NaN in UI).
  const nanScore = await getSeoResearchRunDetail({
    runId: SUCCESS_RUN_ID,
    deps: {
      isDatabaseConfigured: () => true,
      execute: async (sql) => {
        if (sql.includes("seo_research_runs")) return [runPacket()];
        return [decisionPacket({ priority_score: "not-a-number" })];
      },
    },
  });
  assert.equal(nanScore.ok, true);
  if (nanScore.ok) {
    assert.equal(nanScore.decisions[0]?.priorityScore, null);
  }

  const overflow = await getSeoResearchRunDetail({
    runId: SUCCESS_RUN_ID,
    deps: {
      isDatabaseConfigured: () => true,
      execute: async (sql) => {
        if (sql.includes("seo_research_runs")) return [runPacket()];
        return Array.from({ length: 6 }, (_, i) =>
          decisionPacket({
            id: `seodec_${i}aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
            opportunity_index: i,
          }),
        );
      },
    },
  });
  assert.equal(overflow.ok, true);
  if (overflow.ok) {
    assert.equal(overflow.decisionOverflow, true);
    assert.equal(overflow.decisions.length, 5);
  }
});

test("L3 UI renders successful and failed historical fixtures", () => {
  const successRun: SeoResearchRunRow = {
    id: SUCCESS_RUN_ID,
    createdAt: "2026-10-08 22:58:19",
    completedAt: "2026-10-08 22:58:36",
    source: "manual",
    actorAdminId: null,
    researchOk: true,
    researchErrorCode: null,
    pipelineRunStatus: "OK",
    pipelineVersion: "v1",
    pipelineErrorCode: null,
    opportunityCount: 2,
    gscStatus: "AVAILABLE",
    durabilityStatus: "COMPLETE",
  };
  const decisions: SeoOpportunityDecisionRow[] = [
    {
      id: "seodec_cec501e4-d530-4d9e-b2b9-7acf3212c5e9",
      runId: SUCCESS_RUN_ID,
      opportunityIndex: 0,
      opportunityIdentity: "abc",
      createdAt: "2026-10-08 22:58:19",
      topic: "Diagnosing buffering and Wi-Fi problems on Fire TV",
      workingTitle: "Firestick IPTV Buffering: Check the App, Wi-Fi and Device",
      researchRecommendation: "REFRESH_EXISTING",
      researchConfidence: "HIGH",
      existingCoverage: "STRONG",
      matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
      restorePath: "",
      targetPostId: "post-firestick",
      evaluationStatus: "OK",
      rfVerdict: "REFRESH_EXISTING",
      rfFingerprint: "rf0",
      nbaAction: "REFRESH_EXISTING",
      nbaStatus: "ACTIONABLE",
      nbaAutonomousEligible: false,
      nbaFingerprint: "nba0",
      priorityScore: 54,
      priorityTier: "MEDIUM",
      priorityScoreVersion: "v1",
      priorityAutomationSelectable: false,
      priorityFingerprint: "pri0",
      pipelineFingerprint: "pipe0",
      selected: false,
      selectionSource: "none",
    },
    {
      id: "seodec_f2463920-d552-470f-b1fd-e84edd982e8b",
      runId: SUCCESS_RUN_ID,
      opportunityIndex: 1,
      opportunityIdentity: "def",
      createdAt: "2026-10-08 22:58:19",
      topic: "Understanding streaming speed tests",
      workingTitle: "HD and 4K Streaming: Test Your Connection",
      researchRecommendation: "REFRESH_EXISTING",
      researchConfidence: "HIGH",
      existingCoverage: "STRONG",
      matchedPublicUrl: "/blogs/hd-vs-4k-streaming/",
      restorePath: "",
      targetPostId: "post-hd-4k",
      evaluationStatus: "OK",
      rfVerdict: "REFRESH_EXISTING",
      rfFingerprint: "rf1",
      nbaAction: "REFRESH_EXISTING",
      nbaStatus: "ACTIONABLE",
      nbaAutonomousEligible: false,
      nbaFingerprint: "nba1",
      priorityScore: 54,
      priorityTier: "MEDIUM",
      priorityScoreVersion: "v1",
      priorityAutomationSelectable: false,
      priorityFingerprint: "pri1",
      pipelineFingerprint: "pipe1",
      selected: false,
      selectionSource: "none",
    },
  ];

  const detailHtml = renderToStaticMarkup(
    createElement(SeoLedgerRunDetail, {
      run: successRun,
      decisions,
      decisionOverflow: false,
    }),
  );
  assert.match(detailHtml, /SUCCESS/);
  assert.match(detailHtml, /post-firestick/);
  assert.match(detailHtml, /post-hd-4k/);
  assert.match(detailHtml, /Opportunity index 0/);
  assert.match(detailHtml, /Opportunity index 1/);
  assert.match(detailHtml, /MEDIUM/);
  assert.match(detailHtml, />54</);
  assert.doesNotMatch(detailHtml, /\bRetry\b|\bProceed\b|\bPublish\b|Mark selected|Re-run Research/i);

  const failedHtml = renderToStaticMarkup(
    createElement(SeoLedgerRunDetail, {
      run: {
        ...successRun,
        id: FAILED_RUN_ID,
        researchOk: false,
        researchErrorCode: "invalid_response",
        pipelineRunStatus: "SKIPPED",
        opportunityCount: 0,
        gscStatus: null,
      },
      decisions: [],
    }),
  );
  assert.match(failedHtml, /FAILED/);
  assert.match(failedHtml, /invalid_response/);
  assert.match(failedHtml, /SKIPPED/);
  assert.match(failedHtml, /No decisions/);

  const nullableHtml = renderToStaticMarkup(
    createElement(SeoLedgerRunDetail, {
      run: successRun,
      decisions: [
        {
          ...decisions[0]!,
          nbaAutonomousEligible: null,
          priorityScore: null,
          priorityTier: null,
        },
      ],
    }),
  );
  assert.match(nullableHtml, /not evaluated/);
  assert.doesNotMatch(nullableHtml, /Priority score<\/dt><dd[^>]*>0</);

  const listOk = renderToStaticMarkup(
    createElement(SeoLedgerRunList, {
      state: { kind: "ok", runs: [successRun], nextCursor: null },
    }),
  );
  assert.match(listOk, /SUCCESS/);
  assert.match(listOk, /Open/);

  const listEmpty = renderToStaticMarkup(
    createElement(SeoLedgerRunList, { state: { kind: "empty" } }),
  );
  assert.match(listEmpty, /No Research history yet/);

  const listUnavailable = renderToStaticMarkup(
    createElement(SeoLedgerRunList, { state: { kind: "unavailable" } }),
  );
  assert.match(listUnavailable, /Ledger database unavailable/);

  const listExhausted = renderToStaticMarkup(
    createElement(SeoLedgerRunList, { state: { kind: "exhausted" } }),
  );
  assert.match(listExhausted, /No more Research runs on this page/);
  assert.doesNotMatch(listExhausted, /No Research history yet/);

  const nanScoreHtml = renderToStaticMarkup(
    createElement(SeoLedgerRunDetail, {
      run: successRun,
      decisions: [{ ...decisions[0]!, priorityScore: Number.NaN }],
    }),
  );
  assert.doesNotMatch(nanScoreHtml, />NaN</);

  // Unsafe stored URLs must not become clickable hrefs.
  const unsafeHtml = renderToStaticMarkup(
    createElement(SeoLedgerRunDetail, {
      run: successRun,
      decisions: [
        {
          ...decisions[0]!,
          matchedPublicUrl: "javascript:alert(1)",
          restorePath: "https://evil.example/path",
        },
      ],
    }),
  );
  assert.doesNotMatch(unsafeHtml, /href="javascript:/);
  assert.doesNotMatch(unsafeHtml, /href="https:\/\/evil\.example/);
});

test("L3 routes enforce SEO permission and stay read-only / private", () => {
  const listPage = read("app/sidhu/(protected)/seo/ledger/page.tsx");
  const detailPage = read("app/sidhu/(protected)/seo/ledger/[runId]/page.tsx");
  const reader = read("lib/cms/seo-experiment-ledger/read-mysql.ts");
  const nav = read("lib/cms/sidhu-seo-nav.ts");
  const protectedLayout = read("app/sidhu/(protected)/layout.tsx");

  assert.match(listPage, /requirePermission\(\"seo\"\)/);
  assert.match(detailPage, /requirePermission\(\"seo\"\)/);
  // Permission must run before any Ledger read (call sites, not imports).
  assert.ok(
    listPage.indexOf('await requirePermission("seo")') <
      listPage.indexOf("await listSeoResearchRuns"),
  );
  assert.ok(
    detailPage.indexOf('await requirePermission("seo")') <
      detailPage.indexOf("await getSeoResearchRunDetail"),
  );
  assert.match(protectedLayout, /requireAdminSession/);
  assert.match(protectedLayout, /permissionForSidhuPath/);
  assert.match(listPage, /force-dynamic/);
  assert.match(detailPage, /force-dynamic/);
  assert.match(listPage, /robots:\s*\{\s*index:\s*false/);
  assert.match(detailPage, /robots:\s*\{\s*index:\s*false/);
  assert.match(detailPage, /notFound\(/);
  assert.match(listPage, /kind:\s*"exhausted"/);
  assert.doesNotMatch(listPage, /insertResearchRun|researchUk|openai|gemini/i);
  assert.doesNotMatch(detailPage, /insertResearchRun|researchUk|Proceed|retry/i);

  assert.match(reader, /import \"server-only\"/);
  assert.match(reader, /SELECT/);
  assert.doesNotMatch(reader, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bALTER\b|\bDROP\b|\bTRUNCATE\b/i);
  assert.doesNotMatch(reader, /ensureSchema|mysql-migrate|openai|gemini|querySearchAnalytics/i);
  assert.match(reader, /gsc_status/);
  assert.match(reader, /Number\.isFinite/);

  assert.match(nav, /Experiment Ledger/);
  assert.match(nav, /\/sidhu\/seo\/ledger\//);
  assert.equal(permissionForSidhuPath("/sidhu/seo/ledger/"), "seo");
  assert.equal(permissionForSidhuPath("/sidhu/seo/ledger/seorun_x/"), "seo");

  const ledgerNav = SIDHU_SEO_NAV.find((item) => item.id === "ledger");
  assert.ok(ledgerNav);
  assert.equal(ledgerNav?.href, "/sidhu/seo/ledger/");
});

test("L3 does not mutate L1/L2 persistence modules", () => {
  const persist = read("lib/cms/seo-experiment-ledger/persist-mysql.ts");
  const attach = read("lib/cms/seo-experiment-ledger/attach-research-durability.ts");
  const map = read("lib/cms/seo-experiment-ledger/map.ts");
  assert.match(persist, /INSERT INTO seo_research_runs/);
  assert.match(attach, /attachLedgerDurabilityToResearchResult/);
  assert.match(attach, /bridgeResultToLedgerSnapshot/);
  assert.match(map, /mapResearchSnapshotToLedgerPlan/);
  assert.doesNotMatch(persist, /listSeoResearchRuns|getSeoResearchRunDetail/);
  assert.doesNotMatch(attach, /listSeoResearchRuns|getSeoResearchRunDetail/);
});
