import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  getGscConfig,
  getGscConfigStatus,
  isGscConfigured,
  isValidGscSiteUrl,
  normalizeGscPrivateKey,
  GSC_TIMEOUT_MS,
} from "../lib/cms/gsc/config";
import { getGscAccessToken, GSC_AUTH_SCOPE } from "../lib/cms/gsc/auth";
import {
  buildSearchAnalyticsBody,
  buildSearchAnalyticsUrl,
  mapSearchAnalyticsRows,
  querySearchAnalytics,
} from "../lib/cms/gsc/search-analytics";
import {
  GSC_READONLY_SCOPE,
  GSC_SEARCH_ANALYTICS_ENDPOINT_PREFIX,
} from "../lib/cms/gsc/types";

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

function configuredConfig(env = sampleEnv()) {
  return getGscConfig(env);
}

test("missing config reports NOT_CONFIGURED / configured=false safely", () => {
  assert.equal(isGscConfigured({}), false);
  assert.deepEqual(getGscConfigStatus({}), { configured: false });
  const config = getGscConfig({});
  assert.equal(config.configured, false);
  assert.equal(config.privateKey, "");
  assert.equal(config.clientEmail, "");
  assert.equal(config.siteUrl, "");
});

test("valid domain property accepted", () => {
  assert.equal(isValidGscSiteUrl("sc-domain:example.com"), true);
  assert.equal(isValidGscSiteUrl("sc-domain:theflixiptv.com"), true);
  assert.equal(isGscConfigured(sampleEnv({ GSC_SITE_URL: "sc-domain:example.com" })), true);
});

test("valid URL-prefix property accepted", () => {
  assert.equal(isValidGscSiteUrl("https://example.com/"), true);
  assert.equal(isValidGscSiteUrl("https://www.example.com/"), true);
  assert.equal(isValidGscSiteUrl("http://example.com/"), true);
  assert.equal(isGscConfigured(sampleEnv({ GSC_SITE_URL: "https://example.com/" })), true);
});

test("malformed property rejected", () => {
  assert.equal(isValidGscSiteUrl(""), false);
  assert.equal(isValidGscSiteUrl("example.com"), false);
  assert.equal(isValidGscSiteUrl("sc-domain:"), false);
  assert.equal(isValidGscSiteUrl("sc-domain:example.com/path"), false);
  assert.equal(isValidGscSiteUrl("javascript:alert(1)"), false);
  assert.equal(isValidGscSiteUrl("data:text/plain,hi"), false);
  assert.equal(isValidGscSiteUrl("ftp://example.com/"), false);
  assert.equal(isGscConfigured(sampleEnv({ GSC_SITE_URL: "not-a-property" })), false);
});

test("escaped \\\\n private key becomes server-side PEM newlines", () => {
  const normalized = normalizeGscPrivateKey(
    "-----BEGIN PRIVATE KEY-----\\nLINE1\\nLINE2\\n-----END PRIVATE KEY-----\\n",
  );
  assert.match(normalized, /BEGIN PRIVATE KEY-----\nLINE1\nLINE2\n-----END PRIVATE KEY-----\n/);
  const config = getGscConfig(sampleEnv());
  assert.match(config.privateKey, /\n/);
  assert.doesNotMatch(config.privateKey, /\\n/);
});

test("no config value exposed to client-facing structures", () => {
  const status = getGscConfigStatus(sampleEnv());
  assert.deepEqual(status, { configured: true });
  assert.equal(Object.keys(status).join(","), "configured");
  const statusJson = JSON.stringify(status);
  assert.doesNotMatch(statusJson, /PRIVATE KEY|gserviceaccount|example\.com|BEGIN/);
});

test("readonly scope only and configured credentials used", async () => {
  let seen: { clientEmail?: string; privateKey?: string; scopes?: string[] } = {};
  const result = await getGscAccessToken({
    config: configuredConfig(),
    createJwt: (args) => {
      seen = args;
      return {
        getAccessToken: async () => ({ token: "mock-access-token" }),
      };
    },
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value, "mock-access-token");
  assert.equal(seen.clientEmail, "gsc-reader@example-project.iam.gserviceaccount.com");
  assert.match(seen.privateKey || "", /BEGIN PRIVATE KEY/);
  assert.deepEqual(seen.scopes, [GSC_READONLY_SCOPE]);
  assert.equal(GSC_AUTH_SCOPE, "https://www.googleapis.com/auth/webmasters.readonly");
  assert.notEqual(seen.scopes?.[0], "https://www.googleapis.com/auth/webmasters");
});

test("project id optional", () => {
  const withProject = getGscConfig(sampleEnv({ GSC_PROJECT_ID: "proj" }));
  const withoutProject = getGscConfig(sampleEnv({ GSC_PROJECT_ID: "" }));
  assert.equal(withProject.configured, true);
  assert.equal(withProject.projectId, "proj");
  assert.equal(withoutProject.configured, true);
  assert.equal(withoutProject.projectId, "");
});

test("auth failure normalized without leaking secrets", async () => {
  const result = await getGscAccessToken({
    config: configuredConfig(),
    createJwt: () => ({
      getAccessToken: async () => {
        throw new Error("secret-token-response PRIVATE KEY bearer xyz");
      },
    }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "AUTH_FAILED");
    assert.doesNotMatch(result.message, /PRIVATE KEY|bearer xyz|secret-token/i);
  }
});

test("auth timeout normalized", async () => {
  const result = await getGscAccessToken({
    config: { ...configuredConfig(), timeoutMs: 20 },
    createJwt: () => ({
      getAccessToken: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { token: "late" };
      },
    }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "TIMEOUT");
});

test("exact Search Console endpoint, encoding, bearer, POST, bounded body", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const siteUrl = "https://example.com/";
  const result = await querySearchAnalytics(
    {
      startDate: "2026-01-01",
      endDate: "2026-01-28",
      dimensions: ["query", "page"],
      dimensionFilterGroups: [
        { filters: [{ dimension: "country", expression: "gbr" }] },
      ],
      rowLimit: 50,
      startRow: 0,
    },
    {
      config: configuredConfig(sampleEnv({ GSC_SITE_URL: siteUrl })),
      getAccessToken: async () => ({ ok: true, value: "token-abc" }),
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init || {} });
        return new Response(
          JSON.stringify({
            rows: [
              {
                keys: ["iptv firestick", "https://example.com/blogs/setup/"],
                clicks: 12,
                impressions: 400,
                ctr: 0.03,
                position: 8.5,
              },
            ],
            responseAggregationType: "byProperty",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `${GSC_SEARCH_ANALYTICS_ENDPOINT_PREFIX}${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
  );
  assert.equal(calls[0].init.method, "POST");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer token-abc");
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.dimensions, ["query", "page"]);
  assert.equal(body.rowLimit, 50);
  assert.equal(body.startDate, "2026-01-01");
  assert.equal(body.dimensionFilterGroups[0].filters[0].expression, "gbr");
  if (result.ok) {
    assert.equal(result.value.rows.length, 1);
    assert.equal(result.value.rows[0].clicks, 12);
    assert.equal(result.value.rows[0].impressions, 400);
    assert.equal(result.value.rows[0].ctr, 0.03);
    assert.equal(result.value.rows[0].position, 8.5);
  }
});

test("empty rows handled", () => {
  assert.deepEqual(mapSearchAnalyticsRows({}), { rows: [], responseAggregationType: undefined });
  assert.deepEqual(mapSearchAnalyticsRows({ rows: [] })?.rows, []);
});

test("403 / quota / malformed / timeout normalized; no retry", async () => {
  const cases: Array<{ status?: number; body?: string; abort?: boolean; code: string }> = [
    { status: 403, body: "{}", code: "PERMISSION_DENIED" },
    { status: 429, body: "{}", code: "QUOTA_OR_RATE_LIMIT" },
    { status: 200, body: "{not-json", code: "INVALID_RESPONSE" },
    { abort: true, code: "TIMEOUT" },
  ];

  for (const item of cases) {
    let calls = 0;
    const result = await querySearchAnalytics(
      { startDate: "2026-01-01", endDate: "2026-01-07", rowLimit: 10 },
      {
        config: { ...configuredConfig(), timeoutMs: 30 },
        getAccessToken: async () => ({ ok: true, value: "t" }),
        fetchImpl: async () => {
          calls += 1;
          if (item.abort) {
            const err = new Error("aborted");
            err.name = "AbortError";
            throw err;
          }
          return new Response(item.body, {
            status: item.status || 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, item.code);
    assert.equal(calls, 1);
    if (!result.ok) {
      assert.doesNotMatch(result.message, /Bearer |PRIVATE KEY|token-abc/i);
    }
  }
});

test("site URL encoded helper", () => {
  assert.equal(
    buildSearchAnalyticsUrl("sc-domain:example.com"),
    `${GSC_SEARCH_ANALYTICS_ENDPOINT_PREFIX}${encodeURIComponent("sc-domain:example.com")}/searchAnalytics/query`,
  );
});

test("request body rejects invalid dates and caps rowLimit", () => {
  assert.equal(buildSearchAnalyticsBody({ startDate: "bad", endDate: "2026-01-01" }), null);
  assert.equal(buildSearchAnalyticsBody({ startDate: "2026-02-01", endDate: "2026-01-01" }), null);
  const body = buildSearchAnalyticsBody({
    startDate: "2026-01-01",
    endDate: "2026-01-28",
    rowLimit: 99999,
    dimensions: ["query", "page", "hacked" as never],
  });
  assert.ok(body);
  assert.equal(body.rowLimit, 1000);
  assert.deepEqual(body.dimensions, ["query", "page"]);
});

test("security: GSC modules are server-only; no client imports or proxy routes", () => {
  const auth = read("lib/cms/gsc/auth.ts");
  const client = read("lib/cms/gsc/search-analytics.ts");
  assert.match(auth, /import ["']server-only["']/);
  assert.match(client, /import ["']server-only["']/);
  assert.match(auth, /google-auth-library/);
  assert.doesNotMatch(auth, /googleapis/);
  assert.doesNotMatch(client, /googleapis/);
  assert.match(auth, /webmasters\.readonly/);
  assert.doesNotMatch(auth, /auth\/webmasters"/);

  const envExample = read(".env.example");
  assert.match(envExample, /GSC_SITE_URL=/);
  assert.match(envExample, /GSC_CLIENT_EMAIL=/);
  assert.match(envExample, /GSC_PRIVATE_KEY=/);
  assert.match(envExample, /GSC_PROJECT_ID=/);
  assert.doesNotMatch(envExample, /GOOGLE_APPLICATION_CREDENTIALS/);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_GSC/);

  // Panel may import admin probe action/types only — not auth/analytics/config secrets.
  const panel = read("components/sidhu/SeoOpportunitiesPanel.tsx");
  assert.match(panel, /@\/lib\/cms\/gsc\/(probe-types|gsc-actions)/);
  assert.doesNotMatch(panel, /@\/lib\/cms\/gsc\/(auth|search-analytics|config|evidence-pack)/);
  assert.doesNotMatch(panel, /GSC_PRIVATE_KEY|getGscAccessToken|querySearchAnalytics/);
  assert.doesNotMatch(read("components/sidhu/SeoOverviewHub.tsx"), /lib\/cms\/gsc|@\/lib\/cms\/gsc/);

  const apiDir = path.join(root, "app/api");
  const walk = (dir: string): string[] => {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...walk(full));
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) files.push(full);
    }
    return files;
  };
  if (existsSync(apiDir)) {
    for (const file of walk(apiDir)) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /webmasters\/v3|searchAnalytics\/query|google-auth-library/);
    }
  }

  assert.ok(GSC_TIMEOUT_MS >= 5_000 && GSC_TIMEOUT_MS <= 30_000);
});

test("package dependency is google-auth-library only (no googleapis)", () => {
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
  };
  assert.ok(pkg.dependencies?.["google-auth-library"]);
  assert.equal(pkg.dependencies?.googleapis, undefined);
});
