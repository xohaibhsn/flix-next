import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoAiDraftPanel } from "../components/sidhu/SeoAiDraftPanel";
import { SeoHealthAiExplain } from "../components/sidhu/SeoHealthAiExplain";
import {
  DEFAULT_OPENAI_SEO_MODEL,
  getGeminiSeoConfig,
  getOpenAiSeoConfig,
  getOpenAiSeoResearchConfig,
  getSeoAiProviderAvailability,
  isGeminiSeoConfigured,
  isOpenAiSeoConfigured,
  type GeminiSeoConfig,
  type OpenAiSeoConfig,
} from "../lib/cms/ai-seo/config";
import { draftSeoTitleMeta } from "../lib/cms/ai-seo/draft";
import { explainSeoFinding } from "../lib/cms/ai-seo/explain";
import {
  buildGeminiDraftRequestBody,
  buildGeminiExplainRequestBody,
  extractGeminiGenerateContentText,
  requestGeminiSeoDraft,
  requestGeminiSeoExplanation,
} from "../lib/cms/ai-seo/gemini-provider";
import {
  parseSeoAiProviderRequest,
  seoAiProviderLabel,
  type SeoAiProvider,
} from "../lib/cms/ai-seo/provider-type";
import {
  buildOpenAiDraftRequestBody,
  buildOpenAiExplainRequestBody,
  buildSeoDraftUserPayload,
  buildSeoExplainUserPayload,
  requestOpenAiSeoDraft,
  requestOpenAiSeoExplanation,
} from "../lib/cms/ai-seo/provider";
import {
  AI_SEO_RATE_LIMITS,
  checkAiSeoExplainRateLimit,
  resetAiSeoExplainRateLimitForTests,
} from "../lib/cms/ai-seo/rate-limit";
import {
  normalizeSeoDraftResult,
  normalizeSeoExplainResult,
  toSeoExplainFindingInput,
  type SeoDraftInput,
  type SeoExplainFindingInput,
} from "../lib/cms/ai-seo/schemas";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import type { SeoHealthFinding } from "../lib/cms/seo-health";

const root = process.cwd();
const SAMPLE_OPENAI_KEY = "sk-test-dual-provider-openai-not-real";
const SAMPLE_GEMINI_KEY = "AIzaSy-test-dual-provider-gemini-not-real";

const sampleFinding: SeoExplainFindingInput = {
  issueCode: "MISSING_META_DESCRIPTION",
  severity: "needs-attention",
  title: "Search description is missing",
  explanation: "This page has no meta description for search results.",
  entityType: "page",
  entityLabel: "Contact",
  publicUrl: "/contact/",
  evidence: ["meta description length: 0"],
  field: "description",
  siteName: "Flix IPTV",
};

const goodExplanation = {
  summary: "The page is missing a search description.",
  whyItMatters: "Search results may show a less helpful snippet.",
  recommendedNextStep: "Add a clear one-sentence description in the page SEO fields.",
  whatNotToDo: "Do not pack the description with repeated keywords.",
};

const pageContext: SeoDraftInput = {
  entityKind: "page",
  entityLabel: "About Us",
  publicUrl: "/about-us/",
  currentTitle: "About Us",
  currentDescription: "Learn about Flix IPTV.",
  contentTitle: "About Us",
  siteName: "Flix IPTV",
  titleSuffix: " | Flix IPTV",
};

const goodDraft = {
  titles: [
    { value: "About Flix IPTV", reason: "Clear brand focus." },
    { value: "Who We Are | Flix IPTV", reason: "Natural brand cue." },
    { value: "About Our IPTV Service", reason: "Service clarity." },
  ],
  descriptions: [
    { value: "Learn what Flix IPTV offers and how support works.", reason: "Plain benefit." },
    { value: "Discover Flix IPTV features, plans, and reliable support.", reason: "Coverage." },
    { value: "About Flix IPTV — streaming options with helpful support.", reason: "Balanced." },
  ],
  guidance: "Keep titles short and avoid keyword stuffing.",
};

function openaiConfig(overrides: Partial<OpenAiSeoConfig> = {}): OpenAiSeoConfig {
  return {
    configured: true,
    apiKey: SAMPLE_OPENAI_KEY,
    model: DEFAULT_OPENAI_SEO_MODEL,
    endpoint: "https://api.openai.com/v1/responses",
    timeoutMs: 12_000,
    maxOutputTokens: 500,
    ...overrides,
  };
}

function geminiConfig(overrides: Partial<GeminiSeoConfig> = {}): GeminiSeoConfig {
  const model = overrides.model ?? "gemini-seo-test-model";
  return {
    configured: true,
    apiKey: SAMPLE_GEMINI_KEY,
    model,
    endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    timeoutMs: 12_000,
    maxOutputTokens: 500,
    draftMaxOutputTokens: 1200,
    ...overrides,
  };
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function openAiSuccessPayload(json: unknown) {
  return {
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(json) }],
      },
    ],
  };
}

function geminiSuccessPayload(json: unknown) {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify(json) }],
        },
      },
    ],
  };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(vars)) {
    previous.set(key, process.env[key]);
    const next = vars[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("CONFIG: Gemini SEO requires key + GEMINI_SEO_MODEL; empty model unavailable", () => {
  withEnv(
    {
      GEMINI_API_KEY: SAMPLE_GEMINI_KEY,
      GEMINI_SEO_MODEL: "",
      GEMINI_BLOG_PROMPT_MODEL: "should-not-count",
    },
    () => {
      assert.equal(isGeminiSeoConfigured(), false);
      const config = getGeminiSeoConfig();
      assert.equal(config.configured, false);
      assert.equal(config.model, "");
      assert.equal(config.endpoint, "");
    },
  );

  withEnv(
    {
      GEMINI_API_KEY: SAMPLE_GEMINI_KEY,
      GEMINI_SEO_MODEL: "gemini-seo-configured",
    },
    () => {
      assert.equal(isGeminiSeoConfigured(), true);
      const config = getGeminiSeoConfig();
      assert.equal(config.configured, true);
      assert.equal(config.model, "gemini-seo-configured");
      assert.match(config.endpoint, /gemini-seo-configured:generateContent$/);
      assert.doesNotMatch(config.endpoint, /key=|AIza/);
    },
  );
});

test("CONFIG: availability helper exposes only safe booleans; no key leakage", () => {
  withEnv(
    {
      OPENAI_API_KEY: SAMPLE_OPENAI_KEY,
      OPENAI_SEO_MODEL: "gpt-test",
      GEMINI_API_KEY: SAMPLE_GEMINI_KEY,
      GEMINI_SEO_MODEL: "gemini-test",
    },
    () => {
      const availability = getSeoAiProviderAvailability();
      assert.deepEqual(availability, { openaiConfigured: true, geminiConfigured: true });
      assert.equal(JSON.stringify(availability).includes(SAMPLE_OPENAI_KEY), false);
      assert.equal(JSON.stringify(availability).includes(SAMPLE_GEMINI_KEY), false);
      assert.doesNotMatch(JSON.stringify(availability), /gpt-test|gemini-test|endpoint|apiKey/);
    },
  );

  withEnv(
    {
      OPENAI_API_KEY: "",
      GEMINI_API_KEY: SAMPLE_GEMINI_KEY,
      GEMINI_SEO_MODEL: "gemini-only",
    },
    () => {
      assert.deepEqual(getSeoAiProviderAvailability(), {
        openaiConfigured: false,
        geminiConfigured: true,
      });
    },
  );
});

test("CONFIG: OpenAI SEO + research config behavior unchanged", () => {
  withEnv(
    {
      OPENAI_API_KEY: SAMPLE_OPENAI_KEY,
      OPENAI_SEO_MODEL: "gpt-seo-main",
      OPENAI_SEO_RESEARCH_MODEL: "",
    },
    () => {
      assert.equal(isOpenAiSeoConfigured(), true);
      assert.equal(getOpenAiSeoConfig().model, "gpt-seo-main");
      assert.equal(getOpenAiSeoResearchConfig().model, "gpt-seo-main");
    },
  );
  withEnv(
    {
      OPENAI_API_KEY: SAMPLE_OPENAI_KEY,
      OPENAI_SEO_MODEL: "gpt-seo-main",
      OPENAI_SEO_RESEARCH_MODEL: "gpt-research-only",
    },
    () => {
      assert.equal(getOpenAiSeoConfig().model, "gpt-seo-main");
      assert.equal(getOpenAiSeoResearchConfig().model, "gpt-research-only");
    },
  );
});

test("PROVIDER VALIDATION: accepts gemini/openai; rejects invalid and forbidden config fields", () => {
  assert.equal(parseSeoAiProviderRequest({ provider: "gemini", issueCode: "X" }).ok, true);
  assert.equal(parseSeoAiProviderRequest({ provider: "openai", issueCode: "X" }).ok, true);
  assert.equal(parseSeoAiProviderRequest({ provider: "claude" }).ok, false);
  assert.equal(parseSeoAiProviderRequest({ issueCode: "X" }).ok, false);
  assert.equal(parseSeoAiProviderRequest({ provider: "openai", apiKey: "secret" }).ok, false);
  assert.equal(parseSeoAiProviderRequest({ provider: "openai", model: "x" }).ok, false);
  assert.equal(parseSeoAiProviderRequest({ provider: "openai", endpoint: "https://evil" }).ok, false);
  assert.equal(seoAiProviderLabel("gemini"), "Gemini");
  assert.equal(seoAiProviderLabel("openai"), "OpenAI");
});

test("SERVICE: explainSeoFinding rejects invalid provider with zero fetches and zero limiter use", async () => {
  resetAiSeoExplainRateLimitForTests();
  let calls = 0;
  const result = await explainSeoFinding({
    provider: "claude" as SeoAiProvider,
    rawInput: sampleFinding,
    adminId: "svc-invalid-explain",
    ip: "10.8.8.1",
    config: openaiConfig(),
    geminiConfig: geminiConfig(),
    fetchImpl: async () => {
      calls += 1;
      throw new Error("should not fetch");
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "invalid_input");
    assert.equal(result.error, "Choose Gemini or OpenAI.");
  }
  assert.equal(calls, 0);
  for (let i = 0; i < AI_SEO_RATE_LIMITS.burstMax; i += 1) {
    assert.equal(checkAiSeoExplainRateLimit("svc-invalid-explain", "10.8.8.1").ok, true);
  }
});

test("SERVICE: draftSeoTitleMeta rejects invalid provider with zero fetches and zero limiter use", async () => {
  resetAiSeoExplainRateLimitForTests();
  let calls = 0;
  const result = await draftSeoTitleMeta({
    provider: "claude" as SeoAiProvider,
    rawInput: pageContext,
    adminId: "svc-invalid-draft",
    ip: "10.8.8.2",
    config: openaiConfig(),
    geminiConfig: geminiConfig(),
    fetchImpl: async () => {
      calls += 1;
      throw new Error("should not fetch");
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "invalid_input");
    assert.equal(result.error, "Choose Gemini or OpenAI.");
  }
  assert.equal(calls, 0);
  for (let i = 0; i < AI_SEO_RATE_LIMITS.burstMax; i += 1) {
    assert.equal(checkAiSeoExplainRateLimit("svc-invalid-draft", "10.8.8.2").ok, true);
  }
});

test("EXPLAIN: Gemini and OpenAI share bounded payload and normalize to SeoExplainResult", async () => {
  resetAiSeoExplainRateLimitForTests();
  const openAiPayload = buildSeoExplainUserPayload(sampleFinding);
  const geminiBody = buildGeminiExplainRequestBody(sampleFinding, geminiConfig());
  const openAiBody = buildOpenAiExplainRequestBody(sampleFinding, openaiConfig());
  assert.deepEqual(JSON.parse(geminiBody.contents[0].parts[0].text as string), openAiPayload);
  const openAiUserText = (openAiBody as { input: Array<{ content: Array<{ text: string }> }> }).input[1]
    .content[0].text;
  assert.deepEqual(JSON.parse(openAiUserText), openAiPayload);
  assert.equal(geminiBody.generationConfig.responseFormat.text.mimeType, "application/json");
  assert.ok(geminiBody.generationConfig.responseFormat.text.schema);
  assert.equal((geminiBody as { responseSchema?: unknown }).responseSchema, undefined);

  let openAiCalls = 0;
  let geminiCalls = 0;
  const openAiResult = await explainSeoFinding({
    provider: "openai",
    rawInput: sampleFinding,
    adminId: "dual-explain-openai",
    ip: "127.0.0.1",
    config: openaiConfig(),
    fetchImpl: async (url, init) => {
      openAiCalls += 1;
      assert.match(String(url), /api\.openai\.com/);
      assert.match(String(init?.headers && (init.headers as Record<string, string>).Authorization), /^Bearer /);
      assert.doesNotMatch(String(url), /generativelanguage|AIza/);
      return mockJsonResponse(openAiSuccessPayload(goodExplanation));
    },
  });
  assert.equal(openAiResult.ok, true);
  if (openAiResult.ok) {
    assert.equal(openAiResult.provider, "openai");
    assert.deepEqual(openAiResult.explanation, normalizeSeoExplainResult(goodExplanation));
  }

  const geminiResult = await explainSeoFinding({
    provider: "gemini",
    rawInput: sampleFinding,
    adminId: "dual-explain-gemini",
    ip: "127.0.0.2",
    geminiConfig: geminiConfig(),
    fetchImpl: async (url, init) => {
      geminiCalls += 1;
      assert.match(String(url), /generativelanguage\.googleapis\.com/);
      assert.doesNotMatch(String(url), /key=|AIza/);
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers["x-goog-api-key"], SAMPLE_GEMINI_KEY);
      assert.equal(headers.Authorization, undefined);
      return mockJsonResponse(geminiSuccessPayload(goodExplanation));
    },
  });
  assert.equal(geminiResult.ok, true);
  if (geminiResult.ok) {
    assert.equal(geminiResult.provider, "gemini");
    assert.deepEqual(geminiResult.explanation, normalizeSeoExplainResult(goodExplanation));
  }
  assert.equal(openAiCalls, 1);
  assert.equal(geminiCalls, 1);
});

test("EXPLAIN: Gemini failure never calls OpenAI; OpenAI failure never calls Gemini", async () => {
  resetAiSeoExplainRateLimitForTests();
  let openAiCalls = 0;
  let geminiCalls = 0;
  const geminiFail = await explainSeoFinding({
    provider: "gemini",
    rawInput: sampleFinding,
    adminId: "no-fallback-g",
    ip: "10.0.0.1",
    geminiConfig: geminiConfig(),
    fetchImpl: async (url) => {
      if (String(url).includes("openai")) openAiCalls += 1;
      else geminiCalls += 1;
      return mockJsonResponse({ error: { message: "boom" } }, 500);
    },
  });
  assert.equal(geminiFail.ok, false);
  assert.equal(geminiCalls, 1);
  assert.equal(openAiCalls, 0);

  const openAiFail = await explainSeoFinding({
    provider: "openai",
    rawInput: sampleFinding,
    adminId: "no-fallback-o",
    ip: "10.0.0.2",
    config: openaiConfig(),
    fetchImpl: async (url) => {
      if (String(url).includes("generativelanguage")) geminiCalls += 1;
      else openAiCalls += 1;
      return mockJsonResponse({ error: { message: "boom" } }, 500);
    },
  });
  assert.equal(openAiFail.ok, false);
  assert.equal(openAiCalls, 1);
  assert.equal(geminiCalls, 1);
});

test("EXPLAIN: Gemini timeout and rate limit stay calm without retries", async () => {
  resetAiSeoExplainRateLimitForTests();
  let calls = 0;
  const timedOut = await requestGeminiSeoExplanation(sampleFinding, {
    config: geminiConfig({ timeoutMs: 5 }),
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        calls += 1;
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
  });
  assert.equal(timedOut.ok, false);
  if (!timedOut.ok) assert.equal(timedOut.code, "timeout");
  assert.equal(calls, 1);

  for (let i = 0; i < AI_SEO_RATE_LIMITS.burstMax; i += 1) {
    assert.equal(checkAiSeoExplainRateLimit("dual-rl", "10.9.9.9").ok, true);
  }
  const limited = await explainSeoFinding({
    provider: "gemini",
    rawInput: sampleFinding,
    adminId: "dual-rl",
    ip: "10.9.9.9",
    geminiConfig: geminiConfig(),
    fetchImpl: async () => {
      throw new Error("should not fetch when rate limited");
    },
  });
  assert.equal(limited.ok, false);
  if (!limited.ok) assert.equal(limited.code, "rate_limited");
});

test("DRAFT: Gemini and OpenAI share logical draft input and normalize to SeoDraftResult", async () => {
  resetAiSeoExplainRateLimitForTests();
  const shared = buildSeoDraftUserPayload(pageContext);
  const geminiBody = buildGeminiDraftRequestBody(pageContext, geminiConfig());
  const openAiBody = buildOpenAiDraftRequestBody(pageContext, openaiConfig());
  assert.deepEqual(JSON.parse(geminiBody.contents[0].parts[0].text as string), shared);
  const openAiUserText = (openAiBody as { input: Array<{ content: Array<{ text: string }> }> }).input[1]
    .content[0].text;
  assert.deepEqual(JSON.parse(openAiUserText), shared);

  let openAiCalls = 0;
  let geminiCalls = 0;
  const openAiResult = await draftSeoTitleMeta({
    provider: "openai",
    rawInput: pageContext,
    adminId: "dual-draft-o",
    ip: "127.0.0.1",
    config: openaiConfig(),
    fetchImpl: async () => {
      openAiCalls += 1;
      return mockJsonResponse(openAiSuccessPayload(goodDraft));
    },
  });
  assert.equal(openAiResult.ok, true);
  if (openAiResult.ok) {
    assert.equal(openAiResult.provider, "openai");
    assert.deepEqual(openAiResult.draft, normalizeSeoDraftResult(goodDraft));
  }

  const geminiResult = await draftSeoTitleMeta({
    provider: "gemini",
    rawInput: pageContext,
    adminId: "dual-draft-g",
    ip: "127.0.0.2",
    geminiConfig: geminiConfig(),
    fetchImpl: async () => {
      geminiCalls += 1;
      return mockJsonResponse(geminiSuccessPayload(goodDraft));
    },
  });
  assert.equal(geminiResult.ok, true);
  if (geminiResult.ok) {
    assert.equal(geminiResult.provider, "gemini");
    assert.deepEqual(geminiResult.draft, normalizeSeoDraftResult(goodDraft));
  }
  assert.equal(openAiCalls, 1);
  assert.equal(geminiCalls, 1);
});

test("DRAFT: failure never falls back; draft modules do not save CMS", async () => {
  resetAiSeoExplainRateLimitForTests();
  let openAiCalls = 0;
  const failed = await draftSeoTitleMeta({
    provider: "gemini",
    rawInput: pageContext,
    adminId: "draft-no-fallback",
    ip: "10.1.1.1",
    geminiConfig: geminiConfig(),
    fetchImpl: async (url) => {
      if (String(url).includes("openai")) openAiCalls += 1;
      return mockJsonResponse({}, 503);
    },
  });
  assert.equal(failed.ok, false);
  assert.equal(openAiCalls, 0);

  const sources = [
    "lib/cms/ai-seo/draft.ts",
    "lib/cms/ai-seo/gemini-provider.ts",
    "lib/cms/ai-seo-actions.ts",
    "components/sidhu/SeoAiDraftPanel.tsx",
  ];
  for (const rel of sources) {
    const src = readFileSync(path.join(root, rel), "utf8");
    assert.doesNotMatch(src, /\b(?:savePage|savePost|saveCategory|updatePost|updatePage)\b/);
    assert.doesNotMatch(src, /saveSeoHealthState/);
  }
});

test("UI: Explain and Draft show explicit provider choice, labels, and no ambiguous regenerate", () => {
  const finding: SeoHealthFinding = {
    id: "f1",
    source: "metadata",
    issueCode: "MISSING_META_DESCRIPTION",
    category: "search-preview",
    severity: "editorial",
    entity: { type: "page", id: "1", label: "Contact" },
    publicUrl: "/contact/",
    title: "Search description is missing",
    explanation: "Add a description when ready.",
    evidence: ["length: 0"],
    reviewHref: "/sidhu/pages/1/",
    detailHref: "/sidhu/seo/metadata-diagnostics/",
    action: "suggested",
  };

  const explainHtml = renderToStaticMarkup(
    createElement(SeoHealthAiExplain, {
      openaiConfigured: true,
      geminiConfigured: true,
      finding: toSeoExplainFindingInput(finding),
    }),
  );
  assert.match(explainHtml, /Explain with Gemini/);
  assert.match(explainHtml, /Explain with OpenAI/);
  assert.doesNotMatch(explainHtml, /Explain with Sidhu AI/);
  assert.doesNotMatch(explainHtml, /Sidhu AI explanation/);

  const draftSrc = readFileSync(path.join(root, "components/sidhu/SeoAiDraftPanel.tsx"), "utf8");
  assert.match(draftSrc, /Draft with Gemini/);
  assert.match(draftSrc, /Draft with OpenAI/);
  assert.match(draftSrc, /Generated with/);
  assert.match(draftSrc, /Generate again with Gemini/);
  assert.match(draftSrc, /Generate again with OpenAI/);
  assert.doesNotMatch(draftSrc, /another AI request/);
  assert.match(draftSrc, /disabled=\{pending/);
  assert.doesNotMatch(draftSrc, /useEffect\([\s\S]{0,200}draftAction\(/);

  const draftHtml = renderToStaticMarkup(
    createElement(SeoAiDraftPanel, {
      openaiConfigured: false,
      geminiConfigured: true,
      context: pageContext,
      draftAction: async () => ({ ok: true as const, draft: goodDraft, provider: "gemini" as const }),
      onUseTitle: () => undefined,
      onUseDescription: () => undefined,
    }),
  );
  assert.match(draftHtml, /Ask Sidhu AI/);
  assert.doesNotMatch(draftHtml, /role="dialog"/);
});

test("RESEARCH REGRESSION: Opportunities remains OpenAI-only with web_search", () => {
  const research = readFileSync(path.join(root, "lib/cms/ai-seo/research.ts"), "utf8");
  const researchRun = readFileSync(path.join(root, "lib/cms/ai-seo/research-run.ts"), "utf8");
  const provider = readFileSync(path.join(root, "lib/cms/ai-seo/provider.ts"), "utf8");
  const actions = readFileSync(path.join(root, "lib/cms/ai-seo-actions.ts"), "utf8");
  const opportunitiesUi = readFileSync(path.join(root, "components/sidhu/SeoOpportunitiesPanel.tsx"), "utf8");
  const opportunitiesPage = readFileSync(
    path.join(root, "app/sidhu/(protected)/seo/opportunities/page.tsx"),
    "utf8",
  );

  assert.doesNotMatch(research, /gemini|Gemini|requestGemini/);
  assert.doesNotMatch(researchRun, /gemini|Gemini|requestGemini/);
  assert.match(provider, /web_search/);
  assert.match(provider, /requestOpenAiUkOpportunityResearch|buildOpenAiUkOpportunityResearchRequestBody/);
  assert.match(actions, /researchUkContentOpportunitiesAction/);
  assert.doesNotMatch(actions, /researchUkContentOpportunitiesAction[\s\S]{0,400}gemini/);
  assert.doesNotMatch(opportunitiesUi, /Gemini|Draft with Gemini|Explain with Gemini/);
  assert.match(opportunitiesPage, /isOpenAiSeoConfigured/);
  assert.doesNotMatch(opportunitiesPage, /isGeminiSeoConfigured|getSeoAiProviderAvailability/);
});

test("SECURITY: keys stay server-only; no raw provider payload exposure helpers for clients", () => {
  const clientFiles = [
    "components/sidhu/SeoHealthAiExplain.tsx",
    "components/sidhu/SeoAiDraftPanel.tsx",
    "components/sidhu/SeoHealthReport.tsx",
  ];
  for (const rel of clientFiles) {
    const src = readFileSync(path.join(root, rel), "utf8");
    assert.doesNotMatch(src, /GEMINI_API_KEY|getOpenAiSeoConfig|getGeminiSeoConfig|process\.env/);
    assert.doesNotMatch(src, /from ["']@\/lib\/cms\/ai-seo\/(?:config|provider|gemini-provider)["']/);
  }
  const opportunitiesUi = readFileSync(path.join(root, "components/sidhu/SeoOpportunitiesPanel.tsx"), "utf8");
  assert.doesNotMatch(opportunitiesUi, /from ["']@\/lib\/cms\/ai-seo\/(?:config|provider|gemini-provider)["']/);
  assert.doesNotMatch(opportunitiesUi, /process\.env|getOpenAiSeoConfig|getGeminiSeoConfig|GEMINI_API_KEY/);

  const geminiProvider = readFileSync(path.join(root, "lib/cms/ai-seo/gemini-provider.ts"), "utf8");
  assert.match(geminiProvider, /x-goog-api-key/);
  assert.doesNotMatch(geminiProvider, /\?key=/);
  assert.match(geminiProvider, /extractGeminiGenerateContentText/);
  assert.equal(extractGeminiGenerateContentText(geminiSuccessPayload({ a: 1 })), JSON.stringify({ a: 1 }));

  const envExample = readFileSync(path.join(root, ".env.example"), "utf8");
  assert.match(envExample, /^GEMINI_API_KEY=$/m);
  assert.match(envExample, /^GEMINI_SEO_MODEL=$/m);
  assert.match(envExample, /GEMINI_BLOG_PROMPT_MODEL/);
  assert.doesNotMatch(envExample, /AIza|sk-[a-zA-Z0-9]{10,}/);
});

test("RESOURCE + SCHEMA: no render calls; no dual/retry/poll; schema remains 3", () => {
  const explainUi = readFileSync(path.join(root, "components/sidhu/SeoHealthAiExplain.tsx"), "utf8");
  const draftUi = readFileSync(path.join(root, "components/sidhu/SeoAiDraftPanel.tsx"), "utf8");
  const gemini = readFileSync(path.join(root, "lib/cms/ai-seo/gemini-provider.ts"), "utf8");
  const openAi = readFileSync(path.join(root, "lib/cms/ai-seo/provider.ts"), "utf8");

  assert.doesNotMatch(explainUi, /useEffect\(/);
  assert.match(draftUi, /function openDrawer/);
  assert.doesNotMatch(draftUi, /openDrawer[\s\S]{0,80}runDraft\(/);
  assert.doesNotMatch(gemini, /\bretry\b|setInterval|setTimeout\(\s*\(\)\s*=>\s*request/);
  assert.doesNotMatch(openAi, /\bretry\b/);
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 3);
  assert.doesNotMatch(readFileSync(path.join(root, "lib/db/schema.ts"), "utf8"), /CURRENT_CMS_SCHEMA_VERSION\s*=\s*4/);
  assert.doesNotMatch(
    readFileSync(path.join(root, "db/cms-schema.sql"), "utf8"),
    /gemini|openai_seo|writing_brief/i,
  );

  const providers: SeoAiProvider[] = ["gemini", "openai"];
  assert.deepEqual(providers, ["gemini", "openai"]);
});

test("direct provider helpers: OpenAI explain/draft still work independently", async () => {
  const explain = await requestOpenAiSeoExplanation(sampleFinding, {
    config: openaiConfig(),
    fetchImpl: async () => mockJsonResponse(openAiSuccessPayload(goodExplanation)),
  });
  assert.equal(explain.ok, true);

  const draft = await requestOpenAiSeoDraft(pageContext, {
    config: openaiConfig(),
    fetchImpl: async () => mockJsonResponse(openAiSuccessPayload(goodDraft)),
  });
  assert.equal(draft.ok, true);

  const geminiDraft = await requestGeminiSeoDraft(pageContext, {
    config: geminiConfig({ configured: false, apiKey: "", model: "", endpoint: "" }),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(geminiDraft.ok, false);
  if (!geminiDraft.ok) assert.equal(geminiDraft.code, "not_configured");
});
