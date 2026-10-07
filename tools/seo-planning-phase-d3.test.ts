/**
 * Phase D3 — OpenAI ChatGPT writing-prompt generation.
 * No live provider calls.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  CHATGPT_WRITING_PROMPT_MAX_CHARS,
  DEFAULT_OPENAI_SEO_MODEL,
  OPENAI_BLOG_PROMPT_MAX_OUTPUT_TOKENS,
  OPENAI_BLOG_PROMPT_TIMEOUT_MS,
  OPENAI_RESPONSES_ENDPOINT,
  getOpenAiBlogPromptConfig,
  getOpenAiSeoConfig,
  getOpenAiSeoResearchConfig,
  isOpenAiBlogPromptConfigured,
  type OpenAiBlogPromptConfig,
} from "../lib/cms/ai-seo/config";
import { normalizeChatgptWritingPromptResult } from "../lib/cms/ai-seo/blog-prompt-gemini";
import {
  BLOG_PROMPT_OPENAI_JSON_SCHEMA,
  BLOG_PROMPT_OPENAI_SCHEMA_NAME,
  buildOpenAiBlogPromptRequestBody,
  requestOpenAiChatgptWritingPrompt,
} from "../lib/cms/ai-seo/blog-prompt-openai";
import {
  AI_SEO_BLOG_PROMPT_RATE_LIMITS,
  checkAiSeoBlogPromptRateLimit,
  resetAiSeoBlogPromptRateLimitForTests,
} from "../lib/cms/ai-seo/rate-limit";
import { JsonCatalogRepository } from "../lib/cms/json-catalog";
import { buildArticleSnapshot } from "../lib/cms/seo-planning/article-snapshot";
import {
  SEO_PLANNING_WRITING_BRIEF_SPEC,
  buildWritingBrief,
  buildWritingPromptInput,
  type WritingArticleContext,
} from "../lib/cms/seo-planning/writing-brief";
import { fingerprintWritingBrief } from "../lib/cms/seo-planning/writing-fingerprint";
import {
  buildOpenAiWritingPromptCacheEntry,
  buildWritingPromptCacheEntry,
  mergeWritingPromptCache,
  readGeminiWritingPromptCache,
  readOpenAiWritingPromptCache,
  readWritingPromptsPayload,
  selectInitialWritingPromptProvider,
  writingPromptCacheStatus,
  type WritingPromptCacheEntry,
} from "../lib/cms/seo-planning/writing-prompt-cache";
import {
  generateChatgptWritingPromptWithGemini,
  generateChatgptWritingPromptWithOpenAi,
} from "../lib/cms/seo-planning/writing-prompt";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import type { BlogCategory, BlogPost, SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();
const SAMPLE_KEY = "sk-test-blog-prompt-openai-not-real";
const SAMPLE_GEMINI_KEY = "AIzaSy-test-blog-prompt-gemini-not-real";

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
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

function draft(overrides: Partial<SeoPlanningDraft> = {}): SeoPlanningDraft {
  return {
    id: "seoplan_d3",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:d3-demo",
    topic: "Approved topic",
    workingTitle: "Approved title",
    proposedSlug: "approved-topic",
    targetPostId: null,
    matchedPublicUrl: "",
    restorePath: "",
    searchIntent: "TROUBLESHOOTING",
    linkedPostId: null,
    createdBy: "admin_1",
    createdAt: "2026-10-06T00:00:00.000Z",
    updatedAt: "2026-10-06T01:00:00.000Z",
    payload: {
      opportunity: {
        topic: "Frozen topic",
        whyNow: "Readers are asking now.",
        webEvidence: "A support page describes the check.",
        existingCoverage: "PARTIAL",
        confidence: "HIGH",
        matchedTitle: "Existing guide",
        gscEvidence: [],
      },
      workspace: {
        contentAngle: "Approved angle",
        nextStep: "Approved next step",
        humanNotes: "Approved notes",
      },
      sources: [{ title: "Ofcom", domain: "ofcom.org.uk", url: "https://www.ofcom.org.uk/" }],
      gsc: { included: true },
    },
    ...overrides,
  };
}

function blogPromptConfig(overrides: Partial<OpenAiBlogPromptConfig> = {}): OpenAiBlogPromptConfig {
  return {
    configured: true,
    apiKey: SAMPLE_KEY,
    model: "gpt-blog-prompt-test",
    endpoint: OPENAI_RESPONSES_ENDPOINT,
    timeoutMs: OPENAI_BLOG_PROMPT_TIMEOUT_MS,
    maxOutputTokens: OPENAI_BLOG_PROMPT_MAX_OUTPUT_TOKENS,
    ...overrides,
  };
}

function openaiSuccessPayload(json: unknown) {
  return {
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(json) }],
      },
    ],
  };
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function memoryCatalog(initial: SeoPlanningDraft) {
  let store = structuredClone(initial);
  const posts = new Map<string, BlogPost>();
  const categories: BlogCategory[] = [];
  const catalog = {
    async getSeoPlanningDraftById(id: string) {
      return store.id === id ? structuredClone(store) : null;
    },
    async mergeSeoPlanningWritingPromptCache(args: {
      id: string;
      provider: "gemini" | "openai";
      entry: WritingPromptCacheEntry;
      acceptLatest?: (
        latest: SeoPlanningDraft,
        readers: {
          getPostById(id: string): Promise<BlogPost | null>;
          listCategories(): Promise<BlogCategory[]>;
        },
      ) => boolean | Promise<boolean>;
    }) {
      if (store.id !== args.id) return { ok: false as const, reason: "not_found" as const };
      const latest = structuredClone(store);
      const readers = {
        getPostById: (postId: string) => catalog.getPostById(postId),
        listCategories: () => catalog.listCategories(),
      };
      if (args.acceptLatest && !(await args.acceptLatest(latest, readers))) {
        return { ok: false as const, reason: "rejected" as const };
      }
      const basePayload =
        latest.payload && typeof latest.payload === "object" && !Array.isArray(latest.payload)
          ? { ...(latest.payload as Record<string, unknown>) }
          : {};
      store = {
        ...latest,
        payload: mergeWritingPromptCache(basePayload, args.provider, args.entry),
        updatedAt: new Date().toISOString(),
      };
      return { ok: true as const, draft: structuredClone(store) };
    },
    async mergeSeoPlanningGeminiWritingPromptCache(args: {
      id: string;
      entry: WritingPromptCacheEntry;
      acceptLatest?: (
        latest: SeoPlanningDraft,
        readers: {
          getPostById(id: string): Promise<BlogPost | null>;
          listCategories(): Promise<BlogCategory[]>;
        },
      ) => boolean | Promise<boolean>;
    }) {
      return catalog.mergeSeoPlanningWritingPromptCache({
        id: args.id,
        provider: "gemini",
        entry: args.entry,
        acceptLatest: args.acceptLatest,
      });
    },
    async getPostById(id: string) {
      return posts.get(id) || null;
    },
    async listCategories() {
      return categories.slice();
    },
  };
  return {
    get store() {
      return store;
    },
    set store(next: SeoPlanningDraft) {
      store = structuredClone(next);
    },
    setPost(post: BlogPost) {
      posts.set(post.id, structuredClone(post));
    },
    catalog,
  };
}

test("CONFIG: OpenAI Blog Prompt requires key + OPENAI_BLOG_PROMPT_MODEL; no SEO/research fallback", () => {
  withEnv(
    {
      OPENAI_API_KEY: SAMPLE_KEY,
      OPENAI_SEO_MODEL: "gpt-seo-only",
      OPENAI_SEO_RESEARCH_MODEL: "gpt-research-only",
      OPENAI_BLOG_PROMPT_MODEL: "",
    },
    () => {
      assert.equal(isOpenAiBlogPromptConfigured(), false);
      assert.equal(getOpenAiBlogPromptConfig().configured, false);
      assert.equal(getOpenAiSeoConfig().configured, true);
      assert.equal(getOpenAiSeoConfig().model, "gpt-seo-only");
      assert.equal(getOpenAiSeoResearchConfig().model, "gpt-research-only");
      assert.notEqual(getOpenAiBlogPromptConfig().model, DEFAULT_OPENAI_SEO_MODEL);
    },
  );
  withEnv(
    {
      OPENAI_API_KEY: SAMPLE_KEY,
      OPENAI_SEO_MODEL: "gpt-seo-only",
      OPENAI_BLOG_PROMPT_MODEL: "gpt-blog-prompt-model",
    },
    () => {
      assert.equal(isOpenAiBlogPromptConfigured(), true);
      const config = getOpenAiBlogPromptConfig();
      assert.equal(config.model, "gpt-blog-prompt-model");
      assert.equal(config.timeoutMs, 30_000);
      assert.equal(config.maxOutputTokens, 3500);
      assert.equal(config.endpoint, OPENAI_RESPONSES_ENDPOINT);
    },
  );
  assert.equal(CHATGPT_WRITING_PROMPT_MAX_CHARS, 12_000);
  assert.equal(OPENAI_BLOG_PROMPT_TIMEOUT_MS, 30_000);
  assert.equal(OPENAI_BLOG_PROMPT_MAX_OUTPUT_TOKENS, 3500);
});

test("REQUEST: Responses json_schema; store false; no tools/web_search; one call", async () => {
  const brief = buildWritingBrief(draft());
  const input = buildWritingPromptInput(brief);
  const body = buildOpenAiBlogPromptRequestBody(input, blogPromptConfig());
  assert.equal(body.model, "gpt-blog-prompt-test");
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 3500);
  assert.equal((body as { tools?: unknown }).tools, undefined);
  assert.equal((body as { tool_choice?: unknown }).tool_choice, undefined);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.name, BLOG_PROMPT_OPENAI_SCHEMA_NAME);
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(body.text.format.schema, BLOG_PROMPT_OPENAI_JSON_SCHEMA);
  assert.doesNotMatch(JSON.stringify(body), /web_search/);

  let calls = 0;
  let gemini = 0;
  let auth = "";
  const ok = await requestOpenAiChatgptWritingPrompt(input, {
    config: blogPromptConfig(),
    fetchImpl: async (url, init) => {
      calls += 1;
      if (String(url).includes("googleapis")) gemini += 1;
      assert.equal(String(url), OPENAI_RESPONSES_ENDPOINT);
      auth = String((init?.headers as Record<string, string>)?.Authorization || "");
      const sent = JSON.parse(String(init?.body));
      assert.equal(sent.store, false);
      assert.equal(sent.tools, undefined);
      assert.doesNotMatch(JSON.stringify(sent), /web_search/);
      return mockJsonResponse(openaiSuccessPayload({ chatgptPrompt: "Paste into ChatGPT." }));
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(calls, 1);
  assert.equal(gemini, 0);
  assert.equal(auth, `Bearer ${SAMPLE_KEY}`);

  assert.equal(normalizeChatgptWritingPromptResult({ chatgptPrompt: "  ok  " })?.chatgptPrompt, "ok");
  assert.equal(normalizeChatgptWritingPromptResult({ chatgptPrompt: "" }), null);
  assert.equal(
    normalizeChatgptWritingPromptResult({ chatgptPrompt: "x".repeat(CHATGPT_WRITING_PROMPT_MAX_CHARS + 1) }),
    null,
  );

  const oversize = await requestOpenAiChatgptWritingPrompt(input, {
    config: blogPromptConfig(),
    fetchImpl: async () =>
      mockJsonResponse(
        openaiSuccessPayload({ chatgptPrompt: "y".repeat(CHATGPT_WRITING_PROMPT_MAX_CHARS + 1) }),
      ),
  });
  assert.equal(oversize.ok, false);
  if (!oversize.ok) assert.equal(oversize.code, "invalid_response");
});

test("ERROR SAFETY: timeout/429/5xx mapped calmly; no raw leakage", async () => {
  const input = buildWritingPromptInput(buildWritingBrief(draft()));
  for (const status of [400, 401, 402, 403, 404, 500, 503]) {
    const result = await requestOpenAiChatgptWritingPrompt(input, {
      config: blogPromptConfig(),
      fetchImpl: async () =>
        mockJsonResponse({ error: { message: `SECRET_BODY_${status}`, type: "invalid_request_error" } }, status),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "unavailable");
      assert.doesNotMatch(JSON.stringify(result), new RegExp(`SECRET_BODY_${status}`));
    }
  }

  const limited = await requestOpenAiChatgptWritingPrompt(input, {
    config: blogPromptConfig(),
    fetchImpl: async () => mockJsonResponse({ error: { message: "RATE_SECRET" } }, 429),
  });
  assert.equal(limited.ok, false);
  if (!limited.ok) {
    assert.equal(limited.code, "rate_limited");
    assert.doesNotMatch(JSON.stringify(limited), /RATE_SECRET/);
  }

  let timeoutCalls = 0;
  const timedOut = await requestOpenAiChatgptWritingPrompt(input, {
    config: blogPromptConfig({ timeoutMs: 5 }),
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        timeoutCalls += 1;
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
  });
  assert.equal(timedOut.ok, false);
  if (!timedOut.ok) assert.equal(timedOut.code, "timeout");
  assert.equal(timeoutCalls, 1);

  const badJson = await requestOpenAiChatgptWritingPrompt(input, {
    config: blogPromptConfig(),
    fetchImpl: async () =>
      mockJsonResponse({
        output: [{ type: "message", content: [{ type: "output_text", text: "{not-json" }] }],
      }),
  });
  assert.equal(badJson.ok, false);
  if (!badJson.ok) assert.equal(badJson.code, "invalid_response");
});

test("ELIGIBILITY + CALL COUNT: OpenAI one call; Gemini 0; INTERNAL_LINK rejected", async () => {
  resetAiSeoBlogPromptRateLimitForTests();
  const mem = memoryCatalog(draft());
  let openai = 0;
  let gemini = 0;
  const ok = await generateChatgptWritingPromptWithOpenAi({
    planningDraftId: mem.store.id,
    adminId: "d3-one",
    ip: "10.9.0.1",
    catalog: mem.catalog,
    config: blogPromptConfig(),
    fetchImpl: async (url) => {
      if (String(url).includes("googleapis")) gemini += 1;
      else openai += 1;
      return mockJsonResponse(openaiSuccessPayload({ chatgptPrompt: "OpenAI prompt only." }));
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(openai, 1);
  assert.equal(gemini, 0);
  assert.equal(ok.ok && ok.provider, "openai");

  const link = memoryCatalog(draft({ recommendation: "INTERNAL_LINK_ONLY", matchedPublicUrl: "/blogs/x/" }));
  const rejected = await generateChatgptWritingPromptWithOpenAi({
    planningDraftId: link.store.id,
    adminId: "d3-link",
    ip: "10.9.0.2",
    catalog: link.catalog,
    config: blogPromptConfig(),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.code, "ineligible");
});

test("CACHE: openai independent; gemini sibling preserved; selection prefers newer generatedAt", () => {
  const brief = buildWritingBrief(draft());
  const fp = fingerprintWritingBrief(brief);
  const gemini = buildWritingPromptCacheEntry({
    chatgptPrompt: "Gemini prompt",
    writingFingerprint: fp,
    model: "gemini-blog",
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  const openai = buildOpenAiWritingPromptCacheEntry({
    chatgptPrompt: "OpenAI prompt",
    writingFingerprint: fp,
    model: "gpt-blog",
    generatedAt: "2026-02-01T00:00:00.000Z",
  });
  const merged = mergeWritingPromptCache(
    mergeWritingPromptCache({ opportunity: { keep: true } }, "gemini", gemini),
    "openai",
    openai,
  );
  assert.equal(readGeminiWritingPromptCache(merged)?.chatgptPrompt, "Gemini prompt");
  assert.equal(readOpenAiWritingPromptCache(merged)?.chatgptPrompt, "OpenAI prompt");
  assert.equal((merged.opportunity as { keep: boolean }).keep, true);

  const selected = selectInitialWritingPromptProvider({
    gemini: {
      entry: gemini,
      status: writingPromptCacheStatus({ entry: gemini, currentFingerprint: fp, providerEligible: true }),
    },
    openai: {
      entry: openai,
      status: writingPromptCacheStatus({ entry: openai, currentFingerprint: fp, providerEligible: true }),
    },
  });
  assert.equal(selected, "openai");
  assert.equal(readWritingPromptsPayload({}).openai, undefined);
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 4);
});

test("CONCURRENCY: F2 mismatch and write-boundary reject; preserve Gemini sibling", async () => {
  resetAiSeoBlogPromptRateLimitForTests();
  const geminiSibling = {
    chatgptPrompt: "Keep Gemini",
    writingFingerprint: "a".repeat(64),
    model: "gemini-kept",
    generatedAt: "2026-01-01T00:00:00.000Z",
    briefSpec: SEO_PLANNING_WRITING_BRIEF_SPEC,
  };
  const mem = memoryCatalog(
    draft({
      id: "seoplan_d3_race",
      payload: {
        ...(draft().payload as object),
        writingPrompts: { gemini: geminiSibling },
        workspace: {
          contentAngle: "Approved angle",
          nextStep: "Approved next step",
          humanNotes: "Approved notes",
          suggestions: { topic: { status: "PENDING", value: "S", source: "opportunity" } },
        },
      },
    }),
  );

  let gets = 0;
  const changed = await generateChatgptWritingPromptWithOpenAi({
    planningDraftId: mem.store.id,
    adminId: "d3-f2",
    ip: "10.9.0.3",
    catalog: {
      ...mem.catalog,
      async getSeoPlanningDraftById(id: string) {
        gets += 1;
        const current = await mem.catalog.getSeoPlanningDraftById(id);
        if (gets >= 2 && current) {
          mem.store = { ...mem.store, topic: "Changed during provider" };
          return { ...current, topic: "Changed during provider" };
        }
        return current;
      },
    },
    config: blogPromptConfig(),
    fetchImpl: async () => mockJsonResponse(openaiSuccessPayload({ chatgptPrompt: "Should not persist." })),
  });
  assert.equal(changed.ok, false);
  if (!changed.ok) assert.equal(changed.code, "brief_changed");
  assert.equal(readOpenAiWritingPromptCache(mem.store.payload), null);
  assert.equal(readGeminiWritingPromptCache(mem.store.payload)?.chatgptPrompt, "Keep Gemini");

  const okMem = memoryCatalog(
    draft({
      id: "seoplan_d3_ok",
      payload: {
        ...(draft().payload as object),
        writingPrompts: { gemini: geminiSibling },
        gsc: { included: true, mark: "original" },
      },
    }),
  );
  const ok = await generateChatgptWritingPromptWithOpenAi({
    planningDraftId: okMem.store.id,
    adminId: "d3-ok",
    ip: "10.9.0.4",
    catalog: {
      ...okMem.catalog,
      async mergeSeoPlanningWritingPromptCache(args) {
        const payload = okMem.store.payload as Record<string, unknown>;
        okMem.store = {
          ...okMem.store,
          payload: {
            ...payload,
            gsc: { included: true, mark: "concurrent-newer" },
            writingPrompts: { gemini: geminiSibling },
          },
        };
        return okMem.catalog.mergeSeoPlanningWritingPromptCache(args);
      },
    },
    config: blogPromptConfig(),
    fetchImpl: async () => mockJsonResponse(openaiSuccessPayload({ chatgptPrompt: "OpenAI persisted." })),
  });
  assert.equal(ok.ok, true);
  assert.equal(readOpenAiWritingPromptCache(okMem.store.payload)?.chatgptPrompt, "OpenAI persisted.");
  assert.equal(readGeminiWritingPromptCache(okMem.store.payload)?.chatgptPrompt, "Keep Gemini");
  assert.equal((okMem.store.payload as { gsc: { mark: string } }).gsc.mark, "concurrent-newer");
});

test("WRITE-BOUNDARY ARTICLE (OpenAI): body change after F2 rejects; one provider call", async () => {
  resetAiSeoBlogPromptRateLimitForTests();
  const post: BlogPost = {
    id: "post-d3",
    title: "How to Watch IPTV on Firestick: Complete Setup Guide",
    slug: "how-to-watch-iptv-on-firestick",
    excerpt: "A setup walkthrough.",
    content: "<h2>Check the network</h2><p>Restart the stick.</p>",
    categoryId: "cat-1",
    featuredImage: { id: "media-1", publicId: "m1", secureUrl: "https://example.com/m1.jpg" },
    status: "published",
    featured: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    seoTitle: "",
    seoDescription: "",
    focusKeyword: "firestick iptv",
    canonicalUrl: "",
    robotsIndex: true,
    robotsFollow: true,
    ogTitle: "",
    ogDescription: "",
    ogImage: null,
    sitemapInclude: true,
  };
  const mem = memoryCatalog(
    draft({
      id: "seoplan_d3_wb_body",
      recommendation: "REFRESH_EXISTING",
      workflowStatus: "CONTENT_NEEDED",
      targetPostId: "post-d3",
      matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
      payload: {
        ...(draft().payload as object),
        writingPrompts: {
          openai: {
            chatgptPrompt: "Old OpenAI writing prompt",
            writingFingerprint: "c".repeat(64),
            model: "gpt-old",
            generatedAt: "2026-01-01T00:00:00.000Z",
            briefSpec: SEO_PLANNING_WRITING_BRIEF_SPEC,
          },
        },
      },
    }),
  );
  mem.setPost(post);
  const beforeUpdatedAt = mem.store.updatedAt;
  let providerCalls = 0;
  const result = await generateChatgptWritingPromptWithOpenAi({
    planningDraftId: mem.store.id,
    adminId: "d3-wb",
    ip: "10.9.0.8",
    catalog: {
      ...mem.catalog,
      async mergeSeoPlanningWritingPromptCache(args) {
        mem.setPost({ ...post, content: "<h2>Changed body after F2</h2><p>New.</p>" });
        return mem.catalog.mergeSeoPlanningWritingPromptCache(args);
      },
    },
    config: blogPromptConfig(),
    fetchImpl: async () => {
      providerCalls += 1;
      return mockJsonResponse(openaiSuccessPayload({ chatgptPrompt: "Must not persist OpenAI." }));
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "brief_changed");
  assert.equal(providerCalls, 1);
  assert.equal(
    readOpenAiWritingPromptCache(mem.store.payload)?.chatgptPrompt,
    "Old OpenAI writing prompt",
  );
  assert.equal(mem.store.updatedAt, beforeUpdatedAt);
});

test("LIMITER: Gemini and OpenAI Blog Prompt share the same 2/min bucket", async () => {
  resetAiSeoBlogPromptRateLimitForTests();
  const admin = "d3-shared";
  const ip = "10.9.1.1";
  assert.equal(checkAiSeoBlogPromptRateLimit(admin, ip).ok, true);
  assert.equal(checkAiSeoBlogPromptRateLimit(admin, ip).ok, true);
  assert.equal(checkAiSeoBlogPromptRateLimit(admin, ip).ok, false);
  assert.equal(AI_SEO_BLOG_PROMPT_RATE_LIMITS.burstMax, 2);
  assert.equal(AI_SEO_BLOG_PROMPT_RATE_LIMITS.dailyMax, 20);

  resetAiSeoBlogPromptRateLimitForTests();
  const geminiMem = memoryCatalog(draft({ id: "seoplan_share_g" }));
  const openaiMem = memoryCatalog(draft({ id: "seoplan_share_o" }));
  const g = await generateChatgptWritingPromptWithGemini({
    planningDraftId: geminiMem.store.id,
    adminId: admin,
    ip,
    catalog: geminiMem.catalog,
    config: {
      configured: true,
      apiKey: SAMPLE_GEMINI_KEY,
      model: "gemini-blog",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-blog:generateContent",
      timeoutMs: 30_000,
      maxOutputTokens: 3500,
    },
    fetchImpl: async () =>
      mockJsonResponse({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ chatgptPrompt: "G" }) }] } }],
      }),
  });
  assert.equal(g.ok, true);
  const o = await generateChatgptWritingPromptWithOpenAi({
    planningDraftId: openaiMem.store.id,
    adminId: admin,
    ip,
    catalog: openaiMem.catalog,
    config: blogPromptConfig(),
    fetchImpl: async () => mockJsonResponse(openaiSuccessPayload({ chatgptPrompt: "O" })),
  });
  assert.equal(o.ok, true);
  const blocked = await generateChatgptWritingPromptWithOpenAi({
    planningDraftId: openaiMem.store.id,
    adminId: admin,
    ip,
    catalog: openaiMem.catalog,
    config: blogPromptConfig(),
    fetchImpl: async () => {
      throw new Error("should not fetch — limiter");
    },
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.code, "rate_limited");
});

test("UI / ACTION / SAFETY: dual buttons; no BlogPost; schema 3; no web_search", () => {
  const ui = read("components/sidhu/SeoPlanningWritingPrompt.tsx");
  const actions = read("lib/cms/seo-planning-actions.ts");
  const openaiProvider = read("lib/cms/ai-seo/blog-prompt-openai.ts");
  const service = read("lib/cms/seo-planning/writing-prompt.ts");

  assert.match(ui, /Generate with Gemini/);
  assert.match(ui, /Generate with OpenAI/);
  assert.match(ui, /generateChatgptWritingPromptWithGeminiAction/);
  assert.match(ui, /generateChatgptWritingPromptWithOpenAiAction/);
  assert.match(ui, /Copy Prompt/);
  assert.match(actions, /generateChatgptWritingPromptWithOpenAiAction/);
  assert.doesNotMatch(actions, /\bapiKey\b|OPENAI_BLOG_PROMPT_MODEL|GEMINI_BLOG_PROMPT_MODEL/);
  assert.doesNotMatch(openaiProvider, /web_search|tool_choice/);
  assert.doesNotMatch(service, /\b(?:savePost|createPost|publish)\b/);
  assert.doesNotMatch(service, /web_search/);
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 4);
});

test("JSON adapter OpenAI merge preserves Gemini under write lock", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "seo-plan-d3-json-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const catalog = new JsonCatalogRepository();
    const base = draft({
      id: "seoplan_d3_json",
      payload: {
        opportunity: { topic: "Frozen" },
        workspace: { contentAngle: "A", nextStep: "B", humanNotes: "N" },
        sources: [],
        gsc: { included: true },
        writingPrompts: {
          gemini: {
            chatgptPrompt: "JSON gemini",
            writingFingerprint: "b".repeat(64),
            model: "gemini-json",
            generatedAt: "2026-01-01T00:00:00.000Z",
            briefSpec: SEO_PLANNING_WRITING_BRIEF_SPEC,
          },
        },
      },
    });
    await catalog.saveSeoPlanningDraft(base);
    const entry = buildOpenAiWritingPromptCacheEntry({
      chatgptPrompt: "JSON openai",
      writingFingerprint: fingerprintWritingBrief(buildWritingBrief(base)),
      model: "gpt-json",
    });
    const merged = await catalog.mergeSeoPlanningWritingPromptCache({
      id: base.id,
      provider: "openai",
      entry,
      acceptLatest: () => true,
    });
    assert.equal(merged.ok, true);
    if (!merged.ok) return;
    assert.equal(readOpenAiWritingPromptCache(merged.draft.payload)?.chatgptPrompt, "JSON openai");
    assert.equal(readGeminiWritingPromptCache(merged.draft.payload)?.chatgptPrompt, "JSON gemini");
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});

const readyArticle: WritingArticleContext = {
  status: "ready",
  snapshot: buildArticleSnapshot({
    title: "How to Watch IPTV on Firestick: Complete Setup Guide",
    excerpt: "A setup walkthrough.",
    publicPath: "/blogs/how-to-watch-iptv-on-firestick/",
    categoryName: "Setup",
    focusKeyword: "firestick iptv",
    featuredImagePresent: true,
    html: "<h2>Check the network</h2><p>Restart the stick.</p>",
  }),
};

test("REFRESH fingerprint still uses article snapshot for OpenAI path eligibility", () => {
  const refreshDraft = draft({
    recommendation: "REFRESH_EXISTING",
    targetPostId: "post-1",
    matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
  });
  const brief = buildWritingBrief(refreshDraft, readyArticle);
  assert.equal(brief.providerEligible, true);
  const missing = buildWritingBrief(refreshDraft, { status: "missing" });
  assert.equal(missing.providerEligible, false);
});
