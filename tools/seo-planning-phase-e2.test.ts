/**
 * Phase E2 — Gemini ChatGPT image-prompt generation.
 * No live provider calls. No media / BlogPost / image API writes.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  CHATGPT_IMAGE_PROMPT_MAX_CHARS,
  GEMINI_IMAGE_PROMPT_MAX_OUTPUT_TOKENS,
  GEMINI_IMAGE_PROMPT_TIMEOUT_MS,
  getGeminiBlogPromptConfig,
  getGeminiImagePromptConfig,
  getGeminiSeoConfig,
  isGeminiImagePromptConfigured,
  type GeminiImagePromptConfig,
} from "../lib/cms/ai-seo/config";
import {
  buildGeminiImagePromptRequestBody,
  normalizeChatgptImagePromptResult,
  requestGeminiChatgptImagePrompt,
} from "../lib/cms/ai-seo/image-prompt-gemini";
import {
  AI_SEO_BLOG_PROMPT_RATE_LIMITS,
  AI_SEO_IMAGE_PROMPT_RATE_LIMITS,
  checkAiSeoBlogPromptRateLimit,
  checkAiSeoImagePromptRateLimit,
  resetAiSeoBlogPromptRateLimitForTests,
  resetAiSeoImagePromptRateLimitForTests,
} from "../lib/cms/ai-seo/rate-limit";
import { JsonCatalogRepository } from "../lib/cms/json-catalog";
import { buildArticleSnapshot } from "../lib/cms/seo-planning/article-snapshot";
import {
  SEO_PLANNING_IMAGE_BRIEF_SPEC,
  buildImageBrief,
  buildImagePromptInput,
} from "../lib/cms/seo-planning/image-brief";
import { fingerprintImageBrief } from "../lib/cms/seo-planning/image-fingerprint";
import {
  buildGeminiImagePromptCacheEntry,
  geminiImagePromptCacheStatus,
  mergeGeminiImagePromptCache,
  mergeImagePromptCache,
  readGeminiImagePromptCache,
  readImagePromptsPayload,
  readOpenAiImagePromptCache,
  type ImagePromptCacheEntry,
} from "../lib/cms/seo-planning/image-prompt-cache";
import { generateChatgptImagePromptWithGemini } from "../lib/cms/seo-planning/image-prompt";
import { sanitizeSeoPlanningDraft } from "../lib/cms/seo-planning/sanitize";
import type { WritingArticleContext } from "../lib/cms/seo-planning/writing-brief";
import {
  applySeoPlanningWorkspaceUpdate,
  parseSeoPlanningWorkspaceInput,
} from "../lib/cms/seo-planning/workspace";
import { CURRENT_CMS_SCHEMA_VERSION } from "../lib/db/schema";
import type { BlogCategory, BlogPost, SeoPlanningDraft } from "../lib/cms/types";

const root = process.cwd();
const SAMPLE_GEMINI_KEY = "AIzaSy-test-image-prompt-gemini-not-real";

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
    id: "seoplan_e2",
    recommendation: "NEW_BLOG",
    workflowStatus: "IMAGE_NEEDED",
    fingerprint: "NEW_BLOG:e2-demo",
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
      writingPrompts: {
        gemini: {
          chatgptPrompt: "Gemini writing prompt",
          writingFingerprint: "a".repeat(64),
          model: "gemini-blog",
          generatedAt: "2026-01-01T00:00:00.000Z",
          briefSpec: "d1-1",
        },
        openai: {
          chatgptPrompt: "OpenAI writing prompt",
          writingFingerprint: "b".repeat(64),
          model: "gpt-test",
          generatedAt: "2026-01-02T00:00:00.000Z",
          briefSpec: "d1-1",
        },
      },
    },
    ...overrides,
  };
}

function imagePromptConfig(overrides: Partial<GeminiImagePromptConfig> = {}): GeminiImagePromptConfig {
  const model = overrides.model ?? "gemini-image-prompt-test";
  return {
    configured: true,
    apiKey: SAMPLE_GEMINI_KEY,
    model,
    endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    timeoutMs: GEMINI_IMAGE_PROMPT_TIMEOUT_MS,
    maxOutputTokens: GEMINI_IMAGE_PROMPT_MAX_OUTPUT_TOKENS,
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

const readyFeaturedPresent: WritingArticleContext = {
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

const readyFeaturedAbsent: WritingArticleContext = {
  status: "ready",
  snapshot: buildArticleSnapshot({
    title: "How to Watch IPTV on Firestick: Complete Setup Guide",
    excerpt: "A setup walkthrough.",
    publicPath: "/blogs/how-to-watch-iptv-on-firestick/",
    categoryName: "Setup",
    focusKeyword: "firestick iptv",
    featuredImagePresent: false,
    html: "<h2>Check the network</h2><p>Restart the stick.</p>",
  }),
};

const featuredTitle =
  readyFeaturedPresent.status === "ready"
    ? readyFeaturedPresent.snapshot.title
    : "How to Watch IPTV on Firestick: Complete Setup Guide";

function memoryCatalog(initial: SeoPlanningDraft) {
  let store = structuredClone(initial);
  const posts = new Map<string, BlogPost>();
  const categories: BlogCategory[] = [];
  const catalog = {
    async getSeoPlanningDraftById(id: string) {
      return store.id === id ? structuredClone(store) : null;
    },
    async mergeSeoPlanningImagePromptCache(args: {
      id: string;
      provider: "gemini" | "openai";
      entry: ImagePromptCacheEntry;
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
      // Simulate transaction/lock-scoped readers (same view as locked Planning + Blog rows).
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
      const nextPayload = mergeImagePromptCache(basePayload, args.provider, args.entry);
      store = {
        ...latest,
        payload: nextPayload,
        updatedAt: new Date().toISOString(),
      };
      return { ok: true as const, draft: structuredClone(store) };
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

function sampleRefreshPost(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: "post-feat",
    title: featuredTitle,
    slug: "how-to-watch-iptv-on-firestick",
    excerpt: "A setup walkthrough.",
    content: "<p>Body</p>",
    categoryId: "cat-1",
    featuredImage: { id: "media-1", publicId: "media/m1", secureUrl: "https://example.com/media/m1.jpg" },
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

test("CONFIG: Image Prompt requires GEMINI_API_KEY + GEMINI_IMAGE_PROMPT_MODEL; no SEO/blog fallback", () => {
  withEnv(
    {
      GEMINI_API_KEY: SAMPLE_GEMINI_KEY,
      GEMINI_SEO_MODEL: "gemini-seo-only",
      GEMINI_BLOG_PROMPT_MODEL: "gemini-blog-only",
      GEMINI_IMAGE_PROMPT_MODEL: "",
    },
    () => {
      assert.equal(isGeminiImagePromptConfigured(), false);
      assert.equal(getGeminiImagePromptConfig().configured, false);
      assert.equal(getGeminiSeoConfig().configured, true);
      assert.equal(getGeminiBlogPromptConfig().configured, true);
    },
  );
  withEnv(
    {
      GEMINI_API_KEY: SAMPLE_GEMINI_KEY,
      GEMINI_SEO_MODEL: "gemini-seo-only",
      GEMINI_BLOG_PROMPT_MODEL: "gemini-blog-only",
      GEMINI_IMAGE_PROMPT_MODEL: "gemini-image-prompt-model",
    },
    () => {
      assert.equal(isGeminiImagePromptConfigured(), true);
      const config = getGeminiImagePromptConfig();
      assert.equal(config.model, "gemini-image-prompt-model");
      assert.equal(config.timeoutMs, 30_000);
      assert.equal(config.maxOutputTokens, 1500);
      assert.match(config.endpoint, /gemini-image-prompt-model:generateContent$/);
      assert.doesNotMatch(config.endpoint, /key=|AIza/);
    },
  );
  assert.equal(CHATGPT_IMAGE_PROMPT_MAX_CHARS, 4_000);
  assert.equal(GEMINI_IMAGE_PROMPT_TIMEOUT_MS, 30_000);
  assert.equal(GEMINI_IMAGE_PROMPT_MAX_OUTPUT_TOKENS, 1500);
});

test("PROVIDER: APPLICATION_JSON schema; dedicated model; normalize/reject oversize", async () => {
  const brief = buildImageBrief(draft());
  const input = buildImagePromptInput(brief);
  assert.ok(input.length <= 8000);
  const body = buildGeminiImagePromptRequestBody(input, imagePromptConfig());
  assert.equal(body.generationConfig.responseFormat.text.mimeType, "APPLICATION_JSON");
  assert.deepEqual(body.generationConfig.responseFormat.text.schema, {
    type: "object",
    additionalProperties: false,
    required: ["chatgptImagePrompt"],
    properties: { chatgptImagePrompt: { type: "string" } },
  });
  const gen = body.generationConfig as Record<string, unknown>;
  assert.equal(gen.responseMimeType, undefined);
  assert.equal(gen.responseSchema, undefined);
  assert.equal(body.generationConfig.maxOutputTokens, 1500);
  assert.equal("tools" in body, false);
  assert.doesNotMatch(JSON.stringify(body), /web_search/);
  assert.match(JSON.stringify(body.contents), /imageBriefCanonicalInput/);
  assert.doesNotMatch(JSON.stringify(body), /GEMINI_API_KEY|AIzaSy/);

  assert.deepEqual(
    normalizeChatgptImagePromptResult({ chatgptImagePrompt: "  Clean prompt  " }),
    { chatgptImagePrompt: "Clean prompt" },
  );
  assert.deepEqual(
    normalizeChatgptImagePromptResult({ chatgptImagePrompt: "Has\u0000NUL" }),
    { chatgptImagePrompt: "HasNUL" },
  );
  assert.equal(normalizeChatgptImagePromptResult({ chatgptImagePrompt: "   " }), null);
  assert.equal(normalizeChatgptImagePromptResult({ chatgptImagePrompt: 1 }), null);
  assert.equal(
    normalizeChatgptImagePromptResult({ chatgptImagePrompt: "ok", extra: true }),
    null,
  );
  assert.equal(
    normalizeChatgptImagePromptResult({ chatgptImagePrompt: "x".repeat(4001) }),
    null,
  );
  assert.deepEqual(
    normalizeChatgptImagePromptResult({ chatgptImagePrompt: "x".repeat(4000) }),
    { chatgptImagePrompt: "x".repeat(4000) },
  );

  let calls = 0;
  const ok = await requestGeminiChatgptImagePrompt(input, {
    config: imagePromptConfig({ model: "dedicated-image-model" }),
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.match(String(url), /dedicated-image-model:generateContent$/);
      assert.doesNotMatch(String(url), /gemini-seo|gemini-blog|key=/);
      const parsed = JSON.parse(String(init?.body || "{}"));
      assert.equal(parsed.generationConfig.responseFormat.text.mimeType, "APPLICATION_JSON");
      assert.equal(parsed.generationConfig.maxOutputTokens, 1500);
      return mockJsonResponse(
        geminiSuccessPayload({ chatgptImagePrompt: "Editorial 16:9 featured image prompt." }),
      );
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(calls, 1);
  if (ok.ok) {
    assert.equal(ok.prompt.chatgptImagePrompt, "Editorial 16:9 featured image prompt.");
    assert.equal(ok.model, "dedicated-image-model");
  }

  const bad = await requestGeminiChatgptImagePrompt(input, {
    config: imagePromptConfig(),
    fetchImpl: async () =>
      mockJsonResponse(geminiSuccessPayload({ chatgptImagePrompt: "x".repeat(4001) })),
  });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.code, "invalid_response");

  const unconfigured = await requestGeminiChatgptImagePrompt(input, {
    config: imagePromptConfig({ configured: false, apiKey: "", model: "", endpoint: "" }),
  });
  assert.equal(unconfigured.ok, false);
  if (!unconfigured.ok) assert.equal(unconfigured.code, "not_configured");

  const rate = await requestGeminiChatgptImagePrompt(input, {
    config: imagePromptConfig(),
    fetchImpl: async () => mockJsonResponse({ error: { message: "quota", status: "RESOURCE_EXHAUSTED" } }, 429),
  });
  assert.equal(rate.ok, false);
  if (!rate.ok) {
    assert.equal(rate.code, "rate_limited");
    assert.doesNotMatch(rate.message, /RESOURCE_EXHAUSTED|quota|AIza/);
  }

  const malformed = await requestGeminiChatgptImagePrompt(input, {
    config: imagePromptConfig(),
    fetchImpl: async () => mockJsonResponse({ candidates: [{ content: { parts: [{ text: "{not-json" }] } }] }),
  });
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    assert.equal(malformed.code, "invalid_response");
    assert.doesNotMatch(malformed.message, /not-json|stack|AIza/);
  }
});

test("ELIGIBILITY: IMAGE_NEEDED content tasks only; CONTENT_NEEDED/INTERNAL/refresh gates", async () => {
  resetAiSeoImagePromptRateLimitForTests();
  const eligibleNew = memoryCatalog(draft());
  let calls = 0;
  const okNew = await generateChatgptImagePromptWithGemini({
    planningDraftId: eligibleNew.store.id,
    adminId: "e2-elig",
    ip: "10.0.0.1",
    catalog: eligibleNew.catalog,
    config: imagePromptConfig(),
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse(geminiSuccessPayload({ chatgptImagePrompt: "New image prompt." }));
    },
  });
  assert.equal(okNew.ok, true);
  assert.equal(calls, 1);

  const contentNeeded = memoryCatalog(draft({ workflowStatus: "CONTENT_NEEDED" }));
  const ineligibleContent = await generateChatgptImagePromptWithGemini({
    planningDraftId: contentNeeded.store.id,
    adminId: "e2-cn",
    ip: "10.0.0.2",
    catalog: contentNeeded.catalog,
    config: imagePromptConfig(),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(ineligibleContent.ok, false);
  if (!ineligibleContent.ok) assert.equal(ineligibleContent.code, "ineligible");

  const planning = memoryCatalog(draft({ workflowStatus: "PLANNING" }));
  const ineligiblePlanning = await generateChatgptImagePromptWithGemini({
    planningDraftId: planning.store.id,
    adminId: "e2-pl",
    ip: "10.0.0.3",
    catalog: planning.catalog,
    config: imagePromptConfig(),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(ineligiblePlanning.ok, false);
  if (!ineligiblePlanning.ok) assert.equal(ineligiblePlanning.code, "ineligible");

  const internal = memoryCatalog(
    draft({ recommendation: "INTERNAL_LINK_ONLY", workflowStatus: "IMAGE_NEEDED" }),
  );
  assert.equal(buildImageBrief(internal.store).providerEligible, false);
  const ineligibleInternal = await generateChatgptImagePromptWithGemini({
    planningDraftId: internal.store.id,
    adminId: "e2-il",
    ip: "10.0.0.4",
    catalog: internal.catalog,
    config: imagePromptConfig(),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(ineligibleInternal.ok, false);
  if (!ineligibleInternal.ok) assert.equal(ineligibleInternal.code, "ineligible");

  const incomplete = memoryCatalog(draft({ topic: "" }));
  const ineligibleIncomplete = await generateChatgptImagePromptWithGemini({
    planningDraftId: incomplete.store.id,
    adminId: "e2-inc",
    ip: "10.0.0.5",
    catalog: incomplete.catalog,
    config: imagePromptConfig(),
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.equal(ineligibleIncomplete.ok, false);
  if (!ineligibleIncomplete.ok) assert.equal(ineligibleIncomplete.code, "ineligible");

  const refreshReady = memoryCatalog(
    draft({
      id: "seoplan_e2_refresh",
      recommendation: "REFRESH_EXISTING",
      targetPostId: "post-1",
      matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
    }),
  );
  function samplePost(featured: boolean): BlogPost {
    return {
      id: "post-1",
      title: featuredTitle,
      slug: "how-to-watch-iptv-on-firestick",
      excerpt: "A setup walkthrough.",
      content: "<h2>Check the network</h2><p>Restart the stick.</p>",
      categoryId: "cat-1",
      featuredImage: featured
        ? { id: "media-1", publicId: "media/m1", secureUrl: "https://example.com/media/m1.jpg" }
        : null,
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
  }
  refreshReady.setPost(samplePost(true));
  const okRefresh = await generateChatgptImagePromptWithGemini({
    planningDraftId: refreshReady.store.id,
    adminId: "e2-ref-ok",
    ip: "10.0.0.6",
    catalog: refreshReady.catalog,
    config: imagePromptConfig(),
    fetchImpl: async () =>
      mockJsonResponse(geminiSuccessPayload({ chatgptImagePrompt: "Refresh image prompt." })),
  });
  assert.equal(okRefresh.ok, true);

  assert.equal(
    buildImageBrief(
      draft({
        recommendation: "REFRESH_EXISTING",
        workflowStatus: "IMAGE_NEEDED",
        targetPostId: "post-1",
        matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
      }),
      readyFeaturedPresent,
    ).providerEligible,
    true,
  );
  assert.equal(
    buildImageBrief(
      draft({
        recommendation: "REFRESH_EXISTING",
        workflowStatus: "IMAGE_NEEDED",
        targetPostId: "post-1",
      }),
      { status: "missing" },
    ).providerEligible,
    false,
  );
  assert.equal(
    buildImageBrief(
      draft({
        recommendation: "REFRESH_EXISTING",
        workflowStatus: "IMAGE_NEEDED",
        targetPostId: "post-1",
      }),
      { status: "mismatch" },
    ).providerEligible,
    false,
  );
  assert.equal(
    buildImageBrief(
      draft({ recommendation: "RESTORE_HISTORICAL", workflowStatus: "IMAGE_NEEDED", restorePath: "/old/" }),
    ).providerEligible,
    true,
  );
});

test("CACHE: current/stale/unusable; openai sibling preserved; malformed ignored", () => {
  const brief = buildImageBrief(draft());
  const fp = fingerprintImageBrief(brief);
  const entry = buildGeminiImagePromptCacheEntry({
    chatgptImagePrompt: "Cached image prompt",
    imageFingerprint: fp,
    model: "gemini-image",
  });
  assert.equal(entry.briefSpec, SEO_PLANNING_IMAGE_BRIEF_SPEC);
  assert.equal(
    geminiImagePromptCacheStatus({ entry, currentFingerprint: fp, providerEligible: true }),
    "current",
  );
  assert.equal(
    geminiImagePromptCacheStatus({
      entry,
      currentFingerprint: "a".repeat(64),
      providerEligible: true,
    }),
    "stale",
  );
  assert.equal(
    geminiImagePromptCacheStatus({ entry, currentFingerprint: fp, providerEligible: false }),
    "unusable",
  );
  assert.equal(
    geminiImagePromptCacheStatus({ entry: null, currentFingerprint: fp, providerEligible: true }),
    "none",
  );

  const merged = mergeGeminiImagePromptCache(
    {
      opportunity: { keep: true },
      workspace: { humanNotes: "notes" },
      sources: [1],
      gsc: { included: true },
      writingPrompts: {
        gemini: {
          chatgptPrompt: "Writing gemini",
          writingFingerprint: "c".repeat(64),
          model: "g",
          generatedAt: "2026-01-01T00:00:00.000Z",
          briefSpec: "d1-1",
        },
        openai: {
          chatgptPrompt: "Writing openai",
          writingFingerprint: "d".repeat(64),
          model: "o",
          generatedAt: "2026-01-01T00:00:00.000Z",
          briefSpec: "d1-1",
        },
      },
      imagePrompts: {
        openai: {
          chatgptImagePrompt: "OpenAI image prompt",
          imageFingerprint: "e".repeat(64),
          model: "gpt-image",
          generatedAt: "2026-01-01T00:00:00.000Z",
          briefSpec: SEO_PLANNING_IMAGE_BRIEF_SPEC,
        },
      },
      futureSibling: { keep: true },
    },
    entry,
  );
  const prompts = readImagePromptsPayload(merged);
  assert.equal(prompts.gemini?.chatgptImagePrompt, "Cached image prompt");
  assert.equal(prompts.openai?.chatgptImagePrompt, "OpenAI image prompt");
  assert.equal((merged.opportunity as { keep: boolean }).keep, true);
  assert.equal((merged.futureSibling as { keep: boolean }).keep, true);
  assert.equal(
    (merged.writingPrompts as { gemini: { chatgptPrompt: string } }).gemini.chatgptPrompt,
    "Writing gemini",
  );
  assert.equal(readGeminiImagePromptCache({}), null);
  assert.equal(readGeminiImagePromptCache({ imagePrompts: { gemini: { bad: true } } }), null);
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 3);

  // Write path must preserve RAW siblings that the read parser ignores.
  const rawPreserved = mergeGeminiImagePromptCache(
    {
      opportunity: { keep: true },
      imagePrompts: {
        openai: {
          chatgptImagePrompt: "Malformed sibling",
          // missing fingerprint/model — parser ignores for reads
          futureField: "preserve-me",
        },
        futureProvider: { keep: "raw-future" },
      },
      futureSibling: { keep: true },
    },
    entry,
  );
  const imageBlock = rawPreserved.imagePrompts as Record<string, unknown>;
  assert.equal((imageBlock.gemini as { chatgptImagePrompt: string }).chatgptImagePrompt, "Cached image prompt");
  assert.deepEqual(imageBlock.openai, {
    chatgptImagePrompt: "Malformed sibling",
    futureField: "preserve-me",
  });
  assert.deepEqual(imageBlock.futureProvider, { keep: "raw-future" });
  assert.equal(readOpenAiImagePromptCache(rawPreserved), null);
});

test("SCHEMA: Planning workspace save preserves imagePrompts; sanitizer round-trip", () => {
  const brief = buildImageBrief(draft());
  const fp = fingerprintImageBrief(brief);
  const imageCache = buildGeminiImagePromptCacheEntry({
    chatgptImagePrompt: "Persist across workspace save",
    imageFingerprint: fp,
    model: "gemini-image",
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  const stored = draft({
    payload: {
      ...(draft().payload as Record<string, unknown>),
      imagePrompts: {
        gemini: imageCache,
        openai: {
          chatgptImagePrompt: "OpenAI keep",
          imageFingerprint: "e".repeat(64),
          model: "gpt-image",
          generatedAt: "2026-01-01T00:00:00.000Z",
          briefSpec: SEO_PLANNING_IMAGE_BRIEF_SPEC,
          futureField: "keep-raw",
        },
      },
    },
  });
  const parsed = parseSeoPlanningWorkspaceInput({
    id: stored.id,
    topic: "Updated topic",
    workingTitle: "Updated title",
    searchIntent: "TROUBLESHOOTING",
    humanNotes: "Updated notes",
    workflowStatus: "IMAGE_NEEDED",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const applied = applySeoPlanningWorkspaceUpdate(stored, parsed.value, "2026-10-07T00:00:00.000Z");
  assert.equal(applied.ok, true);
  if (!applied.ok) return;
  const payload = applied.draft.payload as Record<string, unknown>;
  assert.equal(readGeminiImagePromptCache(payload)?.chatgptImagePrompt, "Persist across workspace save");
  assert.equal(
    (payload.imagePrompts as { openai: { futureField?: string } }).openai.futureField,
    "keep-raw",
  );
  const roundTrip = sanitizeSeoPlanningDraft(applied.draft);
  assert.equal(readGeminiImagePromptCache(roundTrip.payload)?.chatgptImagePrompt, "Persist across workspace save");
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 3);
});

test("CONCURRENCY: F1==F2==write persists; topic/notes/featured/disposition/title changes reject", async () => {
  resetAiSeoImagePromptRateLimitForTests();
  const mem = memoryCatalog(draft());
  let calls = 0;
  const ok = await generateChatgptImagePromptWithGemini({
    planningDraftId: mem.store.id,
    adminId: "e2-f1",
    ip: "10.1.0.1",
    catalog: mem.catalog,
    config: imagePromptConfig(),
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse(geminiSuccessPayload({ chatgptImagePrompt: "Stable image prompt." }));
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(calls, 1);
  assert.equal(readGeminiImagePromptCache(mem.store.payload)?.chatgptImagePrompt, "Stable image prompt.");

  async function raceAfterProvider(
    mutate: (store: SeoPlanningDraft) => SeoPlanningDraft,
    label: string,
  ) {
    resetAiSeoImagePromptRateLimitForTests();
    const race = memoryCatalog(draft({ id: `seoplan_e2_${label}` }));
    let gets = 0;
    let providerCalls = 0;
    const changed = await generateChatgptImagePromptWithGemini({
      planningDraftId: race.store.id,
      adminId: `e2-${label}`,
      ip: `10.1.${label.length}.2`,
      catalog: {
        ...race.catalog,
        async getSeoPlanningDraftById(id: string) {
          gets += 1;
          const current = await race.catalog.getSeoPlanningDraftById(id);
          if (gets >= 2 && current) {
            race.store = mutate(race.store);
            return mutate(current);
          }
          return current;
        },
      },
      config: imagePromptConfig(),
      fetchImpl: async () => {
        providerCalls += 1;
        return mockJsonResponse(
          geminiSuccessPayload({ chatgptImagePrompt: "Should not persist." }),
        );
      },
    });
    assert.equal(changed.ok, false, label);
    if (!changed.ok) assert.equal(changed.code, "brief_changed", label);
    assert.equal(providerCalls, 1, label);
    assert.equal(readGeminiImagePromptCache(race.store.payload), null, label);
  }

  await raceAfterProvider((s) => ({ ...s, topic: "Changed during provider" }), "topic");
  await raceAfterProvider(
    (s) => ({
      ...s,
      payload: {
        ...(s.payload as Record<string, unknown>),
        workspace: {
          ...((s.payload as { workspace: Record<string, unknown> }).workspace || {}),
          humanNotes: "Approved notes\n\n[[E2-TAIL-MARKER]] extra notes beyond prompt area",
        },
      },
    }),
    "notes",
  );
  await raceAfterProvider((s) => ({ ...s, workingTitle: "Changed title during provider" }), "title");
  await raceAfterProvider(
    (s) => ({ ...s, workflowStatus: "CONTENT_NEEDED" }),
    "disposition",
  );

  // F2-time featured flip (detected before write boundary)
  resetAiSeoImagePromptRateLimitForTests();
  const feat = memoryCatalog(
    draft({
      id: "seoplan_e2_feat",
      recommendation: "REFRESH_EXISTING",
      targetPostId: "post-feat",
      matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
    }),
  );
  feat.setCategory(sampleCategory());
  feat.setPost(sampleRefreshPost());
  let featGets = 0;
  let featCalls = 0;
  const featChanged = await generateChatgptImagePromptWithGemini({
    planningDraftId: feat.store.id,
    adminId: "e2-feat",
    ip: "10.1.9.9",
    catalog: {
      ...feat.catalog,
      async getSeoPlanningDraftById(id: string) {
        featGets += 1;
        const current = await feat.catalog.getSeoPlanningDraftById(id);
        if (featGets >= 2) {
          feat.setPost(sampleRefreshPost({ featuredImage: null }));
        }
        return current;
      },
    },
    config: imagePromptConfig(),
    fetchImpl: async () => {
      featCalls += 1;
      return mockJsonResponse(geminiSuccessPayload({ chatgptImagePrompt: "Must not persist featured." }));
    },
  });
  assert.equal(featChanged.ok, false);
  if (!featChanged.ok) assert.equal(featChanged.code, "brief_changed");
  assert.equal(featCalls, 1);
  assert.equal(readGeminiImagePromptCache(feat.store.payload), null);

  // Direct fingerprint: featured present vs absent must differ
  const fpPresent = fingerprintImageBrief(
    buildImageBrief(
      draft({
        recommendation: "REFRESH_EXISTING",
        workflowStatus: "IMAGE_NEEDED",
        targetPostId: "post-1",
        matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
      }),
      readyFeaturedPresent,
    ),
  );
  const fpAbsent = fingerprintImageBrief(
    buildImageBrief(
      draft({
        recommendation: "REFRESH_EXISTING",
        workflowStatus: "IMAGE_NEEDED",
        targetPostId: "post-1",
        matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
      }),
      readyFeaturedAbsent,
    ),
  );
  assert.notEqual(fpPresent, fpAbsent);

  // Write-boundary reject
  resetAiSeoImagePromptRateLimitForTests();
  const boundary = memoryCatalog(draft({ id: "seoplan_e2_boundary" }));
  let boundaryMerges = 0;
  let boundaryCalls = 0;
  const rejected = await generateChatgptImagePromptWithGemini({
    planningDraftId: boundary.store.id,
    adminId: "e2-boundary",
    ip: "10.1.0.4",
    catalog: {
      ...boundary.catalog,
      async mergeSeoPlanningImagePromptCache(args) {
        boundaryMerges += 1;
        boundary.store = { ...boundary.store, topic: "Changed at write boundary" };
        return boundary.catalog.mergeSeoPlanningImagePromptCache(args);
      },
    },
    config: imagePromptConfig(),
    fetchImpl: async () => {
      boundaryCalls += 1;
      return mockJsonResponse(geminiSuccessPayload({ chatgptImagePrompt: "Must not persist." }));
    },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.code, "brief_changed");
  assert.equal(boundaryMerges, 1);
  assert.equal(boundaryCalls, 1);
  assert.equal(readGeminiImagePromptCache(boundary.store.payload), null);
});

test("WRITE-BOUNDARY ARTICLE: featured/title/category/target races after F2 reject; success when stable", async () => {
  async function refreshRace(args: {
    id: string;
    mutateAtMerge: (mem: ReturnType<typeof memoryCatalog>) => void;
    expectReject?: boolean;
  }) {
    resetAiSeoImagePromptRateLimitForTests();
    const mem = memoryCatalog(
      draft({
        id: args.id,
        recommendation: "REFRESH_EXISTING",
        targetPostId: "post-feat",
        matchedPublicUrl: "/blogs/how-to-watch-iptv-on-firestick/",
        payload: {
          ...(draft().payload as Record<string, unknown>),
          imagePrompts: {
            gemini: buildGeminiImagePromptCacheEntry({
              chatgptImagePrompt: "Old current image prompt",
              imageFingerprint: "a".repeat(64),
              model: "gemini-old",
              generatedAt: "2026-01-01T00:00:00.000Z",
            }),
          },
        },
      }),
    );
    mem.setCategory(sampleCategory());
    mem.setPost(sampleRefreshPost());
    const beforeUpdatedAt = mem.store.updatedAt;
    let providerCalls = 0;
    let mergeCalls = 0;
    const result = await generateChatgptImagePromptWithGemini({
      planningDraftId: mem.store.id,
      adminId: `e2-${args.id}`,
      ip: "10.8.0.1",
      catalog: {
        ...mem.catalog,
        async mergeSeoPlanningImagePromptCache(mergeArgs) {
          mergeCalls += 1;
          // F1 and F2 already passed with featured/title/category stable.
          // Mutate article only at the atomic write boundary (acceptLatest readers).
          args.mutateAtMerge(mem);
          return mem.catalog.mergeSeoPlanningImagePromptCache(mergeArgs);
        },
      },
      config: imagePromptConfig(),
      fetchImpl: async () => {
        providerCalls += 1;
        return mockJsonResponse(
          geminiSuccessPayload({ chatgptImagePrompt: "Boundary article prompt." }),
        );
      },
    });
    assert.equal(providerCalls, 1, args.id);
    assert.equal(mergeCalls, 1, args.id);
    if (args.expectReject === false) {
      assert.equal(result.ok, true, args.id);
      assert.equal(
        readGeminiImagePromptCache(mem.store.payload)?.chatgptImagePrompt,
        "Boundary article prompt.",
        args.id,
      );
      assert.notEqual(mem.store.updatedAt, beforeUpdatedAt, args.id);
      return;
    }
    assert.equal(result.ok, false, args.id);
    if (!result.ok) assert.equal(result.code, "brief_changed", args.id);
    assert.equal(
      readGeminiImagePromptCache(mem.store.payload)?.chatgptImagePrompt,
      "Old current image prompt",
      args.id,
    );
    assert.equal(mem.store.updatedAt, beforeUpdatedAt, args.id);
  }

  await refreshRace({
    id: "seoplan_e2_wb_featured",
    mutateAtMerge: (mem) => mem.setPost(sampleRefreshPost({ featuredImage: null })),
  });
  await refreshRace({
    id: "seoplan_e2_wb_title",
    mutateAtMerge: (mem) => mem.setPost(sampleRefreshPost({ title: "Completely Different Article Title" })),
  });
  await refreshRace({
    id: "seoplan_e2_wb_category",
    mutateAtMerge: (mem) => mem.setCategory(sampleCategory({ name: "Troubleshooting" })),
  });
  await refreshRace({
    id: "seoplan_e2_wb_missing",
    mutateAtMerge: (mem) => mem.deletePost("post-feat"),
  });
  await refreshRace({
    id: "seoplan_e2_wb_mismatch",
    mutateAtMerge: (mem) =>
      mem.setPost(sampleRefreshPost({ slug: "completely-different-refresh-target" })),
  });
  await refreshRace({
    id: "seoplan_e2_wb_ok",
    mutateAtMerge: () => {
      /* stable article */
    },
    expectReject: false,
  });

  const mysqlSrc = read("lib/cms/mysql-catalog.ts");
  assert.match(mysqlSrc, /SELECT \* FROM blog_posts WHERE id = \? LIMIT 1 FOR UPDATE/);
  assert.match(mysqlSrc, /SELECT \* FROM blog_categories WHERE id = \? LIMIT 1 FOR UPDATE/);
  assert.match(mysqlSrc, /createPromptAcceptReaders|SeoPlanningPromptAcceptReaders/);
  assert.match(mysqlSrc, /async mergeSeoPlanningImagePromptCache/);
  const jsonSrc = read("lib/cms/json-catalog.ts");
  assert.match(jsonSrc, /withBlogContentJsonWriteLock/);
  assert.match(jsonSrc, /withSeoPlanningJsonWriteLock\(\(\) =>\s*withBlogContentJsonWriteLock/);
  const orch = read("lib/cms/seo-planning/image-prompt.ts");
  assert.match(orch, /acceptLatest: \(latest, readers\) =>/);
  assert.doesNotMatch(orch, /acceptLatest: \(latest\) =>\s*briefStillMatchesFingerprint\(latest, fingerprintF1, args\.catalog\)/);
});

test("CACHE MERGE + ATOMIC: only imagePrompts.gemini; siblings preserved; JSON lock", async () => {
  resetAiSeoImagePromptRateLimitForTests();
  const openaiImageSibling = {
    chatgptImagePrompt: "Future OpenAI image prompt",
    imageFingerprint: "f".repeat(64),
    model: "gpt-image",
    generatedAt: "2026-01-01T00:00:00.000Z",
    briefSpec: SEO_PLANNING_IMAGE_BRIEF_SPEC,
  };
  const mem = memoryCatalog(
    draft({
      id: "seoplan_e2_atomic",
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
        writingPrompts: {
          gemini: {
            chatgptPrompt: "Writing gemini",
            writingFingerprint: "a".repeat(64),
            model: "g",
            generatedAt: "2026-01-01T00:00:00.000Z",
            briefSpec: "d1-1",
          },
          openai: {
            chatgptPrompt: "Writing openai",
            writingFingerprint: "b".repeat(64),
            model: "o",
            generatedAt: "2026-01-01T00:00:00.000Z",
            briefSpec: "d1-1",
          },
        },
        imagePrompts: { openai: openaiImageSibling },
        futureSibling: { keep: true },
      },
    }),
  );

  let providerCalls = 0;
  const result = await generateChatgptImagePromptWithGemini({
    planningDraftId: mem.store.id,
    adminId: "e2-atomic",
    ip: "10.1.0.3",
    catalog: {
      ...mem.catalog,
      async mergeSeoPlanningImagePromptCache(args) {
        const payload = mem.store.payload as Record<string, unknown>;
        const workspace = { ...(payload.workspace as Record<string, unknown>) };
        workspace.suggestions = {
          topic: { status: "APPLIED", value: "Concurrent suggestion", source: "opportunity" },
        };
        mem.store = {
          ...mem.store,
          payload: {
            ...payload,
            workspace,
            gsc: { included: true, mark: "concurrent-newer" },
            opportunity: { ...(payload.opportunity as Record<string, unknown>), concurrent: true },
            writingPrompts: payload.writingPrompts,
            imagePrompts: { openai: openaiImageSibling },
            futureSibling: { keep: true },
          },
        };
        return mem.catalog.mergeSeoPlanningImagePromptCache(args);
      },
    },
    config: imagePromptConfig(),
    fetchImpl: async () => {
      providerCalls += 1;
      return mockJsonResponse(geminiSuccessPayload({ chatgptImagePrompt: "Atomic gemini image prompt." }));
    },
  });

  assert.equal(result.ok, true);
  assert.equal(providerCalls, 1);
  const payload = mem.store.payload as Record<string, unknown>;
  assert.equal(readGeminiImagePromptCache(payload)?.chatgptImagePrompt, "Atomic gemini image prompt.");
  assert.equal(readImagePromptsPayload(payload).openai?.chatgptImagePrompt, "Future OpenAI image prompt");
  assert.equal((payload.gsc as { mark: string }).mark, "concurrent-newer");
  assert.equal((payload.opportunity as { concurrent?: boolean }).concurrent, true);
  assert.equal((payload.futureSibling as { keep: boolean }).keep, true);
  assert.equal(
    (payload.writingPrompts as { gemini: { chatgptPrompt: string } }).gemini.chatgptPrompt,
    "Writing gemini",
  );
  assert.equal(
    (payload.writingPrompts as { openai: { chatgptPrompt: string } }).openai.chatgptPrompt,
    "Writing openai",
  );

  const serviceSrc = read("lib/cms/seo-planning/image-prompt.ts");
  assert.match(serviceSrc, /mergeSeoPlanningImagePromptCache/);
  assert.doesNotMatch(serviceSrc, /saveSeoPlanningDraft/);
  assert.doesNotMatch(serviceSrc, /\b(?:savePost|updatePost|createPost|publish)\b/);
  assert.doesNotMatch(serviceSrc, /openai\.com|Cloudinary|MediaAsset/);
  const mysqlSrc = read("lib/cms/mysql-catalog.ts");
  assert.match(mysqlSrc, /mergeSeoPlanningImagePromptCache/);
  assert.match(mysqlSrc, /FOR UPDATE/);
  const jsonSrc = read("lib/cms/json-catalog.ts");
  assert.match(jsonSrc, /mergeSeoPlanningImagePromptCache/);
  assert.match(jsonSrc, /withSeoPlanningJsonWriteLock/);

  const dir = mkdtempSync(path.join(tmpdir(), "seo-plan-e2-json-"));
  const previous = process.cwd();
  process.chdir(dir);
  try {
    const catalog = new JsonCatalogRepository();
    const base = draft({
      id: "seoplan_e2_json",
      payload: {
        opportunity: { topic: "Frozen" },
        workspace: { contentAngle: "Angle", nextStep: "Step", humanNotes: "Notes" },
        sources: [],
        gsc: { included: true },
        writingPrompts: {
          openai: {
            chatgptPrompt: "JSON openai writing",
            writingFingerprint: "d".repeat(64),
            model: "gpt-json",
            generatedAt: "2026-02-01T00:00:00.000Z",
            briefSpec: "d1-1",
          },
        },
        imagePrompts: { openai: openaiImageSibling },
      },
    });
    await catalog.saveSeoPlanningDraft(base);
    const newer = {
      ...base,
      payload: {
        ...(base.payload as Record<string, unknown>),
        gsc: { included: true, mark: "json-newer" },
      },
    };
    await catalog.saveSeoPlanningDraft(newer);
    const entry = buildGeminiImagePromptCacheEntry({
      chatgptImagePrompt: "JSON gemini image prompt",
      imageFingerprint: fingerprintImageBrief(buildImageBrief(newer)),
      model: "gemini-json",
    });
    const merged = await catalog.mergeSeoPlanningImagePromptCache({
      id: base.id,
      provider: "gemini",
      entry,
      acceptLatest: () => true,
    });
    assert.equal(merged.ok, true);
    if (!merged.ok) return;
    const p = merged.draft.payload as Record<string, unknown>;
    assert.equal(readGeminiImagePromptCache(p)?.chatgptImagePrompt, "JSON gemini image prompt");
    assert.equal(readImagePromptsPayload(p).openai?.chatgptImagePrompt, "Future OpenAI image prompt");
    assert.equal((p.gsc as { mark: string }).mark, "json-newer");
    assert.equal(
      (p.writingPrompts as { openai: { chatgptPrompt: string } }).openai.chatgptPrompt,
      "JSON openai writing",
    );
  } finally {
    process.chdir(previous);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("REGENERATE FAILURE: old Current cache survives provider/F2/write failures", async () => {
  resetAiSeoImagePromptRateLimitForTests();
  const brief = buildImageBrief(draft());
  const fp = fingerprintImageBrief(brief);
  const existing = buildGeminiImagePromptCacheEntry({
    chatgptImagePrompt: "Existing current image prompt",
    imageFingerprint: fp,
    model: "gemini-old",
    generatedAt: "2026-01-01T00:00:00.000Z",
  });
  const mem = memoryCatalog(
    draft({
      id: "seoplan_e2_regen",
      payload: {
        ...(draft().payload as Record<string, unknown>),
        imagePrompts: { gemini: existing },
      },
    }),
  );
  const beforeUpdatedAt = mem.store.updatedAt;

  const providerFail = await generateChatgptImagePromptWithGemini({
    planningDraftId: mem.store.id,
    adminId: "e2-regen-p",
    ip: "10.4.0.1",
    catalog: mem.catalog,
    config: imagePromptConfig(),
    fetchImpl: async () => mockJsonResponse({ error: { status: "UNAVAILABLE" } }, 503),
  });
  assert.equal(providerFail.ok, false);
  assert.equal(
    readGeminiImagePromptCache(mem.store.payload)?.chatgptImagePrompt,
    "Existing current image prompt",
  );
  assert.equal(mem.store.updatedAt, beforeUpdatedAt);

  resetAiSeoImagePromptRateLimitForTests();
  let gets = 0;
  const f2Fail = await generateChatgptImagePromptWithGemini({
    planningDraftId: mem.store.id,
    adminId: "e2-regen-f2",
    ip: "10.4.0.2",
    catalog: {
      ...mem.catalog,
      async getSeoPlanningDraftById(id: string) {
        gets += 1;
        const current = await mem.catalog.getSeoPlanningDraftById(id);
        if (gets >= 2 && current) {
          mem.store = { ...mem.store, topic: "Changed after provider" };
          return { ...current, topic: "Changed after provider" };
        }
        return current;
      },
    },
    config: imagePromptConfig(),
    fetchImpl: async () =>
      mockJsonResponse(geminiSuccessPayload({ chatgptImagePrompt: "Replacement must not save." })),
  });
  assert.equal(f2Fail.ok, false);
  if (!f2Fail.ok) assert.equal(f2Fail.code, "brief_changed");
  // After topic change, fingerprint differs — old cache may still be in payload under old key
  const afterF2 = readGeminiImagePromptCache(mem.store.payload);
  assert.equal(afterF2?.chatgptImagePrompt, "Existing current image prompt");

  // Restore topic for write-boundary test with fresh current cache
  resetAiSeoImagePromptRateLimitForTests();
  const boundary = memoryCatalog(
    draft({
      id: "seoplan_e2_regen_b",
      payload: {
        ...(draft().payload as Record<string, unknown>),
        imagePrompts: { gemini: existing },
      },
    }),
  );
  const beforeB = boundary.store.updatedAt;
  const writeFail = await generateChatgptImagePromptWithGemini({
    planningDraftId: boundary.store.id,
    adminId: "e2-regen-w",
    ip: "10.4.0.3",
    catalog: {
      ...boundary.catalog,
      async mergeSeoPlanningImagePromptCache(args) {
        boundary.store = { ...boundary.store, topic: "Boundary change" };
        return boundary.catalog.mergeSeoPlanningImagePromptCache(args);
      },
    },
    config: imagePromptConfig(),
    fetchImpl: async () =>
      mockJsonResponse(geminiSuccessPayload({ chatgptImagePrompt: "Boundary replacement." })),
  });
  assert.equal(writeFail.ok, false);
  if (!writeFail.ok) assert.equal(writeFail.code, "brief_changed");
  assert.equal(
    readGeminiImagePromptCache(boundary.store.payload)?.chatgptImagePrompt,
    "Existing current image prompt",
  );
  assert.equal(boundary.store.updatedAt, beforeB);

  // Success replaces
  resetAiSeoImagePromptRateLimitForTests();
  const replace = memoryCatalog(
    draft({
      id: "seoplan_e2_regen_ok",
      payload: {
        ...(draft().payload as Record<string, unknown>),
        imagePrompts: { gemini: existing },
      },
    }),
  );
  const replaced = await generateChatgptImagePromptWithGemini({
    planningDraftId: replace.store.id,
    adminId: "e2-regen-ok",
    ip: "10.4.0.4",
    catalog: replace.catalog,
    config: imagePromptConfig(),
    fetchImpl: async () =>
      mockJsonResponse(geminiSuccessPayload({ chatgptImagePrompt: "Replacement image prompt." })),
  });
  assert.equal(replaced.ok, true);
  assert.equal(
    readGeminiImagePromptCache(replace.store.payload)?.chatgptImagePrompt,
    "Replacement image prompt.",
  );
  assert.notEqual(replace.store.updatedAt, existing.generatedAt);
});

test("LIMITER: dedicated image-prompt bucket; does not consume writing-prompt", () => {
  resetAiSeoImagePromptRateLimitForTests();
  resetAiSeoBlogPromptRateLimitForTests();
  for (let i = 0; i < AI_SEO_IMAGE_PROMPT_RATE_LIMITS.burstMax; i += 1) {
    assert.equal(checkAiSeoImagePromptRateLimit("e2-lim", "10.2.0.1").ok, true);
  }
  assert.equal(checkAiSeoImagePromptRateLimit("e2-lim", "10.2.0.1").ok, false);
  assert.equal(checkAiSeoBlogPromptRateLimit("e2-lim", "10.2.0.1").ok, true);
  assert.equal(AI_SEO_IMAGE_PROMPT_RATE_LIMITS.burstMax, 2);
  assert.equal(AI_SEO_IMAGE_PROMPT_RATE_LIMITS.dailyMax, 20);
  assert.equal(AI_SEO_BLOG_PROMPT_RATE_LIMITS.burstMax >= 1, true);
  assert.match(read("lib/cms/ai-seo/rate-limit.ts"), /flix-ai-seo-image-prompt:/);
  assert.match(read("lib/cms/ai-seo/rate-limit.ts"), /flix-ai-seo-blog-prompt:/);
});

test("SAFE ERROR: buildImagePromptInput throw is caught before provider; no raw leak", async () => {
  const src = read("lib/cms/seo-planning/image-prompt.ts");
  assert.match(src, /try \{\s*canonicalInput = buildImagePromptInput\(brief\);\s*\} catch/);
  assert.match(src, /failed_precondition/);
  assert.match(
    src,
    /This image brief cannot be prepared for generation\. Please simplify the planning notes and try again\./,
  );
  assert.doesNotMatch(src, /IMAGE_PROMPT_INPUT_MAX/);

  resetAiSeoImagePromptRateLimitForTests();
  const mem = memoryCatalog(draft({ id: "seoplan_e2_overrun" }));
  let calls = 0;
  const result = await generateChatgptImagePromptWithGemini({
    planningDraftId: mem.store.id,
    adminId: "e2-overrun",
    ip: "10.6.0.1",
    catalog: mem.catalog,
    config: imagePromptConfig(),
    fetchImpl: async () => {
      calls += 1;
      return mockJsonResponse(geminiSuccessPayload({ chatgptImagePrompt: "ok path" }));
    },
  });
  // Normal eligible path still works; catch is proven by source + success path = 1 call.
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  if (result.ok) {
    assert.doesNotMatch(JSON.stringify(result), /IMAGE_PROMPT_INPUT_MAX|stack/);
  }
});

test("UPDATEDAT: success bumps; failures leave unchanged", async () => {
  resetAiSeoImagePromptRateLimitForTests();
  const mem = memoryCatalog(draft({ id: "seoplan_e2_uat", updatedAt: "2026-10-06T01:00:00.000Z" }));
  const before = mem.store.updatedAt;
  const fail = await generateChatgptImagePromptWithGemini({
    planningDraftId: mem.store.id,
    adminId: "e2-uat-f",
    ip: "10.5.0.1",
    catalog: mem.catalog,
    config: imagePromptConfig(),
    fetchImpl: async () => mockJsonResponse({ error: { status: "UNAVAILABLE" } }, 503),
  });
  assert.equal(fail.ok, false);
  assert.equal(mem.store.updatedAt, before);

  resetAiSeoImagePromptRateLimitForTests();
  const ok = await generateChatgptImagePromptWithGemini({
    planningDraftId: mem.store.id,
    adminId: "e2-uat-ok",
    ip: "10.5.0.2",
    catalog: mem.catalog,
    config: imagePromptConfig(),
    fetchImpl: async () =>
      mockJsonResponse(geminiSuccessPayload({ chatgptImagePrompt: "UpdatedAt image prompt." })),
  });
  assert.equal(ok.ok, true);
  assert.notEqual(mem.store.updatedAt, before);
});

test("UI / ACTION / ENV: placement; Generate/Copy; dual Gemini+OpenAI; no media/publish; schema 3", () => {
  const ui = read("components/sidhu/SeoPlanningImagePrompt.tsx");
  const detail = read("components/sidhu/SeoPlanningDetail.tsx");
  const actions = read("lib/cms/seo-planning-actions.ts");
  const page = read("app/sidhu/(protected)/seo/planning/[id]/page.tsx");
  const env = read(".env.example");
  const briefUi = read("components/sidhu/SeoPlanningImageBrief.tsx");

  assert.match(ui, /Generate with Gemini/);
  assert.match(ui, /Generate again with Gemini/);
  assert.match(ui, /Generate with OpenAI/);
  assert.match(ui, /Generate again with OpenAI/);
  assert.match(ui, /Copy Prompt/);
  assert.doesNotMatch(ui, /useEffect\(/);
  assert.doesNotMatch(ui, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(ui, /Cloudinary|MediaAsset|type=["']file["']/);
  assert.doesNotMatch(ui, /\b(onPublish|publishPost|uploadMedia)\b/);
  assert.match(detail, /SeoPlanningImageBrief/);
  assert.match(detail, /SeoPlanningImagePrompt/);
  assert.match(detail, /geminiImagePromptConfigured/);
  assert.match(detail, /openaiImagePromptConfigured/);
  const briefIdx = detail.indexOf("SeoPlanningImageBrief");
  const imagePromptIdx = detail.indexOf("SeoPlanningImagePrompt");
  const workflowIdx = detail.indexOf('h3 className="text-sm font-semibold text-ink">Workflow');
  assert.ok(briefIdx > 0 && imagePromptIdx > briefIdx && workflowIdx > imagePromptIdx);
  assert.match(actions, /generateChatgptImagePromptWithGeminiAction/);
  assert.match(actions, /generateChatgptImagePromptWithOpenAiAction/);
  assert.match(actions, /requireAdminActor\("seo"\)/);
  assert.doesNotMatch(actions, /GEMINI_IMAGE_PROMPT_MODEL|OPENAI_IMAGE_PROMPT_MODEL|apiKey|endpoint/);
  assert.match(page, /geminiImagePromptConfigured|isGeminiImagePromptConfigured/);
  assert.match(page, /openaiImagePromptConfigured|isOpenAiImagePromptConfigured/);
  assert.match(page, /readGeminiImagePromptCache/);
  assert.match(page, /readOpenAiImagePromptCache/);
  assert.match(page, /selectInitialImagePromptProvider/);
  assert.match(env, /^GEMINI_IMAGE_PROMPT_MODEL=$/m);
  assert.match(env, /^OPENAI_IMAGE_PROMPT_MODEL=$/m);
  assert.doesNotMatch(briefUi, /Generate with Gemini/);
  assert.doesNotMatch(read("db/cms-schema.sql"), /image_prompt|imagePrompts/);
  assert.doesNotMatch(read("lib/db/schema.ts"), /image_prompt|imagePrompts/);
  assert.equal(CURRENT_CMS_SCHEMA_VERSION, 3);

  const providerSrc = read("lib/cms/ai-seo/image-prompt-gemini.ts");
  assert.match(providerSrc, /Sidhu AI Image Prompt Assistant/);
  assert.match(providerSrc, /buildGeminiStructuredRequestBody/);
  assert.match(providerSrc, /Do not instruct ChatGPT to render brand names, logos/);
  assert.doesNotMatch(providerSrc, /responseMimeType/);
  assert.match(read("lib/cms/ai-seo/gemini-provider.ts"), /APPLICATION_JSON/);
  const openaiProviderSrc = read("lib/cms/ai-seo/image-prompt-openai.ts");
  assert.match(openaiProviderSrc, /Sidhu AI Image Prompt Assistant/);
  assert.match(openaiProviderSrc, /buildOpenAiStructuredRequestBody/);
  assert.match(openaiProviderSrc, /requestOpenAiStructuredJson/);
  assert.match(openaiProviderSrc, /IMAGE_PROMPT_OPENAI_SCHEMA_NAME/);
  assert.doesNotMatch(openaiProviderSrc, /web_search|tools|image_generation/);
  assert.match(ui, /inFlight/);
});
