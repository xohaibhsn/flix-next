/**
 * GSC connection probe — admin acceptance diagnostic.
 * Mocks auth + Search Analytics. No real Google/OpenAI calls.
 */

import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { getGscConfig } from "../lib/cms/gsc/config";
import {
  buildGscProbeSearchAnalyticsRequest,
  GSC_PROBE_ROW_LIMIT,
  probeGscConnection,
} from "../lib/cms/gsc/probe";
import { GSC_UK_COUNTRY_EXPRESSION } from "../lib/cms/gsc/request-plan";
import { buildGscEvidenceDateWindows } from "../lib/cms/gsc/date-windows";
import type { GscSearchAnalyticsRequest } from "../lib/cms/gsc/types";
import { SeoOpportunitiesPanel } from "../components/sidhu/SeoOpportunitiesPanel";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function sampleEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    GSC_SITE_URL: "https://theflixiptv.com/",
    GSC_CLIENT_EMAIL: "gsc-reader@example-project.iam.gserviceaccount.com",
    GSC_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n",
    GSC_PROJECT_ID: "example-project",
    ...overrides,
  };
}

function utc(y: number, m: number, d: number, h = 12) {
  return new Date(Date.UTC(y, m - 1, d, h, 0, 0));
}

test("GSC probe NOT_CONFIGURED: zero auth and zero Search Analytics calls", async () => {
  let authCalls = 0;
  let analyticsCalls = 0;
  const result = await probeGscConnection({
    env: {},
    config: getGscConfig({}),
    getAccessToken: async () => {
      authCalls += 1;
      return { ok: true, value: "token" };
    },
    query: async () => {
      analyticsCalls += 1;
      return { ok: true, value: { rows: [] } };
    },
  });
  assert.equal(result.configured, false);
  assert.equal(result.authOk, false);
  assert.equal(result.analyticsOk, false);
  assert.equal(result.status, "NOT_CONFIGURED");
  assert.equal(authCalls, 0);
  assert.equal(analyticsCalls, 0);
  assert.ok(result.configChecks);
  assert.deepEqual(result.configChecks, {
    siteUrlPresent: false,
    siteUrlValid: false,
    clientEmailPresent: false,
    clientEmailValid: false,
    privateKeyPresent: false,
    privateKeyLooksPem: false,
    projectIdPresent: false,
  });
  assert.equal(
    Object.values(result.configChecks!).every((v) => typeof v === "boolean"),
    true,
  );
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE KEY|Bearer |access_token|client_email|GSC_SITE_URL/i);
});

test("GSC probe NOT_CONFIGURED: configChecks reflect which validation failed (booleans only)", async () => {
  let authCalls = 0;
  let analyticsCalls = 0;
  const env = sampleEnv({ GSC_SITE_URL: "not-a-property", GSC_PRIVATE_KEY: "plain-text" });
  const result = await probeGscConnection({
    env,
    getAccessToken: async () => {
      authCalls += 1;
      return { ok: true, value: "token" };
    },
    query: async () => {
      analyticsCalls += 1;
      return { ok: true, value: { rows: [] } };
    },
  });
  assert.equal(result.status, "NOT_CONFIGURED");
  assert.equal(authCalls, 0);
  assert.equal(analyticsCalls, 0);
  assert.equal(result.configChecks?.siteUrlPresent, true);
  assert.equal(result.configChecks?.siteUrlValid, false);
  assert.equal(result.configChecks?.privateKeyPresent, true);
  assert.equal(result.configChecks?.privateKeyLooksPem, false);
  assert.equal(result.configChecks?.clientEmailPresent, true);
  assert.equal(result.configChecks?.clientEmailValid, true);
  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /not-a-property|plain-text|PRIVATE KEY|gserviceaccount|theflixiptv/i);
  assert.doesNotMatch(json, /@example|BEGIN |access_token/i);
});

test("GSC probe success omits configChecks", async () => {
  const result = await probeGscConnection({
    env: sampleEnv(),
    getAccessToken: async () => ({ ok: true, value: "tok" }),
    query: async () => ({ ok: true, value: { rows: [] } }),
  });
  assert.equal(result.status, "NO_ROWS");
  assert.equal(result.configChecks, undefined);
});

test("GSC probe AUTH failure: sanitized, zero Search Analytics, no token leakage", async () => {
  let analyticsCalls = 0;
  let authCalls = 0;
  const result = await probeGscConnection({
    config: getGscConfig(sampleEnv()),
    getAccessToken: async () => {
      authCalls += 1;
      return { ok: false, code: "AUTH_FAILED", message: "secret stack TRACE token=abc" };
    },
    query: async () => {
      analyticsCalls += 1;
      return { ok: true, value: { rows: [] } };
    },
  });
  assert.equal(authCalls, 1);
  assert.equal(analyticsCalls, 0);
  assert.equal(result.configured, true);
  assert.equal(result.authOk, false);
  assert.equal(result.status, "AUTH_FAILED");
  assert.doesNotMatch(result.message, /TRACE|token=|PRIVATE/i);
  assert.doesNotMatch(JSON.stringify(result), /abc|PRIVATE KEY|client_email/i);
});

test("GSC probe success with one row: auth once, analytics once, factual metrics", async () => {
  const now = utc(2026, 10, 5);
  const windows = buildGscEvidenceDateWindows(now);
  let authCalls = 0;
  let analyticsCalls = 0;
  let seenRequest: GscSearchAnalyticsRequest | undefined;
  let tokenGetterCalls = 0;

  const result = await probeGscConnection({
    now,
    config: getGscConfig(sampleEnv()),
    getAccessToken: async () => {
      authCalls += 1;
      return { ok: true, value: "in-memory-token" };
    },
    query: async (request, options) => {
      analyticsCalls += 1;
      seenRequest = { ...request };
      assert.ok(options?.getAccessToken);
      const tok = await options!.getAccessToken!();
      tokenGetterCalls += 1;
      assert.equal(tok.ok, true);
      if (tok.ok) assert.equal(tok.value, "in-memory-token");
      return {
        ok: true,
        value: {
          rows: [
            {
              keys: ["iptv firestick setup"],
              clicks: 4,
              impressions: 120,
              ctr: 0.0333,
              position: 12.4,
            },
          ],
        },
      };
    },
  });

  assert.equal(authCalls, 1);
  assert.equal(analyticsCalls, 1);
  assert.equal(tokenGetterCalls, 1);
  assert.equal(result.status, "AVAILABLE");
  assert.equal(result.authOk, true);
  assert.equal(result.analyticsOk, true);
  assert.equal(result.rowCount, 1);
  assert.ok(seenRequest);
  assert.equal(seenRequest.rowLimit, GSC_PROBE_ROW_LIMIT);
  assert.equal(seenRequest.rowLimit, 1);
  assert.equal(seenRequest.startRow, 0);
  assert.deepEqual(seenRequest.dimensions, ["query"]);
  assert.equal(seenRequest.startDate, windows.recent.start);
  assert.equal(seenRequest.endDate, windows.recent.end);
  assert.deepEqual(seenRequest.dimensionFilterGroups?.[0]?.filters, [
    { dimension: "country", operator: "equals", expression: GSC_UK_COUNTRY_EXPRESSION },
  ]);
  assert.equal(result.sample?.query, "iptv firestick setup");
  assert.equal(result.sample?.clicks, 4);
  assert.equal(result.sample?.impressions, 120);
  assert.equal(result.sample?.ctr, 0.0333);
  assert.equal(result.sample?.position, 12.4);
  assert.doesNotMatch(JSON.stringify(result), /in-memory-token|PRIVATE KEY|client_email|GSC_SITE/i);
});

test("GSC probe success with zero rows: NO_ROWS, exactly one analytics call", async () => {
  let authCalls = 0;
  let analyticsCalls = 0;
  const result = await probeGscConnection({
    config: getGscConfig(sampleEnv()),
    getAccessToken: async () => {
      authCalls += 1;
      return { ok: true, value: "tok" };
    },
    query: async () => {
      analyticsCalls += 1;
      return { ok: true, value: { rows: [] } };
    },
  });
  assert.equal(authCalls, 1);
  assert.equal(analyticsCalls, 1);
  assert.equal(result.status, "NO_ROWS");
  assert.equal(result.rowCount, 0);
  assert.equal(result.sample, undefined);
  assert.match(result.message, /no UK rows/i);
});

test("GSC probe 403 / property / timeout sanitized with no retry", async () => {
  for (const [code, status] of [
    ["PERMISSION_DENIED", "PERMISSION_DENIED"],
    ["PROPERTY_NOT_FOUND", "PROPERTY_NOT_FOUND"],
    ["TIMEOUT", "TIMEOUT"],
  ] as const) {
    let analyticsCalls = 0;
    const result = await probeGscConnection({
      config: getGscConfig(sampleEnv()),
      getAccessToken: async () => ({ ok: true, value: "tok" }),
      query: async () => {
        analyticsCalls += 1;
        return {
          ok: false,
          code,
          message: `raw google body ${code} client_email=secret@x`,
        };
      },
    });
    assert.equal(analyticsCalls, 1, code);
    assert.equal(result.status, status, code);
    assert.equal(result.analyticsOk, false, code);
    assert.doesNotMatch(result.message, /client_email|raw google|secret@/i, code);
    assert.doesNotMatch(JSON.stringify(result), /secret@|PRIVATE/i, code);
  }
});

test("GSC probe request builder matches evidence recent window + UK filter", () => {
  const now = utc(2026, 10, 5);
  const windows = buildGscEvidenceDateWindows(now);
  const request = buildGscProbeSearchAnalyticsRequest(now);
  assert.equal(request.rowLimit, 1);
  assert.equal(request.startRow, 0);
  assert.equal(request.startDate, windows.recent.start);
  assert.equal(request.endDate, windows.recent.end);
  assert.deepEqual(request.dimensions, ["query"]);
  assert.equal(request.dimensionFilterGroups?.[0]?.filters[0]?.expression, "gbr");
});

test("GSC probe action requires SEO admin; no OpenAI; no persistence markers", () => {
  const actions = read("lib/cms/gsc/gsc-actions.ts");
  const probe = read("lib/cms/gsc/probe.ts");
  const panel = read("components/sidhu/SeoOpportunitiesPanel.tsx");
  const page = read("app/sidhu/(protected)/seo/opportunities/page.tsx");

  assert.match(actions, /requireAdminActor\("seo"\)/);
  assert.match(actions, /probeGscConnection/);
  assert.doesNotMatch(actions, /researchUk|web_search|requestOpenAi|OPENAI_/i);
  assert.doesNotMatch(probe, /web_search|requestOpenAi|OPENAI_|savePost|savePage|writeFile/i);
  assert.match(panel, /Test GSC connection/);
  assert.match(panel, /Configuration checks/);
  assert.match(panel, /Site URL present/);
  assert.match(panel, /Private key format recognized/);
  assert.match(panel, /Project ID present \(optional\)/);
  assert.match(panel, /gscProbeAction/);
  assert.doesNotMatch(panel, /GSC_PRIVATE_KEY|getGscAccessToken|querySearchAnalytics|process\.env|BEGIN PRIVATE/);
  assert.match(panel, /privateKeyPresent|privateKeyLooksPem/);
  assert.match(panel, /from ["']@\/lib\/cms\/gsc\/probe-types["']/);
  assert.match(panel, /from ["']@\/lib\/cms\/gsc\/gsc-actions["']/);
  assert.match(page, /probeGscConnectionAction/);
  assert.doesNotMatch(page, /useEffect\(/);

  const html = renderToStaticMarkup(
    createElement(SeoOpportunitiesPanel, {
      aiConfigured: true,
      researchAction: async () => ({
        ok: false as const,
        code: "unavailable" as const,
        error: "unused",
      }),
      gscProbeAction: async () => ({
        ok: false as const,
        code: "unauthorized" as const,
        error: "unused",
      }),
    }),
  );
  assert.match(html, /Test GSC connection/);
  assert.match(html, /Research UK opportunities/);
  assert.doesNotMatch(html, /GSC_PRIVATE|BEGIN PRIVATE|access_token/i);
});

test("GSC probe modules remain free of NEXT_PUBLIC credential exposure", () => {
  const files = [
    "lib/cms/gsc/probe.ts",
    "lib/cms/gsc/probe-types.ts",
    "lib/cms/gsc/gsc-actions.ts",
    "components/sidhu/SeoOpportunitiesPanel.tsx",
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /NEXT_PUBLIC_GSC|NEXT_PUBLIC_.*PRIVATE/i, file);
  }
});
