/**
 * Phase D2 — Gemini ChatGPT writing-prompt generation.
 * No live provider calls.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  CHATGPT_WRITING_PROMPT_MAX_CHARS,
  GEMINI_BLOG_PROMPT_MAX_OUTPUT_TOKENS,
  GEMINI_BLOG_PROMPT_TIMEOUT_MS,
  getGeminiBlogPromptConfig,
  getGeminiSeoConfig,
  isGeminiBlogPromptConfigured,
  type GeminiBlogPromptConfig,
} from "../lib/cms/ai-seo/config";
import {
  buildGeminiBlogPromptRequestBody,
  normalizeChatgptWritingPromptResult,
  requestGeminiChatgptWritingPrompt,
} from "../lib/cms/ai-seo/blog-prompt-gemini";
import {
  AI_SEO_BLOG_PROMPT_RATE_LIMITS,
  checkAiSeoBlogPromptRateLimit,
  checkAiSeoExplainRateLimit,
  resetAiSeoBlogPromptRateLimitForTests,
  resetAiSeoExplainRateLimitForTests,
} from "../lib/cms/ai-seo/rate-limit";
import { buildArticleSnapshot } from "../lib/cms/seo-planning/article-snapshot";
import {
  SEO_PLANNING_WRITING_BRIEF_SPEC,
  buildWritingBrief,
  buildWritingPromptInput,
  type WritingArticleContext,
} from "../lib/cms/seo-planning/writing-brief";
import { fingerprintWritingBrief } from "../lib/cms/seo-planning/writing-fingerprint";
import {
  buildGeminiWritingPromptCacheEntry,
  geminiWritingPromptCacheStatus,
  mergeGeminiWritingPromptCache,
  mergeWritingPromptCache,
  readGeminiWritingPromptCache,
  readOpenAiWritingPromptCache,
  readWritingPromptsPayload,
  type WritingPromptCacheEntry,
} from "../lib/cms/seo-planning/writing-prompt-cache";
import { generateChatgptWritingPromptWithGemini } from "../lib/cms/seo-planning/writing-prompt";
import { JsonCatalogRepository } from "../lib/cms/json-catalog";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import type { BlogCategory, BlogPost, SeoPlanningDraft } from "../lib/cms/types";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = process.cwd();
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
    id: "seoplan_d2",
    recommendation: "NEW_BLOG",
    workflowStatus: "CONTENT_NEEDED",
    fingerprint: "NEW_BLOG:d2-demo",
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

function blogPromptConfig(overrides: Partial<GeminiBlogPromptConfig> = {}): GeminiBlogPromptConfig {
  const model = overrides.model ?? "gemini-blog-prompt-test";
  return {
    configured: true,
    apiKey: SAMPLE_GEMINI_KEY,
    model,
    endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    timeoutMs: GEMINI_BLOG_PROMPT_TIMEOUT_MS,
    maxOutputTokens: GEMINI_BLOG_PROMPT_MAX_OUTPUT_TOKENS,
    ...overrides,
  };
}

function geminiSuccessPayload(json: unknown) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }],
  };
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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
      const nextPayload = mergeWritingPromptCache(basePayload, args.provider, args.entry);
      store = {
        ...latest,
        payload: nextPayload,
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
    deletePost(id: string) {
      posts.delete(id);
    },
    setCategory(category: BlogCategory) {
      const idx = categories.findIndex((item) => item.id === category.id);
      if (idx >= 0) categories[idx] = structuredClone(category);
      else categories.push(structuredClone(category));
    },
    catalog,
  };
}

test("CONFIG: Blog Prompt requires GEMINI_API_KEY + GEMINI_BLOG_PROMPT_MODEL; no SEO model fallback", () => {
  withEnv(
    {
      GEMINI_API_KEY: SAMPLE_GEMINI_KEY,
      GEMINI_SEO_MODEL: "gemini-seo-only",
      GEMINI_BLOG_PROMPT_MODEL: "",
    },
    () => {
      assert.equal(isGeminiBlogPromptConfigured(), false);
      assert.equal(getGeminiBlogPromptConfig().configured, false);
      assert.equal(getGeminiSeoConfig().configured, true);
      assert.equal(getGeminiSeoConfig().model, "gemini-seo-only");
    },
  );
  withEnv(
    {
      GEMINI_API_KEY: SAMPLE_GEMINI_KEY,
      GEMINI_SEO_MODEL: "gemini-seo-only",
      GEMINI_BLOG_PROMPT_MODEL: "gemini-blog-prompt-model",
    },
    () => {
      assert.equal(isGeminiBlogPromptConfigured(), true);
      const config = getGeminiBlogPromptConfig();
      assert.equal(config.model, "gemini-blog-prompt-model");
      assert.equal(config.timeoutMs, 30_000);
      assert.equal(config.maxOutputTokens, 3500);
      assert.match(config.endpoint, /gemini-blog-prompt-model:generateContent$/);
      assert.doesNotMatch(config.endpoint, /key=|AIza/);
    },
  );
  assert.equal(CHATGPT_WRITING_PROMPT_MAX_CHARS, 12_000);
});

test("PROVIDER: APPLICATION_JSON schema; one call; no OpenAI; normalize/reject oversize", async () => {
  const brief = buildWritingBrief(draft());
  const input = buildWritingPromptInput(brief);
  const body = buildGeminiBlogPromptRequestBody(input, blogPromptConfig());
  assert.equal(body.generationConfig.responseFormat.text.mimeType, "APPLICATION_JSON");
  assert.deepEqual(body.generationConfig.responseFormat.text.schema, {
    type: "object",
    additionalProperties: false,
    required: ["chatgptPrompt"],
    properties: { chatgptPrompt: { type: "string" } },
  });
  const gen = body.generationConfig as Record<string, unknown>;
  assert.equal(gen.responseMimeType, undefined);
  assert.equal(gen.responseSchema, undefined);

  assert.equal(normalizeChatgptWritingPromptResult({ chatgptPrompt: "  Paste into ChatGPT.  " })?.chatgptPrompt, "Paste into ChatGPT.");
  assert.equal(normalizeChatgptWritingPromptResult({ chatgptPrompt: "" }), null);
  assert.equal(
    normalizeChatgptWritingPromptResult({ chatgptPrompt: "x".repeat(CHATGPT_WRITING_PROMPT_MAX_CHARS + 1) }),
    null,
  );
  assert.equal(normalizeChatgptWritingPromptResult({ chatgptPrompt: "ok", extra: 1 }), null);

  let calls = 0;
  let openAi = 0;
  const ok = await requestGeminiChatgptWritingPrompt(input, {
    config: blogPromptConfig(),
    fetchImpl: async (url) => {
      calls += 1;
      if (String(url).includes("openai")) openAi += 1;
      assert.doesNotMatch(String(url), /key=|AIza/);
      return mockJsonResponse(geminiSuccessPayload({ chatgptPrompt: "Write the article from this brief." }));
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(calls, 1);
  assert.equal(openAi, 0);

  const oversize = await requestGeminiChatgptWritingPrompt(input, {
    config: blogPromptConfig(),
    fetchImpl: async () =>
      mockJsonResponse(
        geminiSuccessPayload({ chatgptPrompt: "y".repeat(CHATGPT_WRITING_PROMPT_MAX_CHARS + 1) }),
      ),
  });
  assert.equal(oversize.ok, false);
  if (!oversize.ok) assert.equal(oversize.code, "invalid_response");
});

test("PROVIDER: safe HTTP classifications and no raw leakage", async () => {
  const input = buildWritingPromptInput(buildWritingBrief(draft()));
  const cases = [
    { status: 400, upstream: "INVALID_ARGUMENT", code: "invalid_request", secret: "SENSITIVE_INVALID" },
    { status: 400, upstream: "FAILED_PRECONDITION", code: "failed_precondition", secret: "SENSITIVE_PRECOND" },
    { status: 401, upstream: "UNAUTHENTICATED", code: "unauthorized", secret: "SENSITIVE_AUTH" },
    { status: 402, upstream: "UNKNOWN", code: "payment_required", secret: "SENSITIVE_PAY" },
    { status: 403, upstream: "PERMISSION_DENIED", code: "permission_denied", secret: "SENSITIVE_PERM" },
    { status: 404, upstream: "NOT_FOUND", code: "not_found", secret: "SENSITIVE_404" },
    { status: 429, upstream: "RESOURCE_EXHAUSTED", code: "rate_limited", secret: "SENSITIVE_429" },
    { status: 500, upstream: "INTERNAL", code: "unavailable", secret: "SENSITIVE_500" },
  ] as const;

  for (const item of cases) {
    const result = await requestGeminiChatgptWritingPrompt(input, {
      config: blogPromptConfig(),
      fetchImpl: async () =>
        mockJsonResponse(
          { error: { code: item.status, status: item.upstream, message: item.secret } },
          item.status,
        ),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, item.code);
      assert.doesNotMatch(JSON.stringify(result), new RegExp(item.secret));
    }
  }

  let timeoutCalls = 0;
  const timedOut = await requestGeminiChatgptWritingPrompt(input, {
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
});

test("ELIGIBILITY: NEW/REFRESH/RESTORE ok; INTERNAL_LINK and wrong workflow rejected", async () => {
  resetAiSeoBlogPromptRateLimitForTests();
  const mem = memoryCatalog(draft());
  const okNew = await generateChatgptWritingPromptWithGemini({
    planningDraftId: mem.store.id,
    adminId: "d2-elig",
    ip: "10.0.0.1",
    catalog: mem.catalog,
    config: blogPromptConfig(),
    fetchImpl: async () => mockJsonResponse(geminiSuccessPayload({ chatgptPrompt: "Prompt for new blog." })),
  });
  assert.equal(okNew.ok, true);

  const link = memoryCatalog(draft({ recommendation: "INTERNAL_LINK_ONLY", matchedPublicUrl: "/blogs/x/" }));
  const rejectedLink = await generateChatgptWritingPromptWithGemini({
    planningDraftId: link.store.id,
    adminId: "d2-link",
    ip: "10.0.0.2",
    catalog: link.catalog,
    config: blogPromptConfig(),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(rejectedLink.ok, false);
  if (!rejectedLink.ok) assert.equal(rejectedLink.code, "ineligible");

  const planning = memoryCatalog(draft({ workflowStatus: "PLANNING" }));
  const rejectedWorkflow = await generateChatgptWritingPromptWithGemini({
    planningDraftId: planning.store.id,
    adminId: "d2-wf",
    ip: "10.0.0.3",
    catalog: planning.catalog,
    config: blogPromptConfig(),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(rejectedWorkflow.ok, false);
  if (!rejectedWorkflow.ok) assert.equal(rejectedWorkflow.code, "ineligible");

  const refresh = memoryCatalog(
    draft({
      recommendation: "REFRESH_EXISTING",
      targetPostId: "post-firestick",
      matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
      proposedSlug: "",
    }),
  );
  const missing = await generateChatgptWritingPromptWithGemini({
    planningDraftId: refresh.store.id,
    adminId: "d2-ref",
    ip: "10.0.0.4",
    catalog: refresh.catalog,
    config: blogPromptConfig(),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.code, "ineligible");

  // Restore historical eligible without article body
  const restore = memoryCatalog(
    draft({
      recommendation: "RESTORE_HISTORICAL",
      restorePath: "/old-path/",
      proposedSlug: "",
    }),
  );
  const okRestore = await generateChatgptWritingPromptWithGemini({
    planningDraftId: restore.store.id,
    adminId: "d2-restore",
    ip: "10.0.0.5",
    catalog: restore.catalog,
    config: blogPromptConfig(),
    fetchImpl: async () => mockJsonResponse(geminiSuccessPayload({ chatgptPrompt: "Recovery prompt." })),
  });
  assert.equal(okRestore.ok, true);
});

test("CACHE: current/stale/openai sibling preserved; old payload ok", () => {
  const brief = buildWritingBrief(draft());
  const fp = fingerprintWritingBrief(brief);
  const entry = buildGeminiWritingPromptCacheEntry({
    chatgptPrompt: "Cached prompt",
    writingFingerprint: fp,
    model: "gemini-blog",
  });
  assert.equal(entry.briefSpec, SEO_PLANNING_WRITING_BRIEF_SPEC);
  assert.equal(
    geminiWritingPromptCacheStatus({ entry, currentFingerprint: fp, providerEligible: true }),
    "current",
  );
  assert.equal(
    geminiWritingPromptCacheStatus({
      entry,
      currentFingerprint: "a".repeat(64),
      providerEligible: true,
    }),
    "stale",
  );
  assert.equal(
    geminiWritingPromptCacheStatus({ entry, currentFingerprint: fp, providerEligible: false }),
    "unusable",
  );

  const merged = mergeGeminiWritingPromptCache(
    {
      opportunity: { keep: true },
      workspace: { humanNotes: "notes" },
      sources: [1],
      gsc: { included: true },
      writingPrompts: {
        openai: {
          chatgptPrompt: "OpenAI prompt",
          writingFingerprint: "b".repeat(64),
          model: "gpt-test",
          generatedAt: "2026-01-01T00:00:00.000Z",
          briefSpec: SEO_PLANNING_WRITING_BRIEF_SPEC,
        },
      },
    },
    entry,
  );
  const prompts = readWritingPromptsPayload(merged);
  assert.equal(prompts.gemini?.chatgptPrompt, "Cached prompt");
  assert.equal(prompts.openai?.chatgptPrompt, "OpenAI prompt");
  assert.equal((merged.opportunity as { keep: boolean }).keep, true);
  assert.equal(readGeminiWritingPromptCache({}), null);
  assert.equal(readGeminiWritingPromptCache({ writingPrompts: {} }), null);

  // Write path preserves RAW siblings the read parser ignores.
  const rawPreserved = mergeGeminiWritingPromptCache(
    {
      opportunity: { keep: true },
      writingPrompts: {
        openai: {
          chatgptPrompt: "Malformed sibling",
          futureField: "preserve-me",
        },
        futureProvider: { keep: "raw-future" },
      },
    },
    entry,
  );
  const writingBlock = rawPreserved.writingPrompts as Record<string, unknown>;
  assert.equal((writingBlock.gemini as { chatgptPrompt: string }).chatgptPrompt, "Cached prompt");
  assert.deepEqual(writingBlock.openai, {
    chatgptPrompt: "Malformed sibling",
    futureField: "preserve-me",
  });
  assert.deepEqual(writingBlock.futureProvider, { keep: "raw-future" });
  assert.equal(readOpenAiWritingPromptCache(rawPreserved), null);
});

test("CONCURRENCY: F2===F1 persists; F2!==F1 does not clobber", async () => {
  resetAiSeoBlogPromptRateLimitForTests();
  const mem = memoryCatalog(draft());
  let calls = 0;
  const ok = await generateChatgptWritingPromptWithGemini({
    planningDraftId: mem.store.id,
    adminId: "d2-f1",
    ip: "10.1.0.1",
    catalog: mem.catalog,
    config: blogPromptConfig(),
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse(geminiSuccessPayload({ chatgptPrompt: "Stable prompt." }));
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(calls, 1);
  assert.equal(readGeminiWritingPromptCache(mem.store.payload)?.chatgptPrompt, "Stable prompt.");
  assert.equal((mem.store.payload as { workspace: { humanNotes: string } }).workspace.humanNotes, "Approved notes");

  const race = memoryCatalog(draft({ id: "seoplan_d2_race" }));
  let gets = 0;
  const changed = await generateChatgptWritingPromptWithGemini({
    planningDraftId: race.store.id,
    adminId: "d2-f2",
    ip: "10.1.0.2",
    catalog: {
      ...race.catalog,
      async getSeoPlanningDraftById(id: string) {
        gets += 1;
        const current = await race.catalog.getSeoPlanningDraftById(id);
        if (gets >= 2 && current) {
          race.store = { ...race.store, topic: "Changed during provider" };
          return { ...current, topic: "Changed during provider" };
        }
        return current;
      },
    },
    config: blogPromptConfig(),
    fetchImpl: async () => mockJsonResponse(geminiSuccessPayload({ chatgptPrompt: "Should not persist." })),
  });
  assert.equal(changed.ok, false);
  if (!changed.ok) assert.equal(changed.code, "brief_changed");
  assert.equal(readGeminiWritingPromptCache(race.store.payload), null);
  assert.equal(race.store.topic, "Changed during provider");
});

test("CONCURRENCY: atomic merge preserves newer siblings; write-boundary reject; no whole-draft save", async () => {
  resetAiSeoBlogPromptRateLimitForTests();
  const openaiSibling = {
    chatgptPrompt: "Future OpenAI prompt",
    writingFingerprint: "c".repeat(64),
    model: "gpt-test",
    generatedAt: "2026-01-01T00:00:00.000Z",
    briefSpec: SEO_PLANNING_WRITING_BRIEF_SPEC,
  };
  const mem = memoryCatalog(
    draft({
      id: "seoplan_d2_atomic",
      payload: {
        opportunity: { topic: "Frozen topic", keep: true },
        workspace: {
          contentAngle: "Approved angle",
          nextStep: "Approved next step",
          humanNotes: "Approved notes",
          suggestions: {
            topic: { status: "PENDING", value: "Suggested topic", source: "opportunity" },
          },
        },
        sources: [{ title: "Ofcom", domain: "ofcom.org.uk", url: "https://www.ofcom.org.uk/" }],
        gsc: { included: true, mark: "original" },
        writingPrompts: { openai: openaiSibling },
      },
    }),
  );

  let providerCalls = 0;
  let mergeCalls = 0;
  const result = await generateChatgptWritingPromptWithGemini({
    planningDraftId: mem.store.id,
    adminId: "d2-atomic",
    ip: "10.1.0.3",
    catalog: {
      ...mem.catalog,
      async mergeSeoPlanningWritingPromptCache(args) {
        mergeCalls += 1;
        // Concurrent save after F2: siblings that do NOT change the Writing Brief fingerprint.
        const payload = mem.store.payload as Record<string, unknown>;
        const workspace = { ...(payload.workspace as Record<string, unknown>) };
        workspace.suggestions = {
          topic: { status: "APPLIED", value: "Concurrent suggestion", source: "opportunity" },
        };
        const opportunity = { ...(payload.opportunity as Record<string, unknown>), concurrent: true };
        mem.store = {
          ...mem.store,
          payload: {
            ...payload,
            workspace,
            gsc: { included: true, mark: "concurrent-newer" },
            opportunity,
            writingPrompts: { openai: openaiSibling },
          },
        };
        return mem.catalog.mergeSeoPlanningWritingPromptCache(args);
      },
    },
    config: blogPromptConfig(),
    fetchImpl: async () => {
      providerCalls += 1;
      return mockJsonResponse(geminiSuccessPayload({ chatgptPrompt: "Atomic gemini prompt." }));
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalls, 1);
  assert.equal(mergeCalls, 1);
  const payload = mem.store.payload as Record<string, unknown>;
  assert.equal(readGeminiWritingPromptCache(payload)?.chatgptPrompt, "Atomic gemini prompt.");
  assert.equal(readWritingPromptsPayload(payload).openai?.chatgptPrompt, "Future OpenAI prompt");
  assert.equal((payload.gsc as { mark: string }).mark, "concurrent-newer");
  assert.equal((payload.opportunity as { concurrent?: boolean }).concurrent, true);
  assert.equal(Array.isArray(payload.sources) && payload.sources.length, 1);
  assert.equal(
    ((payload.workspace as { suggestions: { topic: { status: string } } }).suggestions.topic.status),
    "APPLIED",
  );
  assert.equal((payload.workspace as { humanNotes: string }).humanNotes, "Approved notes");
  assert.equal(mem.store.topic, "Approved topic");
  assert.equal(mem.store.workingTitle, "Approved title");
  assert.equal(mem.store.searchIntent, "TROUBLESHOOTING");
  assert.equal(mem.store.workflowStatus, "CONTENT_NEEDED");

  // Write-boundary fingerprint reject: brief changes after F2, inside acceptLatest.
  const boundary = memoryCatalog(draft({ id: "seoplan_d2_boundary" }));
  let boundaryMerges = 0;
  const rejected = await generateChatgptWritingPromptWithGemini({
    planningDraftId: boundary.store.id,
    adminId: "d2-boundary",
    ip: "10.1.0.4",
    catalog: {
      ...boundary.catalog,
      async mergeSeoPlanningWritingPromptCache(args) {
        boundaryMerges += 1;
        boundary.store = { ...boundary.store, topic: "Changed at write boundary" };
        return boundary.catalog.mergeSeoPlanningWritingPromptCache(args);
      },
    },
    config: blogPromptConfig(),
    fetchImpl: async () => mockJsonResponse(geminiSuccessPayload({ chatgptPrompt: "Must not persist." })),
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.code, "brief_changed");
  assert.equal(boundaryMerges, 1);
  assert.equal(readGeminiWritingPromptCache(boundary.store.payload), null);
  assert.equal(boundary.store.topic, "Changed at write boundary");

  const serviceSrc = read("lib/cms/seo-planning/writing-prompt.ts");
  assert.match(serviceSrc, /mergeSeoPlanningWritingPromptCache/);
  assert.doesNotMatch(serviceSrc, /saveSeoPlanningDraft/);
  const actionSrc = read("lib/cms/seo-planning-actions.ts");
  assert.match(actionSrc, /mergeSeoPlanningWritingPromptCache|mergeSeoPlanningGeminiWritingPromptCache/);
  const mysqlSrc = read("lib/cms/mysql-catalog.ts");
  assert.match(mysqlSrc, /FOR UPDATE/);
  assert.match(
    mysqlSrc,
    /UPDATE seo_planning_drafts SET payload = \?, updated_at = \? WHERE id = \?/,
  );
  assert.match(mysqlSrc, /mergeSeoPlanningWritingPromptCache/);
  assert.match(mysqlSrc, /mergeSeoPlanningGeminiWritingPromptCache/);
  const jsonSrc = read("lib/cms/json-catalog.ts");
  assert.match(jsonSrc, /mergeSeoPlanningWritingPromptCache/);
  assert.match(jsonSrc, /withSeoPlanningJsonWriteLock/);
});

test("CONCURRENCY: JSON adapter merge preserves latest under write lock", async () => {
  resetAiSeoBlogPromptRateLimitForTests();
  const dir = mkdtempSync(path.join(tmpdir(), "seo-plan-d2-json-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const catalog = new JsonCatalogRepository();
    const base = draft({
      id: "seoplan_d2_json",
      payload: {
        opportunity: { topic: "Frozen" },
        workspace: {
          contentAngle: "Angle",
          nextStep: "Step",
          humanNotes: "Notes",
          suggestions: { topic: { status: "PENDING", value: "S", source: "opportunity" } },
        },
        sources: [{ title: "A", domain: "a.test", url: "https://a.test/" }],
        gsc: { included: true },
        writingPrompts: {
          openai: {
            chatgptPrompt: "JSON openai",
            writingFingerprint: "d".repeat(64),
            model: "gpt-json",
            generatedAt: "2026-02-01T00:00:00.000Z",
            briefSpec: SEO_PLANNING_WRITING_BRIEF_SPEC,
          },
        },
      },
    });
    await catalog.saveSeoPlanningDraft(base);

    // Concurrent newer Planning payload before merge write boundary.
    const newer = sanitizeCloneWithSiblings(base);
    await catalog.saveSeoPlanningDraft(newer);

    const entry = buildGeminiWritingPromptCacheEntry({
      chatgptPrompt: "JSON gemini prompt",
      writingFingerprint: fingerprintWritingBrief(buildWritingBrief(newer)),
      model: "gemini-json",
    });
    const merged = await catalog.mergeSeoPlanningGeminiWritingPromptCache({
      id: base.id,
      entry,
      acceptLatest: () => true,
    });
    assert.equal(merged.ok, true);
    if (!merged.ok) return;
    const payload = merged.draft.payload as Record<string, unknown>;
    assert.equal(readGeminiWritingPromptCache(payload)?.chatgptPrompt, "JSON gemini prompt");
    assert.equal(readWritingPromptsPayload(payload).openai?.chatgptPrompt, "JSON openai");
    assert.equal((payload.gsc as { mark: string }).mark, "json-newer");
    assert.equal(
      (payload.workspace as { suggestions: { topic: { status: string } } }).suggestions.topic.status,
      "IGNORED",
    );
    assert.equal(merged.draft.topic, "Approved topic");
    assert.equal(merged.draft.workflowStatus, "CONTENT_NEEDED");
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});

function sanitizeCloneWithSiblings(base: SeoPlanningDraft): SeoPlanningDraft {
  return {
    ...base,
    payload: {
      ...(base.payload as Record<string, unknown>),
      gsc: { included: true, mark: "json-newer" },
      workspace: {
        ...((base.payload as { workspace: Record<string, unknown> }).workspace || {}),
        suggestions: { topic: { status: "IGNORED", value: "S", source: "opportunity" } },
      },
    },
  };
}

test("WRITE-BOUNDARY ARTICLE: body/title/featured/category/target races reject; success when stable", async () => {
  function samplePost(overrides: Partial<BlogPost> = {}): BlogPost {
    return {
      id: "post-refresh",
      title: readyArticle.status === "ready" ? readyArticle.snapshot.title : "Title",
      slug: "how-to-watch-iptv-on-firestick",
      excerpt: "A setup walkthrough.",
      content: "<h2>Check the network</h2><p>Restart the stick.</p>",
      categoryId: "cat-1",
      featuredImage: { id: "media-1", publicId: "media/m1", secureUrl: "https://example.com/m1.jpg" },
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
      ...overrides,
    };
  }
  function sampleCategory(overrides: Partial<BlogCategory> = {}): BlogCategory {
    return {
      id: "cat-1",
      name: "Setup",
      slug: "setup",
      description: "",
      active: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      seoTitle: "",
      seoDescription: "",
      focusKeyword: "",
      canonicalUrl: "",
      robotsIndex: null,
      robotsFollow: null,
      ogTitle: "",
      ogDescription: "",
      ogImage: null,
      sitemapInclude: null,
      ...overrides,
    };
  }

  async function refreshRace(args: {
    id: string;
    mutateAtMerge: (mem: ReturnType<typeof memoryCatalog>) => void;
    expectReject?: boolean;
  }) {
    resetAiSeoBlogPromptRateLimitForTests();
    const mem = memoryCatalog(
      draft({
        id: args.id,
        recommendation: "REFRESH_EXISTING",
        workflowStatus: "CONTENT_NEEDED",
        targetPostId: "post-refresh",
        matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
        payload: {
          ...(draft().payload as Record<string, unknown>),
          writingPrompts: {
            gemini: {
              chatgptPrompt: "Old current writing prompt",
              writingFingerprint: "a".repeat(64),
              model: "gemini-old",
              generatedAt: "2026-01-01T00:00:00.000Z",
              briefSpec: SEO_PLANNING_WRITING_BRIEF_SPEC,
            },
          },
        },
      }),
    );
    mem.setCategory(sampleCategory());
    mem.setPost(samplePost());
    const beforeUpdatedAt = mem.store.updatedAt;
    let providerCalls = 0;
    let mergeCalls = 0;
    const result = await generateChatgptWritingPromptWithGemini({
      planningDraftId: mem.store.id,
      adminId: `d2-${args.id}`,
      ip: "10.9.0.1",
      catalog: {
        ...mem.catalog,
        async mergeSeoPlanningWritingPromptCache(mergeArgs) {
          mergeCalls += 1;
          args.mutateAtMerge(mem);
          return mem.catalog.mergeSeoPlanningWritingPromptCache(mergeArgs);
        },
      },
      config: blogPromptConfig(),
      fetchImpl: async () => {
        providerCalls += 1;
        return mockJsonResponse(geminiSuccessPayload({ chatgptPrompt: "Boundary writing prompt." }));
      },
    });
    assert.equal(providerCalls, 1, args.id);
    assert.equal(mergeCalls, 1, args.id);
    if (args.expectReject === false) {
      assert.equal(result.ok, true, args.id);
      assert.equal(
        readGeminiWritingPromptCache(mem.store.payload)?.chatgptPrompt,
        "Boundary writing prompt.",
        args.id,
      );
      assert.notEqual(mem.store.updatedAt, beforeUpdatedAt, args.id);
      return;
    }
    assert.equal(result.ok, false, args.id);
    if (!result.ok) assert.equal(result.code, "brief_changed", args.id);
    assert.equal(
      readGeminiWritingPromptCache(mem.store.payload)?.chatgptPrompt,
      "Old current writing prompt",
      args.id,
    );
    assert.equal(mem.store.updatedAt, beforeUpdatedAt, args.id);
  }

  await refreshRace({
    id: "seoplan_d2_wb_body",
    mutateAtMerge: (mem) =>
      mem.setPost(samplePost({ content: "<h2>Completely different body</h2><p>New steps.</p>" })),
  });
  await refreshRace({
    id: "seoplan_d2_wb_title",
    mutateAtMerge: (mem) => mem.setPost(samplePost({ title: "Completely Different Article Title" })),
  });
  await refreshRace({
    id: "seoplan_d2_wb_featured",
    mutateAtMerge: (mem) => mem.setPost(samplePost({ featuredImage: null })),
  });
  await refreshRace({
    id: "seoplan_d2_wb_category",
    mutateAtMerge: (mem) => mem.setCategory(sampleCategory({ name: "Troubleshooting" })),
  });
  await refreshRace({
    id: "seoplan_d2_wb_slug",
    mutateAtMerge: (mem) => mem.setPost(samplePost({ slug: "completely-different-slug" })),
  });
  await refreshRace({
    id: "seoplan_d2_wb_missing",
    mutateAtMerge: (mem) => mem.deletePost("post-refresh"),
  });
  await refreshRace({
    id: "seoplan_d2_wb_ok",
    mutateAtMerge: () => {
      /* stable */
    },
    expectReject: false,
  });

  const mysqlSrc = read("lib/cms/mysql-catalog.ts");
  assert.match(mysqlSrc, /createPromptAcceptReaders/);
  assert.match(mysqlSrc, /SELECT \* FROM blog_posts WHERE id = \? LIMIT 1 FOR UPDATE/);
  assert.match(mysqlSrc, /async mergeSeoPlanningWritingPromptCache/);
  assert.match(mysqlSrc, /const readers = createPromptAcceptReaders\(conn, latest\)/);
  const jsonSrc = read("lib/cms/json-catalog.ts");
  assert.match(jsonSrc, /async mergeSeoPlanningWritingPromptCache/);
  assert.match(jsonSrc, /withBlogContentJsonWriteLock/);
  const orch = read("lib/cms/seo-planning/writing-prompt.ts");
  assert.match(orch, /acceptLatest: \(latest, readers\) =>/);
});

test("LIMITER: dedicated blog-prompt bucket; does not consume explain/draft", () => {
  resetAiSeoBlogPromptRateLimitForTests();
  resetAiSeoExplainRateLimitForTests();
  for (let i = 0; i < AI_SEO_BLOG_PROMPT_RATE_LIMITS.burstMax; i += 1) {
    assert.equal(checkAiSeoBlogPromptRateLimit("d2-lim", "10.2.0.1").ok, true);
  }
  assert.equal(checkAiSeoBlogPromptRateLimit("d2-lim", "10.2.0.1").ok, false);
  // Explain/draft bucket still fresh for same admin/ip material different key.
  assert.equal(checkAiSeoExplainRateLimit("d2-lim", "10.2.0.1").ok, true);
});

test("SERVICE: one Gemini call; OpenAI 0; no BlogPost helpers in module", async () => {
  resetAiSeoBlogPromptRateLimitForTests();
  const mem = memoryCatalog(draft());
  let gemini = 0;
  let openai = 0;
  const result = await generateChatgptWritingPromptWithGemini({
    planningDraftId: mem.store.id,
    adminId: "d2-one",
    ip: "10.3.0.1",
    catalog: mem.catalog,
    config: blogPromptConfig(),
    fetchImpl: async (url) => {
      if (String(url).includes("openai")) openai += 1;
      else gemini += 1;
      return mockJsonResponse(geminiSuccessPayload({ chatgptPrompt: "Only Gemini." }));
    },
  });
  assert.equal(result.ok, true);
  assert.equal(gemini, 1);
  assert.equal(openai, 0);

  const src = read("lib/cms/seo-planning/writing-prompt.ts");
  assert.doesNotMatch(src, /\b(?:savePost|updatePost|createPost|publish)\b/);
  assert.doesNotMatch(src, /web_search|GSC_/);
  assert.doesNotMatch(src, /openai\.com/);
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 3);
});

test("UI / ACTION / ENV: Generate with Gemini and OpenAI; copy/render safety; schema 3", () => {
  const ui = read("components/sidhu/SeoPlanningWritingPrompt.tsx");
  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  const actions = read("lib/cms/seo-planning-actions.ts");
  const page = read("app/sidhu/(protected)/seo/planning/[id]/page.tsx");
  const env = read(".env.example");

  assert.match(ui, /Generate with Gemini/);
  assert.match(ui, /Generate again with Gemini/);
  assert.match(ui, /Generate with OpenAI/);
  assert.match(ui, /Generate again with OpenAI/);
  assert.match(ui, /Copy Prompt/);
  assert.doesNotMatch(ui, /useEffect\(/);
  assert.match(detail, /SeoPlanningWritingPrompt/);
  assert.match(actions, /generateChatgptWritingPromptWithGeminiAction/);
  assert.match(actions, /generateChatgptWritingPromptWithOpenAiAction/);
  assert.match(actions, /planningDraftId/);
  assert.doesNotMatch(actions, /apiKey|GEMINI_BLOG_PROMPT_MODEL|OPENAI_BLOG_PROMPT_MODEL|endpoint/);
  assert.match(page, /geminiBlogPromptConfigured|isGeminiBlogPromptConfigured/);
  assert.match(page, /openaiBlogPromptConfigured|isOpenAiBlogPromptConfigured/);
  assert.match(page, /readGeminiWritingPromptCache|readOpenAiWritingPromptCache/);
  assert.match(env, /^GEMINI_BLOG_PROMPT_MODEL=$/m);
  assert.match(env, /^OPENAI_BLOG_PROMPT_MODEL=$/m);
  assert.doesNotMatch(read("db/cms-schema.sql"), /writing_prompt|writingPrompts/);
  assert.doesNotMatch(read("lib/db/schema.ts"), /writing_prompt|writingPrompts/);
});

test("REFRESH fingerprint uses article snapshot when ready", () => {
  const refreshDraft = draft({
    recommendation: "REFRESH_EXISTING",
    targetPostId: "post-1",
    matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
  });
  const brief = buildWritingBrief(refreshDraft, readyArticle);
  assert.equal(brief.providerEligible, true);
  assert.ok(brief.existingArticle);
  const fp = fingerprintWritingBrief(brief);
  assert.match(fp, /^[a-f0-9]{64}$/);
  const without = fingerprintWritingBrief(buildWritingBrief(refreshDraft, { status: "missing" }));
  assert.notEqual(fp, without);
});
