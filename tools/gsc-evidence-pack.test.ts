import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  GSC_EVIDENCE_WINDOW_DAYS,
  GSC_REPORTING_LAG_DAYS,
  addUtcDays,
  buildGscEvidenceDateWindows,
  formatUtcDate,
  inclusiveUtcDayCount,
  parseUtcDate,
} from "../lib/cms/gsc/date-windows";
import {
  compareGscPageByExactUrl,
  indexGscPagesByExactUrl,
} from "../lib/cms/gsc/compare-pages";
import { buildUkGscEvidencePack } from "../lib/cms/gsc/evidence-pack";
import {
  GSC_EVIDENCE_MAX_GOOGLE_CALLS,
  GSC_EVIDENCE_PREVIOUS_PAGES_LIMIT,
  GSC_EVIDENCE_RECENT_PAGES_LIMIT,
  GSC_EVIDENCE_RECENT_QUERIES_LIMIT,
  GSC_EVIDENCE_RECENT_QUERY_PAGES_LIMIT,
  GSC_UK_COUNTRY_CODE,
  GSC_UK_COUNTRY_EXPRESSION,
  buildGscEvidenceRequestPlan,
} from "../lib/cms/gsc/request-plan";
import { getGscConfig } from "../lib/cms/gsc/config";
import type { GscSearchAnalyticsRequest } from "../lib/cms/gsc/types";
import type { GscSearchAnalyticsRow } from "../lib/cms/gsc/types";
import type { GscSearchAnalyticsQuerier } from "../lib/cms/gsc/evidence-pack";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function sampleEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    GSC_SITE_URL: "sc-domain:example.com",
    GSC_CLIENT_EMAIL: "gsc-reader@example-project.iam.gserviceaccount.com",
    GSC_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n",
    GSC_PROJECT_ID: "example-project",
    ...overrides,
  };
}

function row(
  keys: string[],
  clicks: number,
  impressions: number,
  ctr: number,
  position: number,
): GscSearchAnalyticsRow {
  return { keys, clicks, impressions, ctr, position };
}

function utc(y: number, m: number, d: number, h = 12) {
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0));
}

function ukFilter(request: GscSearchAnalyticsRequest) {
  const groups = request.dimensionFilterGroups || [];
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].filters, [
    {
      dimension: "country",
      operator: "equals",
      expression: GSC_UK_COUNTRY_EXPRESSION,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Date windows
// ---------------------------------------------------------------------------

test("GSC-2 date windows use UTC and fixed 3-day lag", () => {
  // Fixed "now" with a non-midnight local-ish hour must not affect UTC calendar windows.
  const now = utc(2026, 10, 5, 23);
  const windows = buildGscEvidenceDateWindows(now);

  assert.equal(windows.reportingLagDays, 3);
  assert.equal(windows.reportingLagDays, GSC_REPORTING_LAG_DAYS);
  assert.equal(windows.windowDays, 28);
  assert.equal(windows.windowDays, GSC_EVIDENCE_WINDOW_DAYS);
  assert.equal(windows.lagCutoff, "2026-10-02");
  assert.equal(formatUtcDate(now), "2026-10-05");
  assert.equal(parseUtcDate("2026-10-05").getUTCHours(), 0);
});

test("GSC-2 recent window is exactly 28 complete days ending at lag cutoff", () => {
  const windows = buildGscEvidenceDateWindows(utc(2026, 10, 5));
  assert.equal(windows.recent.end, "2026-10-02");
  assert.equal(windows.recent.start, "2026-09-05");
  assert.equal(inclusiveUtcDayCount(windows.recent.start, windows.recent.end), 28);
});

test("GSC-2 previous window is the immediately preceding 28 days and does not overlap", () => {
  const windows = buildGscEvidenceDateWindows(utc(2026, 10, 5));
  assert.equal(windows.previous.end, "2026-09-04");
  assert.equal(windows.previous.start, "2026-08-08");
  assert.equal(inclusiveUtcDayCount(windows.previous.start, windows.previous.end), 28);

  // Contiguous, non-overlapping: previousEnd + 1 day === recentStart
  const prevEnd = parseUtcDate(windows.previous.end);
  const recentStart = parseUtcDate(windows.recent.start);
  assert.equal(formatUtcDate(addUtcDays(prevEnd, 1)), windows.recent.start);
  assert.ok(prevEnd.getTime() < recentStart.getTime());
});

test("GSC-2 excludes today's incomplete data from both windows", () => {
  const now = utc(2026, 3, 15, 8);
  const windows = buildGscEvidenceDateWindows(now);
  const today = "2026-03-15";
  assert.ok(windows.recent.end < today);
  assert.ok(windows.previous.end < today);
  assert.notEqual(windows.recent.end, today);
  assert.equal(windows.lagCutoff, "2026-03-12");
});

test("GSC-2 date windows cross month and year boundaries correctly", () => {
  // 2026-01-02 → lagCutoff 2025-12-30 → recent includes Dec/Jan boundary
  const jan = buildGscEvidenceDateWindows(utc(2026, 1, 2));
  assert.equal(jan.lagCutoff, "2025-12-30");
  assert.equal(jan.recent.end, "2025-12-30");
  assert.equal(jan.recent.start, "2025-12-03");
  assert.equal(jan.previous.end, "2025-12-02");
  assert.equal(jan.previous.start, "2025-11-05");
  assert.equal(inclusiveUtcDayCount(jan.recent.start, jan.recent.end), 28);
  assert.equal(inclusiveUtcDayCount(jan.previous.start, jan.previous.end), 28);

  // Leap-year March boundary
  const mar = buildGscEvidenceDateWindows(utc(2024, 3, 5));
  assert.equal(mar.lagCutoff, "2024-03-02");
  assert.equal(mar.recent.start, "2024-02-04");
  assert.equal(inclusiveUtcDayCount(mar.recent.start, mar.recent.end), 28);
});

// ---------------------------------------------------------------------------
// Request plan
// ---------------------------------------------------------------------------

test("GSC-2 request plan is exactly four UK-filtered calls with fixed limits", () => {
  const plan = buildGscEvidenceRequestPlan(utc(2026, 10, 5));
  assert.equal(plan.calls.length, GSC_EVIDENCE_MAX_GOOGLE_CALLS);
  assert.equal(plan.calls.length, 4);
  assert.equal(plan.country.code, GSC_UK_COUNTRY_CODE);
  assert.equal(plan.country.expression, GSC_UK_COUNTRY_EXPRESSION);

  const [queries, pages, queryPages, previousPages] = plan.calls;
  assert.equal(queries.id, "RECENT_QUERIES");
  assert.deepEqual(queries.request.dimensions, ["query"]);
  assert.equal(queries.request.rowLimit, GSC_EVIDENCE_RECENT_QUERIES_LIMIT);
  assert.equal(queries.request.rowLimit, 50);
  assert.equal(queries.request.startDate, plan.windows.recent.start);
  assert.equal(queries.request.endDate, plan.windows.recent.end);
  assert.equal(queries.request.startRow, 0);
  ukFilter(queries.request);

  assert.equal(pages.id, "RECENT_PAGES");
  assert.deepEqual(pages.request.dimensions, ["page"]);
  assert.equal(pages.request.rowLimit, 50);
  assert.equal(pages.request.startDate, plan.windows.recent.start);
  assert.equal(pages.request.endDate, plan.windows.recent.end);
  ukFilter(pages.request);

  assert.equal(queryPages.id, "RECENT_QUERY_PAGES");
  assert.deepEqual(queryPages.request.dimensions, ["query", "page"]);
  assert.equal(queryPages.request.rowLimit, 100);
  assert.equal(queryPages.request.rowLimit, GSC_EVIDENCE_RECENT_QUERY_PAGES_LIMIT);
  ukFilter(queryPages.request);

  assert.equal(previousPages.id, "PREVIOUS_PAGES");
  assert.deepEqual(previousPages.request.dimensions, ["page"]);
  assert.equal(previousPages.request.rowLimit, 50);
  assert.equal(previousPages.request.rowLimit, GSC_EVIDENCE_PREVIOUS_PAGES_LIMIT);
  assert.equal(previousPages.request.startDate, plan.windows.previous.start);
  assert.equal(previousPages.request.endDate, plan.windows.previous.end);
  ukFilter(previousPages.request);

  // No pagination knobs beyond startRow 0
  for (const call of plan.calls) {
    assert.equal(call.request.startRow, 0);
    assert.ok((call.request.rowLimit || 0) <= 100);
  }
});

// ---------------------------------------------------------------------------
// Evidence builder + status + resource safety
// ---------------------------------------------------------------------------

test("GSC-2 missing config → NOT_CONFIGURED and zero Google calls", async () => {
  let calls = 0;
  const query: GscSearchAnalyticsQuerier = async () => {
    calls += 1;
    return { ok: true, value: { rows: [] } };
  };

  const pack = await buildUkGscEvidencePack({
    now: utc(2026, 10, 5),
    config: getGscConfig({}),
    query,
  });

  assert.equal(pack.status, "NOT_CONFIGURED");
  assert.equal(calls, 0);
  assert.equal(pack.recentQueries.length, 0);
  assert.equal(pack.country.expression, "gbr");
  assert.equal(pack.window.reportingLagDays, 3);
  assert.doesNotMatch(JSON.stringify(pack), /PRIVATE KEY|Bearer |gserviceaccount/i);
});

test("GSC-2 successful empty datasets → NO_ROWS with exactly 4 calls", async () => {
  const seen: GscSearchAnalyticsRequest[] = [];
  const query: GscSearchAnalyticsQuerier = async (request) => {
    seen.push(request);
    return { ok: true, value: { rows: [] } };
  };

  const pack = await buildUkGscEvidencePack({
    now: utc(2026, 10, 5),
    config: getGscConfig(sampleEnv()),
    query,
  });

  assert.equal(pack.status, "NO_ROWS");
  assert.equal(seen.length, 4);
  assert.equal(seen.length, GSC_EVIDENCE_MAX_GOOGLE_CALLS);
  assert.ok(pack.message);
  assert.doesNotMatch(pack.message || "", /stack|PRIVATE KEY|token/i);

  assert.deepEqual(
    seen.map((r) => r.dimensions?.join(",")),
    ["query", "page", "query,page", "page"],
  );
  assert.deepEqual(
    seen.map((r) => r.rowLimit),
    [50, 50, 100, 50],
  );
  for (const request of seen) {
    ukFilter(request);
    assert.equal(request.startRow, 0);
  }
});

test("GSC-2 metrics pass through unchanged with window/country metadata", async () => {
  const recentQuery = row(["iptv uk"], 12, 400, 0.03, 8.25);
  const recentPage = row(["https://example.com/welcome/"], 9, 300, 0.03, 7.1);
  const recentQp = row(["iptv uk", "https://example.com/welcome/"], 5, 120, 0.0416667, 6.5);
  const previousPage = row(["https://example.com/welcome/"], 4, 200, 0.02, 9.0);

  const byDims = new Map<string, GscSearchAnalyticsRow[]>([
    ["query", [recentQuery]],
    ["page|recent", [recentPage]],
    ["query,page", [recentQp]],
    ["page|previous", [previousPage]],
  ]);

  let calls = 0;
  const query: GscSearchAnalyticsQuerier = async (request) => {
    calls += 1;
    const dims = (request.dimensions || []).join(",");
    const key =
      dims === "page"
        ? request.startDate.startsWith("2026-08")
          ? "page|previous"
          : "page|recent"
        : dims;
    return { ok: true, value: { rows: byDims.get(key) || [] } };
  };

  const pack = await buildUkGscEvidencePack({
    now: utc(2026, 10, 5),
    config: getGscConfig(sampleEnv()),
    query,
  });

  assert.equal(pack.status, "AVAILABLE");
  assert.equal(calls, 4);
  assert.deepEqual(pack.recentQueries[0], recentQuery);
  assert.deepEqual(pack.recentPages[0], recentPage);
  assert.deepEqual(pack.recentQueryPages[0], recentQp);
  assert.deepEqual(pack.previousPages[0], previousPage);
  assert.equal(pack.recentQueries[0].ctr, 0.03);
  assert.equal(pack.recentQueryPages[0].ctr, 0.0416667);
  assert.equal(pack.window.recentStart, "2026-09-05");
  assert.equal(pack.window.recentEnd, "2026-10-02");
  assert.equal(pack.window.previousStart, "2026-08-08");
  assert.equal(pack.window.previousEnd, "2026-09-04");
  assert.equal(pack.country.code, "GB");
  assert.equal(pack.country.expression, "gbr");
  assert.equal("seoScore" in pack, false);
  assert.doesNotMatch(JSON.stringify(pack), /seoScore|overallScore/);
});

test("GSC-2 hard-bounds oversized Google row arrays at the evidence layer", async () => {
  const manyQueries = Array.from({ length: 80 }, (_, i) =>
    row([`q-${i}`], i, i * 10, 0.1, 5),
  );
  const manyPages = Array.from({ length: 80 }, (_, i) =>
    row([`https://example.com/p-${i}/`], i, i * 10, 0.1, 5),
  );
  const manyQp = Array.from({ length: 150 }, (_, i) =>
    row([`q-${i}`, `https://example.com/p-${i}/`], i, i * 10, 0.1, 5),
  );

  const query: GscSearchAnalyticsQuerier = async (request) => {
    const dims = (request.dimensions || []).join(",");
    if (dims === "query") return { ok: true, value: { rows: manyQueries } };
    if (dims === "query,page") return { ok: true, value: { rows: manyQp } };
    if (dims === "page" && request.startDate.startsWith("2026-08")) {
      return { ok: true, value: { rows: manyPages } };
    }
    return { ok: true, value: { rows: manyPages } };
  };

  const pack = await buildUkGscEvidencePack({
    now: utc(2026, 10, 5),
    config: getGscConfig(sampleEnv()),
    query,
  });

  assert.equal(pack.status, "AVAILABLE");
  assert.equal(pack.recentQueries.length, GSC_EVIDENCE_RECENT_QUERIES_LIMIT);
  assert.equal(pack.recentPages.length, GSC_EVIDENCE_RECENT_PAGES_LIMIT);
  assert.equal(pack.recentQueryPages.length, GSC_EVIDENCE_RECENT_QUERY_PAGES_LIMIT);
  assert.equal(pack.previousPages.length, GSC_EVIDENCE_PREVIOUS_PAGES_LIMIT);
});

test("GSC-2 API/auth failure → UNAVAILABLE without leaking raw errors", async () => {
  let calls = 0;
  const query: GscSearchAnalyticsQuerier = async () => {
    calls += 1;
    return {
      ok: false,
      code: "AUTH_FAILED",
      message: "Google Search Console authentication failed.",
    };
  };

  const pack = await buildUkGscEvidencePack({
    now: utc(2026, 10, 5),
    config: getGscConfig(sampleEnv()),
    query,
  });

  assert.equal(pack.status, "UNAVAILABLE");
  assert.equal(calls, 1); // stops at first failure; no retries
  assert.equal(pack.recentQueries.length, 0);
  assert.doesNotMatch(JSON.stringify(pack), /PRIVATE KEY|Bearer |eyJ|token-abc|stack/i);
});

test("GSC-2 one of four calls failing → UNAVAILABLE (no partial mix)", async () => {
  let calls = 0;
  const query: GscSearchAnalyticsQuerier = async (request) => {
    calls += 1;
    if ((request.dimensions || []).join(",") === "query,page") {
      return {
        ok: false,
        code: "GOOGLE_UNAVAILABLE",
        message: "Google Search Console is temporarily unavailable.",
      };
    }
    return {
      ok: true,
      value: { rows: [row(["https://example.com/"], 1, 10, 0.1, 4)] },
    };
  };

  const pack = await buildUkGscEvidencePack({
    now: utc(2026, 10, 5),
    config: getGscConfig(sampleEnv()),
    query,
  });

  assert.equal(pack.status, "UNAVAILABLE");
  assert.equal(calls, 3); // fails on 3rd planned call; no 4th, no retry
  assert.equal(pack.recentPages.length, 0);
  assert.equal(pack.recentQueryPages.length, 0);
  assert.equal(pack.previousPages.length, 0);
});

test("GSC-2 does not retry failed Google calls", async () => {
  let calls = 0;
  const query: GscSearchAnalyticsQuerier = async () => {
    calls += 1;
    return {
      ok: false,
      code: "TIMEOUT",
      message: "Google Search Console request timed out.",
    };
  };

  await buildUkGscEvidencePack({
    now: utc(2026, 10, 5),
    config: getGscConfig(sampleEnv()),
    query,
  });

  assert.equal(calls, 1);
});

// ---------------------------------------------------------------------------
// Page comparison
// ---------------------------------------------------------------------------

test("GSC-2 page comparison matches exact raw URL only and handles position direction", () => {
  const recent = row(["https://example.com/welcome/"], 10, 100, 0.1, 5.0);
  const previousSame = row(["https://example.com/welcome/"], 4, 80, 0.05, 8.0);
  const previousOther = row(["https://example.com/welcome"], 99, 99, 0.99, 1.0); // trailing slash differs
  const previousIndex = indexGscPagesByExactUrl([previousSame, previousOther]);

  assert.equal(previousIndex.get("https://example.com/welcome/")?.clicks, 4);
  assert.equal(previousIndex.has("https://example.com/welcome"), true);

  const matched = compareGscPageByExactUrl(recent, [previousOther, previousSame]);
  assert.equal(matched.matched, true);
  assert.equal(matched.pageUrl, "https://example.com/welcome/");
  assert.equal(matched.clickDelta, 6);
  assert.equal(matched.impressionDelta, 20);
  assert.equal(matched.ctrDelta, 0.05);
  assert.equal(matched.positionDelta, -3);
  assert.equal(matched.clicksDirection, "UP");
  assert.equal(matched.impressionsDirection, "UP");
  assert.equal(matched.ctrDirection, "UP");
  // Lower average position is improvement
  assert.equal(matched.positionDirection, "UP");

  const worsePosition = compareGscPageByExactUrl(
    row(["https://example.com/welcome/"], 10, 100, 0.1, 12.0),
    [previousSame],
  );
  assert.equal(worsePosition.positionDirection, "DOWN");
  assert.equal(worsePosition.positionDelta, 4);

  const flat = compareGscPageByExactUrl(previousSame, [previousSame]);
  assert.equal(flat.clicksDirection, "FLAT");
  assert.equal(flat.positionDirection, "FLAT");

  const unmatched = compareGscPageByExactUrl(
    row(["https://example.com/new-page/"], 1, 10, 0.1, 3),
    [previousSame],
  );
  assert.equal(unmatched.matched, false);
  assert.equal(unmatched.clickDelta, null);
  assert.equal(unmatched.positionDirection, null);
  // Documented assumption: absence ≠ zero demand
  assert.equal(unmatched.previous, null);

  assert.equal("seoScore" in matched, false);
});

// ---------------------------------------------------------------------------
// Resource / boundary safety
// ---------------------------------------------------------------------------

test("GSC-2 resource safety: no OpenAI, CMS, persistence, timers, or real network in module sources", () => {
  const files = [
    "lib/cms/gsc/date-windows.ts",
    "lib/cms/gsc/request-plan.ts",
    "lib/cms/gsc/compare-pages.ts",
    "lib/cms/gsc/evidence-types.ts",
    "lib/cms/gsc/evidence-pack.ts",
  ];

  for (const file of files) {
    const source = read(file);
    // Strip block/line comments before import/API scans so documentation cannot false-positive.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.doesNotMatch(code, /openai|OpenAI|chat\.completions/i);
    assert.doesNotMatch(code, /from ["']@\/lib\/cms\/(pages|posts|blog|media|redirects|users|messages)/);
    assert.doesNotMatch(code, /prisma|mysql2|CREATE TABLE|INSERT INTO|site_settings|writeFile|readFileSync/);
    assert.doesNotMatch(code, /setInterval|setTimeout\(|cron|node-cron/);
    assert.doesNotMatch(code, /googleapis/);
  }

  const pack = read("lib/cms/gsc/evidence-pack.ts");
  assert.match(pack, /import ["']server-only["']/);
  assert.match(pack, /querySearchAnalytics/);
  assert.doesNotMatch(pack, /startRow:\s*[1-9]/);
  assert.doesNotMatch(pack, /for\s*\(.*startRow/);
});

test("GSC-2 does not wire into Opportunities / UI / API routes", () => {
  for (const file of [
    "components/sidhu/SeoOpportunitiesPanel.tsx",
    "components/sidhu/SeoOverviewHub.tsx",
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /evidence-pack|buildUkGscEvidencePack|request-plan|compare-pages/);
    assert.doesNotMatch(source, /lib\/cms\/gsc|@\/lib\/cms\/gsc/);
  }

  const apiDir = path.join(root, "app/api");
  const walk = (dir: string): string[] => {
    if (!existsSync(dir)) return [];
    const entries = readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...walk(full));
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(full);
    }
    return files;
  };
  for (const file of walk(apiDir)) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /buildUkGscEvidencePack|evidence-pack/);
  }
});

test("GSC-2 documents absence-from-bounded-result ≠ no search demand", () => {
  const types = read("lib/cms/gsc/evidence-types.ts");
  const compare = read("lib/cms/gsc/compare-pages.ts");
  assert.match(types, /not present in this bounded result/i);
  assert.match(types, /not ["']no search demand["']/i);
  assert.match(compare, /not present in this bounded result/i);
});
