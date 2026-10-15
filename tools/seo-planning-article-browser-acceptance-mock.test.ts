/**
 * A1.2-B mock gate + A1.3-S fail-closed mock/live isolation — no network, no DB.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { OPENAI_RESPONSES_ENDPOINT } from "../lib/cms/ai-seo/config";
import {
  BLOG_ARTICLE_MOCK_ISOLATION_MESSAGES,
  BROWSER_ACCEPTANCE_SAFE_ARTICLE,
  browserAcceptanceMockFetch,
  evaluateBlogArticleMockIsolation,
  getBrowserAcceptanceMockState,
  isBrowserAcceptanceMockEnabled,
  resetBrowserAcceptanceMockState,
  resolveBlogArticleFetchImpl,
  SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV,
} from "../lib/cms/ai-seo/blog-article-browser-acceptance-mock";
import { normalizeGeneratedArticle } from "../lib/cms/ai-seo/blog-article-openai";

const SYNTHETIC_KEY = "sk-test-a12b-browser-acceptance-not-real";
const REAL_LOOKING_KEY = "sk-proj-fake-real-shape-not-a-live-secret";

test("mock disabled outside explicit local acceptance env", () => {
  assert.equal(
    isBrowserAcceptanceMockEnabled({
      NODE_ENV: "development",
      OPENAI_API_KEY: "sk-test-a12b",
    }),
    false,
  );
  assert.equal(
    isBrowserAcceptanceMockEnabled({
      NODE_ENV: "production",
      [SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV]: "1",
      OPENAI_API_KEY: "sk-test-a12b",
    }),
    false,
  );
  assert.equal(
    isBrowserAcceptanceMockEnabled({
      NODE_ENV: "development",
      [SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV]: "1",
      OPENAI_API_KEY: "sk-live-not-allowed",
    }),
    false,
  );
  assert.equal(
    isBrowserAcceptanceMockEnabled({
      NODE_ENV: "development",
      [SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV]: "1",
      OPENAI_API_KEY: "sk-test-a12b-browser-acceptance-not-real",
    }),
    true,
  );
});

test("mock fetch answers approved endpoint locally and blocks other AI hosts", async () => {
  resetBrowserAcceptanceMockState();
  process.env[SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV] = "1";
  process.env.SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_FIXTURE = "safe";

  const ok = await browserAcceptanceMockFetch(OPENAI_RESPONSES_ENDPOINT, { method: "POST" });
  assert.equal(ok.status, 200);
  const payload = await ok.json();
  const text = payload.output[0].content[0].text;
  assert.equal(JSON.parse(text).title, BROWSER_ACCEPTANCE_SAFE_ARTICLE.title);
  assert.equal(getBrowserAcceptanceMockState().requestCount, 1);

  await assert.rejects(
    () => browserAcceptanceMockFetch("https://api.openai.com/v1/chat/completions", { method: "POST" }),
    /blocked external AI request/,
  );
  assert.equal(getBrowserAcceptanceMockState().externalBlockedCount, 1);

  const article = normalizeGeneratedArticle(BROWSER_ACCEPTANCE_SAFE_ARTICLE);
  assert.ok(article);
  assert.equal(article!.title, BROWSER_ACCEPTANCE_SAFE_ARTICLE.title);
});

test("resolveBlogArticleFetchImpl prefers explicit inject and otherwise uses mock when gated", () => {
  const explicit = (async () => new Response("{}")) as typeof fetch;
  assert.equal(
    resolveBlogArticleFetchImpl(explicit, {
      NODE_ENV: "development",
      [SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV]: "1",
      OPENAI_API_KEY: "sk-test-a12b",
    }),
    explicit,
  );
  assert.equal(
    resolveBlogArticleFetchImpl(undefined, {
      NODE_ENV: "development",
      OPENAI_API_KEY: "sk-test-a12b",
    }),
    undefined,
  );
  assert.equal(
    resolveBlogArticleFetchImpl(undefined, {
      NODE_ENV: "development",
      [SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV]: "1",
      OPENAI_API_KEY: "sk-test-a12b",
    }),
    browserAcceptanceMockFetch,
  );
});

test("A1.3-S isolation: mock ON + synthetic + development → mock fetch", () => {
  const result = evaluateBlogArticleMockIsolation({
    apiKey: SYNTHETIC_KEY,
    env: {
      NODE_ENV: "development",
      [SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV]: "1",
      OPENAI_API_KEY: SYNTHETIC_KEY,
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fetchImpl, browserAcceptanceMockFetch);
});

test("A1.3-S isolation: mock ON + real-looking key → reject before network", () => {
  const result = evaluateBlogArticleMockIsolation({
    apiKey: REAL_LOOKING_KEY,
    env: {
      NODE_ENV: "development",
      [SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV]: "1",
      OPENAI_API_KEY: REAL_LOOKING_KEY,
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "not_configured");
  assert.equal(result.message, BLOG_ARTICLE_MOCK_ISOLATION_MESSAGES.mockRequiresSynthetic);
  assert.doesNotMatch(result.message, /sk-|Bearer|api\.openai/i);
  assert.doesNotMatch(JSON.stringify(result), /sk-proj|LIVE|secret/i);
});

test("A1.3-S isolation: mock OFF + synthetic without inject → reject before network", () => {
  const result = evaluateBlogArticleMockIsolation({
    apiKey: SYNTHETIC_KEY,
    env: {
      NODE_ENV: "development",
      OPENAI_API_KEY: SYNTHETIC_KEY,
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "not_configured");
  assert.equal(result.message, BLOG_ARTICLE_MOCK_ISOLATION_MESSAGES.syntheticWithoutMock);
});

test("A1.3-S isolation: mock ON + production → reject before network", () => {
  const result = evaluateBlogArticleMockIsolation({
    apiKey: SYNTHETIC_KEY,
    env: {
      NODE_ENV: "production",
      [SEO_AI_ARTICLE_BROWSER_ACCEPTANCE_MOCK_ENV]: "1",
      OPENAI_API_KEY: SYNTHETIC_KEY,
    },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "not_configured");
  assert.equal(result.message, BLOG_ARTICLE_MOCK_ISOLATION_MESSAGES.productionMock);
});

test("A1.3-S isolation: mock OFF + real-looking key + explicit inject → allow inject", () => {
  const explicit = (async () => new Response("{}")) as typeof fetch;
  const result = evaluateBlogArticleMockIsolation({
    apiKey: REAL_LOOKING_KEY,
    explicitFetch: explicit,
    env: {
      NODE_ENV: "development",
      OPENAI_API_KEY: REAL_LOOKING_KEY,
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fetchImpl, explicit);
});

test("A1.3-S isolation: mock OFF + synthetic + explicit inject → allow test transport", () => {
  const explicit = (async () => new Response("{}")) as typeof fetch;
  const result = evaluateBlogArticleMockIsolation({
    apiKey: SYNTHETIC_KEY,
    explicitFetch: explicit,
    env: { NODE_ENV: "development" },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.fetchImpl, explicit);
});
