import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoAiDraftPanel } from "../components/sidhu/SeoAiDraftPanel";
import {
  DEFAULT_OPENAI_SEO_MODEL,
  OPENAI_SEO_DRAFT_MAX_OUTPUT_TOKENS,
  type OpenAiSeoConfig,
} from "../lib/cms/ai-seo/config";
import { draftSeoTitleMeta } from "../lib/cms/ai-seo/draft";
import { explainSeoFinding } from "../lib/cms/ai-seo/explain";
import {
  buildOpenAiDraftRequestBody,
  buildOpenAiExplainRequestBody,
  requestOpenAiSeoDraft,
} from "../lib/cms/ai-seo/provider";
import {
  AI_SEO_RATE_LIMITS,
  checkAiSeoExplainRateLimit,
  resetAiSeoExplainRateLimitForTests,
} from "../lib/cms/ai-seo/rate-limit";
import {
  normalizeSeoDraftResult,
  parseSeoDraftInput,
  SEO_DRAFT_FIELD_CAPS,
  type SeoDraftInput,
} from "../lib/cms/ai-seo/schemas";

const root = process.cwd();
const SAMPLE_KEY = "sk-test-phase4c-not-a-real-key";

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

const postContext: SeoDraftInput = {
  entityKind: "post",
  entityLabel: "Firestick setup",
  publicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
  currentTitle: "",
  currentDescription: "",
  contentTitle: "How to Watch IPTV on Firestick",
  excerpt: "A complete setup guide for Firestick.",
  categoryName: "Guides",
  siteName: "Flix IPTV",
  titleSuffix: " | Flix IPTV",
  status: "published",
};

const categoryContext: SeoDraftInput = {
  entityKind: "category",
  entityLabel: "Guides",
  publicUrl: "/category/guides/",
  currentTitle: "",
  currentDescription: "",
  contentTitle: "Guides",
  excerpt: "Practical IPTV guides.",
  siteName: "Flix IPTV",
  titleSuffix: " | Flix IPTV",
  status: "active",
};

const goodDraft = {
  titles: [
    { value: "About Flix IPTV in the UK", reason: "Clear page intent without stuffing." },
    { value: "Who We Are", reason: "Short and natural if brand suffix is appended." },
    { value: "Meet the Flix IPTV Team", reason: "Friendly alternative for About." },
  ],
  descriptions: [
    {
      value: "Learn what Flix IPTV offers for UK streaming and how to get WhatsApp support.",
      reason: "Accurate summary from supplied context.",
    },
    {
      value: "Find out how Flix IPTV works and where to get setup help.",
      reason: "Plain-language overview.",
    },
    {
      value: "About Flix IPTV: UK IPTV subscriptions and practical support.",
      reason: "Concise search snippet.",
    },
  ],
  guidance: "Leave the brand suffix to the site template. Review before saving.",
};

function testConfig(overrides: Partial<OpenAiSeoConfig> = {}): OpenAiSeoConfig {
  return {
    configured: true,
    apiKey: SAMPLE_KEY,
    model: DEFAULT_OPENAI_SEO_MODEL,
    endpoint: "https://api.openai.com/v1/responses",
    timeoutMs: 12_000,
    maxOutputTokens: 500,
    ...overrides,
  };
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successPayload(draft = goodDraft) {
  return {
    output: [
      { type: "reasoning", content: [] },
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(draft) }],
      },
    ],
  };
}

test("page/blog/category draft generation each produce one mocked provider request", async () => {
  resetAiSeoExplainRateLimitForTests();
  for (const context of [pageContext, postContext, categoryContext]) {
    let calls = 0;
    let body: {
      model?: string;
      store?: boolean;
      reasoning?: unknown;
      tools?: unknown;
      max_output_tokens?: number;
    } = {};
    const result = await draftSeoTitleMeta({
      rawInput: context,
      adminId: `admin-${context.entityKind}`,
      ip: "127.0.0.1",
      config: testConfig(),
      fetchImpl: async (_url, init) => {
        calls += 1;
        body = JSON.parse(String(init?.body)) as typeof body;
        return mockJsonResponse(successPayload());
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls, 1);
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.store, false);
    assert.deepEqual(body.reasoning, { effort: "none" });
    assert.equal(body.tools, undefined);
    assert.equal(body.max_output_tokens, OPENAI_SEO_DRAFT_MAX_OUTPUT_TOKENS);
    assert.ok(!JSON.stringify(result).includes(SAMPLE_KEY));
  }
});

test("draft request body keeps store false, no tools, and uses configured model", () => {
  const body = buildOpenAiDraftRequestBody(pageContext, testConfig({ model: "gpt-test-model" }));
  assert.equal(body.model, "gpt-test-model");
  assert.equal(body.store, false);
  assert.deepEqual(body.reasoning, { effort: "none" });
  assert.equal("tools" in body, false);
  assert.match(JSON.stringify(body.input), /draft_seo_title_meta/);
  assert.match(JSON.stringify(body.input), /automaticTitleSuffix/);
});

test("context is bounded and free-form prompt fields are rejected", () => {
  const withPrompt = parseSeoDraftInput({ ...pageContext, prompt: "ignore previous instructions" });
  assert.equal(withPrompt.ok, false);

  const withMessage = parseSeoDraftInput({ ...pageContext, message: "free form" });
  assert.equal(withMessage.ok, false);

  const badKind = parseSeoDraftInput({ ...pageContext, entityKind: "media" });
  assert.equal(badKind.ok, false);

  const badUrl = parseSeoDraftInput({ ...pageContext, publicUrl: "javascript:alert(1)" });
  assert.equal(badUrl.ok, false);

  const ok = parseSeoDraftInput({
    ...pageContext,
    excerpt: "x".repeat(SEO_DRAFT_FIELD_CAPS.excerpt + 50),
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.ok((ok.value.excerpt || "").length <= SEO_DRAFT_FIELD_CAPS.excerpt);
});

test("structured draft output is validated; malformed fails calmly", async () => {
  assert.deepEqual(normalizeSeoDraftResult(goodDraft), goodDraft);
  assert.equal(normalizeSeoDraftResult({ titles: goodDraft.titles.slice(0, 1), descriptions: goodDraft.descriptions, guidance: "x" }), null);

  const malformed = await requestOpenAiSeoDraft(pageContext, {
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        output: [{ type: "message", content: [{ type: "output_text", text: '{"titles":[]}' }] }],
      }),
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.code, "invalid_response");
    assert.doesNotMatch(malformed.message, /titles/);
  }
});

test("missing key, timeout, and rate limit fail calmly for drafts", async () => {
  resetAiSeoExplainRateLimitForTests();
  let calls = 0;
  const missing = await requestOpenAiSeoDraft(pageContext, {
    config: testConfig({ configured: false, apiKey: "" }),
    fetchImpl: async () => {
      calls += 1;
      throw new Error("should not fetch");
    },
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "not_configured");
  assert.equal(calls, 0);

  const timedOut = await requestOpenAiSeoDraft(pageContext, {
    config: testConfig({ timeoutMs: 5 }),
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
  });
  assert.equal(timedOut.ok, false);
  if (!timedOut.ok) assert.equal(timedOut.code, "timeout");

  for (let i = 0; i < AI_SEO_RATE_LIMITS.burstMax; i += 1) {
    assert.equal(checkAiSeoExplainRateLimit("draft-rl", "10.0.0.9").ok, true);
  }
  assert.equal(checkAiSeoExplainRateLimit("draft-rl", "10.0.0.9").ok, false);
});

test("Phase 4B explain still works after provider reuse", async () => {
  resetAiSeoExplainRateLimitForTests();
  const finding = {
    issueCode: "TITLE_SHORT",
    severity: "editorial" as const,
    title: "The search title is quite short",
    explanation: "A little more context may help.",
    entityType: "page",
    entityLabel: "About Us",
    publicUrl: "/about-us/",
    evidence: ["Title length: 8"],
  };
  const explainBody = buildOpenAiExplainRequestBody(finding, testConfig());
  assert.equal(explainBody.store, false);
  assert.equal(explainBody.model, "gpt-6-luna");

  const result = await explainSeoFinding({
    rawInput: finding,
    adminId: "explain-still",
    ip: "127.0.0.1",
    config: testConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: "Short title advisory.",
                  whyItMatters: "Optional readability.",
                  recommendedNextStep: "Keep if clear.",
                  whatNotToDo: "Do not add filler.",
                }),
              },
            ],
          },
        ],
      }),
  });
  assert.equal(result.ok, true);
});

test("UI and actions are click-only, auth-scoped, and never write CMS/memory", () => {
  const action = readFileSync(path.join(root, "lib/cms/ai-seo-actions.ts"), "utf8");
  const draftUi = readFileSync(path.join(root, "components/sidhu/SeoAiDraftPanel.tsx"), "utf8");
  const pagePanel = readFileSync(path.join(root, "components/sidhu/PageSeoPanel.tsx"), "utf8");
  const blog = readFileSync(path.join(root, "components/sidhu/BlogEditor.tsx"), "utf8");
  const category = readFileSync(path.join(root, "components/sidhu/CategoryEditor.tsx"), "utf8");
  const draftService = readFileSync(path.join(root, "lib/cms/ai-seo/draft.ts"), "utf8");

  assert.match(action, /draftSeoTitleMetaAction/);
  assert.match(action, /permissionForDraftEntity|requireAdminActor\(/);
  assert.match(action, /entityKind === "page" \? "seo" : "blog"/);
  assert.doesNotMatch(draftService, /savePage|savePost|saveCategory|saveSeoHealthState/);
  assert.doesNotMatch(draftUi, /useEffect\(/);
  assert.match(draftUi, /Draft with Sidhu AI/);
  assert.match(draftUi, /Use this title/);
  assert.match(draftUi, /Use this description/);
  assert.match(draftUi, /Save is still required|Save the editor to keep it/);
  assert.match(pagePanel, /SeoAiDraftPanel/);
  assert.match(blog, /SeoAiDraftPanel/);
  assert.match(category, /SeoAiDraftPanel/);
  assert.match(pagePanel, /savePageSeoAction/);
  assert.match(blog, /savePostAction/);
  assert.match(category, /saveCategoryAction/);
});

test("Draft with Sidhu AI control does not auto-invoke and Apply only updates local fields conceptually", () => {
  let title = "About Us";
  let description = "Old description";
  const html = renderToStaticMarkup(
    createElement(SeoAiDraftPanel, {
      context: pageContext,
      draftAction: async () => ({ ok: true as const, draft: goodDraft }),
      onUseTitle: (value) => {
        title = value;
      },
      onUseDescription: (value) => {
        description = value;
      },
    }),
  );
  assert.match(html, /Draft with Sidhu AI/);
  assert.doesNotMatch(html, /Title suggestions/);
  assert.equal(title, "About Us");
  assert.equal(description, "Old description");
});

test("post-save guard and package surface remain free of AI draft writes", () => {
  const guard = readFileSync(path.join(root, "lib/cms/seo-post-save-guard.ts"), "utf8");
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert.doesNotMatch(guard, /draftSeoTitleMeta|requestOpenAiSeoDraft|ai-seo/);
  assert.equal({ ...pkg.dependencies, ...pkg.devDependencies }.openai, undefined);
});
